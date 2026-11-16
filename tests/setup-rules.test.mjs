// setup-rules.sh run against a throwaway HOME; the real home directory is never touched.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = path.join(ROOT, 'setup-rules.sh');
const SHIPPED = JSON.parse(fs.readFileSync(path.join(ROOT, 'settings/user-settings.json'), 'utf8'));
const HAS_JQ = spawnSync('jq', ['--version']).status === 0;

let home;
const claude = (...p) => path.join(home, '.claude', ...p);
const readSettings = () => JSON.parse(fs.readFileSync(claude('settings.json'), 'utf8'));
const writeSettings = (obj) => {
  fs.mkdirSync(claude(), { recursive: true });
  fs.writeFileSync(claude('settings.json'), JSON.stringify(obj, null, 2));
};
const setup = (args = [], env = {}) =>
  spawnSync('/bin/bash', [SCRIPT, '--skip-git-hooks', ...args], { encoding: 'utf8', env: { ...process.env, HOME: home, ...env } });

beforeEach(() => {
  home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'setup-rules-')));
});
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

test('--help prints usage and exits 0 without touching the home directory', () => {
  const r = setup(['--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--check/);
  assert.equal(fs.existsSync(claude()), false);
});

test('an unknown option exits 2', () => {
  assert.equal(setup(['--nope']).status, 2);
});

test('empty home: links both folders and merges every shipped entry', { skip: !HAS_JQ && 'jq not installed' }, () => {
  const r = setup();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readlinkSync(claude('rules', 'nextc-claude')), path.join(ROOT, 'rules/nextc-claude'));
  assert.equal(fs.readlinkSync(claude('nextc-claude-references')), path.join(ROOT, 'rules-references'));
  const s = readSettings();
  assert.deepEqual(s.permissions.allow, SHIPPED.permissions.allow);
  assert.deepEqual(s.permissions.ask, SHIPPED.permissions.ask);
  assert.deepEqual(s.permissions.deny, SHIPPED.permissions.deny);
  assert.deepEqual(s.autoMode.allow, SHIPPED.autoMode.allow);
  assert.equal(s.autoMode.allow[0], '$defaults');
});

test('existing settings keep the user entries, in order, and gain the shipped ones', { skip: !HAS_JQ && 'jq not installed' }, () => {
  writeSettings({
    theme: 'dark',
    permissions: { allow: ['Bash(npm test)'], ask: ['Bash(mine *)', SHIPPED.permissions.ask[0]], deny: ['Read(./secrets/**)'], defaultMode: 'plan' },
    autoMode: { allow: ['my own exception'] },
  });
  assert.equal(setup().status, 0);
  const s = readSettings();
  assert.equal(s.theme, 'dark');
  assert.equal(s.permissions.defaultMode, 'plan');
  assert.deepEqual(s.permissions.allow.slice(0, 1), ['Bash(npm test)']);
  assert.deepEqual(s.permissions.ask.slice(0, 2), ['Bash(mine *)', SHIPPED.permissions.ask[0]]);
  assert.equal(s.permissions.ask.filter((e) => e === SHIPPED.permissions.ask[0]).length, 1);
  assert.deepEqual(s.permissions.deny.slice(0, 1), ['Read(./secrets/**)']);
  for (const e of SHIPPED.permissions.deny) assert.ok(s.permissions.deny.includes(e), e);
  // a user who already owns an autoMode.allow list keeps their choice about "$defaults"
  assert.equal(s.autoMode.allow.includes('$defaults'), false);
  assert.equal(s.autoMode.allow[0], 'my own exception');
  assert.ok(s.autoMode.allow.includes(SHIPPED.autoMode.allow[1]));
  assert.ok(fs.readdirSync(claude()).some((n) => n.startsWith('settings.json.bak.')));
});

test('a second run changes nothing and writes no new backup', { skip: !HAS_JQ && 'jq not installed' }, () => {
  writeSettings({ permissions: { allow: ['Bash(x)'] } });
  setup();
  const first = fs.readFileSync(claude('settings.json'), 'utf8');
  const backups = fs.readdirSync(claude()).filter((n) => n.startsWith('settings.json.bak.'));
  const r = setup();
  assert.equal(r.status, 0);
  assert.match(r.stdout, /already has every entry/);
  assert.equal(fs.readFileSync(claude('settings.json'), 'utf8'), first);
  assert.deepEqual(fs.readdirSync(claude()).filter((n) => n.startsWith('settings.json.bak.')), backups);
});

test('a real directory at the destination is backed up outside rules/', () => {
  fs.mkdirSync(claude('rules', 'nextc-claude'), { recursive: true });
  fs.writeFileSync(claude('rules', 'nextc-claude', 'old.md'), 'old rule');
  assert.equal(setup().status, 0);
  assert.ok(fs.lstatSync(claude('rules', 'nextc-claude')).isSymbolicLink());
  assert.deepEqual(fs.readdirSync(claude('rules')), ['nextc-claude'], 'nothing else may remain in rules/');
  const backups = fs.readdirSync(claude('backups'));
  assert.equal(backups.length, 1);
  assert.match(backups[0], /^nextc-claude\.bak\./);
  assert.equal(fs.readFileSync(claude('backups', backups[0], 'old.md'), 'utf8'), 'old rule');
});

test('a symlink pointing at another checkout is re-pointed', () => {
  fs.mkdirSync(claude('rules'), { recursive: true });
  fs.symlinkSync('/elsewhere', claude('rules', 'nextc-claude'));
  assert.equal(setup().status, 0);
  assert.equal(fs.readlinkSync(claude('rules', 'nextc-claude')), path.join(ROOT, 'rules/nextc-claude'));
});

test('--check on an empty home reports drift, exits 1 and changes nothing', () => {
  const r = setup(['--check']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /is missing \(expected a symlink/);
  assert.equal(fs.existsSync(claude()), false);
});

test('--check passes after setup and reports planted drift', { skip: !HAS_JQ && 'jq not installed' }, () => {
  setup();
  const clean = setup(['--check']);
  assert.equal(clean.status, 0, clean.stdout);
  assert.match(clean.stdout, /No drift found/);

  const s = readSettings();
  s.permissions.deny = s.permissions.deny.filter((e) => e !== 'Read(**/*.pem)');
  writeSettings(s);
  fs.rmSync(claude('nextc-claude-references'));
  fs.symlinkSync('/elsewhere', claude('nextc-claude-references'));
  fs.mkdirSync(claude('plugins'), { recursive: true });
  fs.writeFileSync(
    claude('plugins', 'installed_plugins.json'),
    JSON.stringify({ version: 2, plugins: { 'nextc-ecc@nextc-claude': [{ scope: 'user', version: '0.0.1' }], 'other@elsewhere': [{ version: '9' }] } }),
  );
  const before = fs.readFileSync(claude('settings.json'), 'utf8');
  const r = setup(['--check']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /points at \/elsewhere/);
  assert.match(r.stdout, /missing permissions\.deny entry: Read\(\*\*\/\*\.pem\)/);
  assert.match(r.stdout, /nextc-ecc@nextc-claude installed 0\.0\.1, checkout is/);
  assert.doesNotMatch(r.stdout, /other@elsewhere/);
  assert.equal(fs.readFileSync(claude('settings.json'), 'utf8'), before, '--check must not write');
});

test('--check tolerates an installed_plugins.json of unknown shape', { skip: !HAS_JQ && 'jq not installed' }, () => {
  setup();
  fs.mkdirSync(claude('plugins'), { recursive: true });
  for (const body of ['[1,2]', '"text"', '{"plugins":{"nextc-ecc@nextc-claude":"1.0"}}', 'not json']) {
    fs.writeFileSync(claude('plugins', 'installed_plugins.json'), body);
    const r = setup(['--check']);
    assert.equal(r.status, 0, `${body}\n${r.stdout}${r.stderr}`);
  }
});

test('without jq: the merge is skipped with a hint and --check reports drift', () => {
  const bin = path.join(home, 'bin');
  fs.mkdirSync(bin);
  for (const tool of ['dirname', 'basename', 'date', 'mkdir', 'ln', 'readlink', 'mv', 'cp', 'cat', 'sort', 'git']) {
    const found = spawnSync('which', [tool], { encoding: 'utf8' }).stdout.trim();
    if (found) fs.symlinkSync(found, path.join(bin, tool));
  }
  const env = { PATH: bin };
  const applied = setup([], env);
  assert.equal(applied.status, 0, applied.stderr);
  assert.match(applied.stdout, /jq not found/);
  assert.equal(fs.existsSync(claude('settings.json')), false);
  const checked = setup(['--check'], env);
  assert.equal(checked.status, 1);
  assert.match(checked.stdout, /jq not found — cannot verify/);
});
