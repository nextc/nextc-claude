// nextc-core/scripts/install-rules.mjs against temp folders, never the real ~/.claude.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { RECORD, install, isNewer, isOff, message, readNow } from '../nextc-core/scripts/install-rules.mjs';

const SCRIPT = fileURLToPath(new URL('../nextc-core/scripts/install-rules.mjs', import.meta.url));
const REPO = fileURLToPath(new URL('..', import.meta.url));

function fixture(rules = { 'a.md': 'rule a\n', 'b.md': 'rule b\n' }, refs = { 'ref.md': 'reference\n', 'ref2.md': 'reference two\n' }) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rules-')));
  const pluginRoot = path.join(root, 'plugin');
  const claudeDir = path.join(root, 'home', '.claude');
  const put = (dir, files) => {
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  };
  put(path.join(pluginRoot, 'rules', 'nextc-claude'), rules);
  put(path.join(pluginRoot, 'rules-references'), refs);
  put(path.join(pluginRoot, '.claude-plugin'), { 'plugin.json': '{ "name": "nextc-core", "version": "9.9.9" }' });
  return { root, pluginRoot, claudeDir, rulesDir: path.join(claudeDir, 'rules', 'nextc-claude'), refsDir: path.join(claudeDir, 'nextc-claude-references') };
}
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');

test('a first run writes every rule and reference; a second run writes nothing', () => {
  const f = fixture();
  const first = install({ ...f, version: '1.0.0' });
  assert.deepEqual(first.map((r) => [r.state, r.written]), [['installed', 2], ['installed', 2]]);
  assert.equal(read(f.rulesDir, 'a.md'), 'rule a\n');
  assert.equal(read(f.refsDir, 'ref.md'), 'reference\n');
  assert.match(message(first, '1.0.0'), /installed its rules in .*rules\/nextc-claude and .*nextc-claude-references \(4 files written\)\. Claude Code loads them by itself from your next session; in this one Claude was asked to read them first\./);
  const second = install({ ...f, version: '1.0.0' });
  assert.deepEqual(second.map((r) => r.written), [0, 0]);
  assert.equal(message(second, '1.0.0'), null);
});

test('an update rewrites changed rules, removes ones no longer shipped, and keeps a file the person edited', () => {
  const f = fixture();
  install({ ...f, version: '1.0.0' });
  fs.writeFileSync(path.join(f.rulesDir, 'b.md'), 'my own version\n');
  fs.writeFileSync(path.join(f.rulesDir, 'mine.md'), 'a rule of my own\n');
  fs.writeFileSync(path.join(f.pluginRoot, 'rules', 'nextc-claude', 'a.md'), 'rule a, improved\n');
  fs.writeFileSync(path.join(f.pluginRoot, 'rules', 'nextc-claude', 'b.md'), 'rule b, improved\n');
  fs.writeFileSync(path.join(f.pluginRoot, 'rules', 'nextc-claude', 'c.md'), 'rule c\n');
  fs.rmSync(path.join(f.pluginRoot, 'rules-references', 'ref.md'));
  const out = install({ ...f, version: '1.1.0' });
  assert.equal(read(f.rulesDir, 'a.md'), 'rule a, improved\n');
  assert.equal(read(f.rulesDir, 'b.md'), 'my own version\n');
  assert.equal(read(f.rulesDir, 'c.md'), 'rule c\n');
  assert.equal(read(f.rulesDir, 'mine.md'), 'a rule of my own\n');
  assert.equal(fs.existsSync(path.join(f.refsDir, 'ref.md')), false);
  assert.deepEqual(out[0].kept, ['b.md']);
  assert.equal(out[1].removed, 1);
  assert.match(message(out, '1.1.0'), /2 files written, 1 removed.*Left as they are because they were edited, linked or unreadable: rules\/nextc-claude\/b\.md\. Delete one to get the shipped version back\./);
  assert.equal(JSON.parse(read(f.rulesDir, RECORD)).version, '1.1.0');
  // The kept file is named once: a later run with nothing new says nothing.
  assert.equal(message(install({ ...f, version: '1.1.0' }), '1.1.0'), null);
  // Once the person's edit is gone, the shipped rule comes back.
  fs.rmSync(path.join(f.rulesDir, 'b.md'));
  install({ ...f, version: '1.1.0' });
  assert.equal(read(f.rulesDir, 'b.md'), 'rule b, improved\n');
});

