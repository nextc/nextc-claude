// scripts/bump-version.mjs against a temp copy of the manifest layout, never the real repo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bumpVersion, run } from '../scripts/bump-version.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/bump-version.mjs', import.meta.url));

function fixture(versions = { core: '1.2.3', ecc: '1.2.3', market: '1.2.3' }) {
  const root = mkdtempSync(join(tmpdir(), 'bump-'));
  mkdirSync(join(root, '.claude-plugin'));
  writeFileSync(join(root, '.claude-plugin', 'marketplace.json'),
    `{\n  "name": "m",\n  "metadata": {\n    "description": "d",\n    "version": "${versions.market}"\n  },\n  "plugins": [{ "name": "nextc-core", "description": "version 9.9.9 in text" }]\n}\n`);
  for (const [dir, v] of [['nextc-core', versions.core], ['nextc-ecc', versions.ecc]]) {
    mkdirSync(join(root, dir, '.claude-plugin'), { recursive: true });
    writeFileSync(join(root, dir, '.claude-plugin', 'plugin.json'), `{\n  "name": "${dir}",\n  "version": "${v}",\n  "keywords": ["x"]\n}\n`);
  }
  mkdirSync(join(root, 'other', '.claude-plugin'), { recursive: true });
  writeFileSync(join(root, 'other', '.claude-plugin', 'plugin.json'), '{ "version": "0.0.1" }');
  return root;
}

const read = (root, ...p) => readFileSync(join(root, ...p), 'utf8');

test('bumpVersion computes patch, minor, major and explicit versions', () => {
  assert.equal(bumpVersion('1.6.16', 'patch'), '1.6.17');
  assert.equal(bumpVersion('1.6.16', 'minor'), '1.7.0');
  assert.equal(bumpVersion('1.6.16', 'major'), '2.0.0');
  assert.equal(bumpVersion('1.6.16', '3.0.1'), '3.0.1');
  assert.throws(() => bumpVersion('1.0.0', 'huge'), /Unknown target/);
});

test('patch bump rewrites the marketplace and every nextc-* manifest, and nothing else', () => {
  const root = fixture();
  const result = run({ root, target: 'patch' });
  assert.equal(result.to, '1.2.4');
  assert.equal(result.changed.length, 3);
  assert.match(read(root, '.claude-plugin', 'marketplace.json'), /"version": "1\.2\.4"/);
  assert.match(read(root, '.claude-plugin', 'marketplace.json'), /version 9\.9\.9 in text/);
  assert.match(read(root, 'nextc-core', '.claude-plugin', 'plugin.json'), /"version": "1\.2\.4"/);
  assert.match(read(root, 'nextc-ecc', '.claude-plugin', 'plugin.json'), /"keywords": \["x"\]/);
  assert.equal(read(root, 'other', '.claude-plugin', 'plugin.json'), '{ "version": "0.0.1" }');
});

test('--dry-run reports the files and writes nothing', () => {
  const root = fixture();
  const before = read(root, 'nextc-core', '.claude-plugin', 'plugin.json');
  const result = run({ root, target: 'minor', dryRun: true });
  assert.equal(result.to, '1.3.0');
  assert.equal(result.changed.length, 3);
  assert.equal(read(root, 'nextc-core', '.claude-plugin', 'plugin.json'), before);
});

test('refuses when versions are out of sync, unless forced', () => {
  const root = fixture({ core: '1.2.3', ecc: '1.2.2', market: '1.2.3' });
  assert.throws(() => run({ root, target: 'patch' }), /out of sync/);
  assert.equal(read(root, 'nextc-ecc', '.claude-plugin', 'plugin.json').includes('1.2.2'), true);
  const forced = run({ root, target: 'patch', force: true });
  assert.equal(forced.to, '1.2.4');
  assert.match(read(root, 'nextc-ecc', '.claude-plugin', 'plugin.json'), /"version": "1\.2\.4"/);
});

test('the command line prints the files changed and exits non-zero on an unknown target', () => {
  const root = fixture();
  const ok = spawnSync('node', [SCRIPT, '2.0.0', '--dry-run', '--root', root], { encoding: 'utf8' });
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /\[dry run\] would bump 1\.2\.3 -> 2\.0\.0/);
  assert.match(ok.stdout, /nextc-core\/\.claude-plugin\/plugin\.json/);
  const bad = spawnSync('node', [SCRIPT, 'huge', '--root', root], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
});
