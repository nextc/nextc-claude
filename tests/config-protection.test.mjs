// nextc-ecc's config-protection hook.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../nextc-ecc/hooks/scripts/config-protection.js', import.meta.url));
const { run, PROTECTED_FILES } = createRequire(import.meta.url)(SCRIPT);

const payload = (toolInput) => JSON.stringify({ tool_name: 'Edit', tool_input: toolInput });

test('blocks protected config files wherever they live', () => {
  for (const name of ['.eslintrc.json', 'biome.json', 'analysis_options.yaml', '.editorconfig', 'ruff.toml']) {
    assert.equal(run(payload({ file_path: `/proj/sub/${name}` })).exitCode, 2, name);
  }
  assert.ok(PROTECTED_FILES.has('analysis_options.yaml'));
  assert.ok(PROTECTED_FILES.has('.editorconfig'));
});

test('allows ordinary files, including similarly named ones', () => {
  for (const name of ['index.js', 'pyproject.toml', 'analysis_options.yaml.md', 'my.editorconfig.txt']) {
    assert.equal(run(payload({ file_path: `/proj/${name}` })).exitCode, 0, name);
  }
});

test('reads notebook_path for NotebookEdit', () => {
  assert.equal(run(payload({ notebook_path: '/proj/.editorconfig' })).exitCode, 2);
  assert.equal(run(payload({ notebook_path: '/proj/analysis.ipynb' })).exitCode, 0);
});

test('the deny message tells a session with no human what to do', () => {
  const { stderr } = run(payload({ file_path: '/p/.prettierrc' }));
  assert.match(stderr, /ask the user/);
  assert.match(stderr, /mark the step blocked/);
});

test('allows empty or malformed input and refuses truncated input', () => {
  assert.equal(run('').exitCode, 0);
  assert.equal(run('not json').exitCode, 0);
  assert.equal(run('{}').exitCode, 0);
  assert.equal(run('{}', { truncated: true }).exitCode, 2);
});

test('as a process: exit codes, reason on stderr, nothing on stdout', () => {
  for (const [file, want] of [['/p/a.js', 0], ['/p/.editorconfig', 2]]) {
    const r = spawnSync('node', [SCRIPT], { input: payload({ file_path: file }), encoding: 'utf8' });
    assert.equal(r.status, want, file);
    assert.equal(r.stdout, '');
    if (want === 2) assert.match(r.stderr, /^BLOCKED: /);
  }
});
