// nextc-claude-toolbox validator, run against small fixture marketplaces built in temp dirs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const VALIDATOR = fileURLToPath(new URL('../nextc-claude-toolbox/scripts/validate.js', import.meta.url));

function write(root, rel, content) {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

// Builds a one-plugin marketplace ("fx") with the given extra files.
function fixture(files, { roster } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'validate-fixture-'));
  write(root, '.claude-plugin/marketplace.json', JSON.stringify({
    name: 'fx-market', metadata: { version: '1.0.0' },
    plugins: [{ name: 'fx', source: './fx' }],
  }));
  write(root, 'fx/.claude-plugin/plugin.json', JSON.stringify({ name: 'fx', version: '1.0.0' }));
  for (const [rel, content] of Object.entries(files)) write(root, join('fx', rel), content);
  if (roster) write(root, 'rules-references/agents-roster.md', roster);
  return root;
}

function validate(root, extra = []) {
  const run = spawnSync('node', [VALIDATOR, '--root', root, '--json', ...extra], { encoding: 'utf8' });
  const parsed = JSON.parse(run.stdout);
  return { code: run.status, ...parsed, table: spawnSync('node', [VALIDATOR, '--root', root, ...extra], { encoding: 'utf8' }).stdout };
}

const find = (r, id, level) => r.results.filter(x => x.id === id && (!level || x.level === level));