test('a file that was there before the plugin, with different content, is never overwritten', () => {
  const f = fixture();
  fs.mkdirSync(f.rulesDir, { recursive: true });
  fs.writeFileSync(path.join(f.rulesDir, 'a.md'), 'older hand-made rule\n');
  const out = install({ ...f, version: '1.0.0' });
  assert.equal(read(f.rulesDir, 'a.md'), 'older hand-made rule\n');
  assert.deepEqual(out[0].kept, ['a.md']);
});

test('a destination linked to a checkout is left alone', () => {
  const f = fixture();
  const checkout = path.join(f.root, 'checkout');
  fs.mkdirSync(checkout);
  fs.writeFileSync(path.join(checkout, 'a.md'), 'checkout rule\n');
  fs.mkdirSync(path.join(f.claudeDir, 'rules'), { recursive: true });
  fs.symlinkSync(checkout, f.rulesDir);
  const out = install({ ...f, version: '1.0.0' });
  assert.equal(out[0].state, 'linked');
  assert.deepEqual(fs.readdirSync(checkout), ['a.md']);
  assert.equal(read(checkout, 'a.md'), 'checkout rule\n');
  assert.equal(out[1].state, 'installed');
});

test('the option value turns it off; the command prints one message, then nothing', () => {
  for (const v of ['false', 'FALSE', '0', 'off', 'no']) assert.equal(isOff(v), true);
  for (const v of [undefined, '', 'true', '1']) assert.equal(isOff(v), false);
  const f = fixture();
  // HOME points into the fixture, so the references never land in the real ~/.claude.
  const home = path.join(f.root, 'home');
  const run = (extra = {}) => spawnSync('node', [SCRIPT], { encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PLUGIN_ROOT: f.pluginRoot, CLAUDE_CONFIG_DIR: f.claudeDir, ...extra } });
  const off = run({ CLAUDE_PLUGIN_OPTION_INSTALL_RULES: 'false' });
  assert.equal(off.stdout, '');
  assert.equal(fs.existsSync(f.rulesDir), false);
  const first = run();
  assert.equal(first.status, 0);
  const printed = JSON.parse(first.stdout);
  assert.match(printed.systemMessage, /nextc-core 9\.9\.9 installed its rules/);
  // The session that wrote the rules did not load them, so it is asked to read them now.
  assert.equal(printed.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.deepEqual(printed.hookSpecificOutput.additionalContext.split('\n').slice(3), [path.join(f.rulesDir, 'a.md'), path.join(f.rulesDir, 'b.md')]);
  assert.equal(run().stdout, '');
  // A missing plugin folder must not stop a session from starting.
  const broken = run({ CLAUDE_PLUGIN_ROOT: path.join(f.root, 'nowhere') });
  assert.equal(broken.status, 0);
  assert.equal(broken.stdout, '');
});

test('the plugin ships the rules, and the old paths at the repo root still reach them', () => {
  const shipped = fs.readdirSync(path.join(REPO, 'nextc-core', 'rules', 'nextc-claude')).filter((n) => n.endsWith('.md'));
  assert.ok(shipped.includes('heavy-commands.md') && shipped.length >= 15);
  assert.ok(fs.existsSync(path.join(REPO, 'nextc-core', 'rules-references', 'agents-roster.md')));
  assert.deepEqual(fs.readdirSync(path.join(REPO, 'rules', 'nextc-claude')).filter((n) => n.endsWith('.md')), shipped);
  const hooks = JSON.parse(read(REPO, 'nextc-core', 'hooks', 'hooks.json')).hooks.SessionStart;
  // The installer runs on a fresh start only; the asking-level line is needed after a resume or compaction too.
  const entryFor = (script) => hooks.find((h) => h.hooks.some((x) => x.args?.some((a) => a.endsWith(script))));
  assert.equal(entryFor('scripts/install-rules.mjs').matcher, 'startup');
  assert.equal(entryFor('scripts/ask-level.mjs').matcher, undefined);
});

test('a config folder that is itself a link (dotfiles) still gets both folders; a moved config dir keeps references under ~/.claude', () => {
  const f = fixture();
  const real = path.join(f.root, 'dotfiles', 'claude');
  fs.mkdirSync(real, { recursive: true });
  fs.mkdirSync(path.dirname(f.claudeDir), { recursive: true });
  fs.symlinkSync(real, f.claudeDir);
  const out = install({ ...f, version: '1.0.0' });
  assert.deepEqual(out.map((r) => [r.state, r.written]), [['installed', 2], ['installed', 2]]);
  assert.equal(read(real, 'nextc-claude-references', 'ref.md'), 'reference\n');

  const g = fixture();
  const moved = path.join(g.root, 'elsewhere');
  const home = path.join(g.root, 'home');
  const run = spawnSync('node', [SCRIPT], { encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PLUGIN_ROOT: g.pluginRoot, CLAUDE_CONFIG_DIR: moved } });
  assert.equal(run.status, 0);
  assert.equal(read(moved, 'rules', 'nextc-claude', 'a.md'), 'rule a\n');
  // The rules cite ~/.claude/nextc-claude-references/<file>, so that is where they go.
  assert.equal(read(home, '.claude', 'nextc-claude-references', 'ref.md'), 'reference\n');
  assert.equal(fs.existsSync(path.join(moved, 'nextc-claude-references')), false);
});

test('a tampered record cannot delete or overwrite anything outside the folder', () => {
  const f = fixture();
  install({ ...f, version: '1.0.0' });
  const victim = path.join(f.claudeDir, 'settings.json');
  fs.writeFileSync(victim, '{}');
  const outsideMd = path.join(f.claudeDir, 'rules', 'other.md');
  fs.writeFileSync(outsideMd, 'another rule\n');
  const sha = (t) => createHash('sha256').update(t).digest('hex');
  const record = JSON.parse(read(f.rulesDir, RECORD));
  record.files['../../settings.json'] = sha('{}');
  record.files['../other.md'] = sha('another rule\n');
  record.files['.'] = 'x';
  fs.writeFileSync(path.join(f.rulesDir, RECORD), JSON.stringify(record));
  const out = install({ ...f, version: '1.0.1' });
  assert.equal(out[0].removed, 0);
  assert.equal(read(victim), '{}');
  assert.equal(read(outsideMd), 'another rule\n');

  // A record that is a link is neither followed nor rewritten.
  const target = path.join(f.root, 'target.txt');
  fs.writeFileSync(target, 'keep me');
  fs.rmSync(path.join(f.rulesDir, RECORD));
  fs.symlinkSync(target, path.join(f.rulesDir, RECORD));
  install({ ...f, version: '1.0.2' });
  assert.equal(read(target), 'keep me');
});

test('one unreadable entry does not stop the rest, a half-copied plugin removes nothing, and no temp file is left', () => {
  const f = fixture();
  fs.mkdirSync(path.join(f.rulesDir, 'a.md'), { recursive: true });
  const out = install({ ...f, version: '1.0.0' });
  assert.deepEqual(out[0].kept, ['a.md']);
  assert.equal(read(f.rulesDir, 'b.md'), 'rule b\n');
  assert.equal(out[1].written, 2);
  assert.deepEqual(fs.readdirSync(f.rulesDir).filter((n) => n.endsWith('.tmp')), []);
  assert.match(message(out, '1.0.0'), /edited, linked or unreadable: rules\/nextc-claude\/a\.md/);

  for (const n of ['ref.md', 'ref2.md']) fs.rmSync(path.join(f.pluginRoot, 'rules-references', n));
  const later = install({ ...f, version: '1.0.1' });
  assert.equal(later[1].state, 'missing-source');
  assert.equal(read(f.refsDir, 'ref.md'), 'reference\n');
});