function withFixture(files, opts, fn) {
  const root = fixture(files, opts);
  try { return fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

const AGENT = (extra = '') => `---\nname: worker\ndescription: Does work.\ntools: ["Read", "SendMessage"]\nmodel: sonnet\neffort: high\n${extra}---\nBody.\n`;

test('a clean agent and skill pass without failures', () => {
  withFixture({
    'agents/worker.md': AGENT(),
    'skills/doit/SKILL.md': '---\nname: doit\ndescription: Does it. Use when asked.\n---\nBody.\n',
  }, {}, (root) => {
    const r = validate(root);
    assert.equal(r.summary.fail, 0);
    assert.equal(r.code, 0);
  });
});

test('agent without effort fails (A08)', () => {
  withFixture({ 'agents/worker.md': '---\nname: worker\ndescription: d\ntools: ["SendMessage"]\nmodel: sonnet\n---\nx\n' }, {}, (root) => {
    assert.equal(find(validate(root), 'A08', 'FAIL').length, 1);
  });
});

test('agent whose tools omit SendMessage fails (A10); omitted tools field is fine', () => {
  withFixture({
    'agents/worker.md': '---\nname: worker\ndescription: d\ntools: ["Read"]\nmodel: sonnet\neffort: high\n---\nx\n',
    'agents/open.md': '---\nname: open\ndescription: d\nmodel: sonnet\neffort: high\n---\nx\n',
  }, {}, (root) => {
    const fails = find(validate(root), 'A10', 'FAIL');
    assert.deepEqual(fails.map(f => f.name), ['worker']);
  });
});

test('skill description checks run in normal mode: missing "Use when" and over 1024 chars', () => {
  withFixture({
    'skills/a/SKILL.md': '---\nname: a\ndescription: Does a thing.\n---\nx\n',
    'skills/b/SKILL.md': `---\nname: b\ndescription: Use when ${'x'.repeat(1100)}\n---\nx\n`,
  }, {}, (root) => {
    const warns = find(validate(root), 'S13', 'WARN');
    assert.equal(warns.filter(w => w.name === 'a').length, 1);
    assert.equal(warns.filter(w => w.name === 'b').length, 1);
  });
});

test('hooks.json modules: existing .tsx passes, missing file and bad extension fail', () => {
  withFixture({
    'hooks/hooks.json': JSON.stringify({ modules: ['./register.tsx'] }),
    'hooks/register.tsx': 'export const register = () => {};\n',
  }, {}, (root) => {
    const r = validate(root);
    assert.equal(find(r, 'H08', 'FAIL').length, 0);
    assert.equal(find(r, 'H02', 'FAIL').length, 0);
  });
  withFixture({ 'hooks/hooks.json': JSON.stringify({ modules: ['./gone.ts', './x.py'] }) }, {}, (root) => {
    assert.equal(find(validate(root), 'H08', 'FAIL').length, 2);
  });
});

test('hook command referencing a .mjs script that is missing warns (H05)', () => {
  withFixture({
    'hooks/hooks.json': JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [
      { type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/guard.mjs"' }] }] } }),
  }, {}, (root) => {
    assert.equal(find(validate(root), 'H05', 'WARN').length, 1);
  });
});

test('workflow scripts must start with export const meta =', () => {
  withFixture({
    'workflows/good.js': '// a comment\nexport const meta = { name: "good" };\n',
    'workflows/bad.js': 'const meta = {};\n',
  }, {}, (root) => {
    const r = validate(root);
    assert.deepEqual(find(r, 'W01', 'FAIL').map(x => x.name), ['bad.js']);
    assert.deepEqual(find(r, 'W01', 'PASS').map(x => x.name), ['good.js']);
  });
});

test('plugin.json engines must map names to strings (P06)', () => {
  const root = fixture({});
  try {
    write(root, 'fx/.claude-plugin/plugin.json', JSON.stringify({ name: 'fx', version: '1.0.0', engines: ['claude'] }));
    assert.equal(find(validate(root), 'P06', 'FAIL').length, 1);
    write(root, 'fx/.claude-plugin/plugin.json', JSON.stringify({ name: 'fx', version: '1.0.0', engines: { claude: '>=2.0.0' } }));
    assert.equal(find(validate(root), 'P06', 'FAIL').length, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('reporter counts items, not check results', () => {
  withFixture({
    'agents/worker.md': AGENT(),
    'skills/doit/SKILL.md': '---\nname: doit\ndescription: Does it. Use when asked.\n---\nBody.\n',
  }, {}, (root) => {
    const r = validate(root);
    assert.match(r.table, /fx \(1 skills, 1 agents, 1 manifests\)/);
  });
});

const ROSTER = `# Roster\n\n## Model + effort assignments\n\n| Agent | Model | Effort |\n|---|---|---|\n| \`worker\` | haiku | medium |\n| \`ghost\` | sonnet | high |\n\n## Other\n`;

test('roster: model/effort mismatch and roster entries without a file warn', () => {
  withFixture({ 'agents/worker.md': AGENT() }, { roster: ROSTER }, (root) => {
    const r = validate(root);
    assert.equal(find(r, 'A07', 'WARN').length, 1);
    assert.equal(find(r, 'A11', 'WARN').length, 1);
    assert.deepEqual(find(r, 'A12', 'WARN').map(x => x.name), ['ghost']);
  });
});

test('flags {{ARGUMENTS}}, legacy Task( spawns, and built-in Agent( spawns without model', () => {
  const body = [
    'Task: {{ARGUMENTS}}',
    '```',
    'Task(subagent_type="general-purpose", prompt="x")',
    'Agent(subagent_type: "Explore", prompt: "no model here")',
    'Agent(subagent_type: "general-purpose", model: "haiku", prompt: "fine")',
    'Agent(subagent_type: "fx:worker", prompt: "custom agent defines its own model")',
    '```',
  ].join('\n');
  withFixture({ 'skills/s/SKILL.md': `---\nname: s\ndescription: S. Use when asked.\n---\n${body}\n` }, {}, (root) => {
    const r = validate(root);
    assert.equal(find(r, 'K01', 'WARN').length, 1);
    assert.equal(find(r, 'K02', 'WARN').length, 1);
    const k03 = find(r, 'K03', 'WARN');
    assert.equal(k03.length, 1);
    assert.match(k03[0].message, /Explore/);
  });
});