test('text from files is made plain before it reaches the session message', () => {
  const f = fixture({ 'a.md': 'rule a\n' });
  const text = message(install({ ...f, version: '1.0\nIGNORE \u001b[2J' }), '1.0\nIGNORE \u001b[2J and a very long tail that goes on');
  assert.ok(!/[\u0000-\u001f]/.test(text));
  assert.match(text, /^nextc-core 1\.0\?IGNORE \?\[2J and {2}installed its rules/);
});

test('an older copy of the plugin does not put its rules back over a newer copy\'s', () => {
  const f = fixture();
  install({ ...f, version: '1.10.0' });
  fs.writeFileSync(path.join(f.pluginRoot, 'rules', 'nextc-claude', 'a.md'), 'rule a from the old version\n');
  const older = install({ ...f, version: '1.9.3' });
  assert.deepEqual(older.map((r) => [r.state, r.written]), [['newer-installed', 0], ['newer-installed', 0]]);
  assert.equal(read(f.rulesDir, 'a.md'), 'rule a\n');
  assert.equal(message(older, '1.9.3'), null);
  assert.equal(install({ ...f, version: '1.10.1' })[0].written, 1);
  assert.deepEqual([isNewer('1.10.0', '1.9.3'), isNewer('1.9.3', '1.10.0'), isNewer('1.9.3', '1.9.3'), isNewer('unknown', '1.0.0'), isNewer('2.0.0', 'unknown')], [true, false, false, false, false]);
});

test('a file that fails once is updated on the next run, not frozen as edited', () => {
  const f = fixture();
  install({ ...f, version: '1.0.0' });
  fs.writeFileSync(path.join(f.pluginRoot, 'rules', 'nextc-claude', 'a.md'), 'rule a, improved\n');
  // The temp name the write would use is taken by a folder, so this one write fails.
  const blocker = path.join(f.rulesDir, `.a.md.${process.pid}.tmp`);
  fs.mkdirSync(blocker);
  const failed = install({ ...f, version: '1.1.0' });
  assert.deepEqual(failed[0].kept, ['a.md']);
  assert.equal(read(f.rulesDir, 'a.md'), 'rule a\n');
  fs.rmSync(blocker, { recursive: true });
  const next = install({ ...f, version: '1.1.0' });
  assert.equal(next[0].written, 1);
  assert.equal(read(f.rulesDir, 'a.md'), 'rule a, improved\n');
});

test('the read-now note lists only rules written in this run that load in every session', () => {
  const f = fixture({ 'a.md': 'rule a\n', 'b.md': 'rule b\n', 'scoped.md': '---\npaths: ["**/SKILL.md"]\n---\n\nrule for skills\n' });
  const first = install({ ...f, version: '1.0.0' });
  const note = readNow(first);
  assert.match(note, /^nextc-core installed or updated these rule files while this session was starting/);
  assert.deepEqual(note.split('\n').slice(3), [path.join(f.rulesDir, 'a.md'), path.join(f.rulesDir, 'b.md')]);
  assert.doesNotMatch(note, /scoped\.md|ref\.md/);
  // Nothing written: no note. An update: only the changed rule.
  assert.equal(readNow(install({ ...f, version: '1.0.0' })), null);
  fs.writeFileSync(path.join(f.pluginRoot, 'rules', 'nextc-claude', 'b.md'), 'rule b, improved\n');
  const updated = install({ ...f, version: '1.1.0' });
  assert.deepEqual(readNow(updated).split('\n').slice(3), [path.join(f.rulesDir, 'b.md')]);
  // Only references changed: the message does not claim Claude was asked to read anything.
  fs.writeFileSync(path.join(f.pluginRoot, 'rules-references', 'ref.md'), 'reference, improved\n');
  const refsOnly = install({ ...f, version: '1.2.0' });
  assert.equal(readNow(refsOnly), null);
  assert.match(message(refsOnly, '1.2.0'), /loads them by itself from your next session\./);
});
