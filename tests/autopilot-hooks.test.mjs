// Guard, Stop and ledger modes of nextc-core/scripts/autopilot-hooks.mjs, run as Claude Code runs them
// (a separate process per call, JSON on stdin), plus the pure decisions they are built from.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatLedgerEntry, nextLedgerNumber, parseFieldLines, readDeciderCount } from '../nextc-core/scripts/autopilot-hooks.mjs';

const HOOKS = fileURLToPath(new URL('../nextc-core/scripts/autopilot-hooks.mjs', import.meta.url));

function fixture({ approved = {} } = {}) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-hooks-')));
  const clone = path.join(base, 'clone');
  const state = path.join(base, 'state');
  fs.mkdirSync(path.join(clone, 'run'), { recursive: true });
  fs.mkdirSync(path.join(base, 'outside'));
  fs.mkdirSync(state);
  fs.symlinkSync('../outside', path.join(clone, 'esc'));
  execFileSync('git', ['init', '--quiet', clone]);
  for (const [name, value] of [['p', 'push'], ['sp', '!git status && git push'], ['st', 'status']]) {
    execFileSync('git', ['-C', clone, 'config', `alias.${name}`, value]);
  }
  fs.writeFileSync(path.join(state, 'approved.json'), JSON.stringify(approved));
  return { base, clone, state, run: path.join(clone, 'run') };
}

function hook(fx, mode, input, { runDir = fx.run, args = [], stdin } = {}) {
  const env = { ...process.env, AUTOPILOT_ROOT: fx.clone, AUTOPILOT_RUN_DIR: runDir, AUTOPILOT_STATE_DIR: fx.state };
  return execFileSync('node', [HOOKS, mode, ...args], { env, input: stdin ?? JSON.stringify(input), encoding: 'utf8' });
}

const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });
const write = (file_path) => ({ tool_name: 'Write', tool_input: { file_path } });
const agent = (input) => ({ tool_name: 'Agent', tool_input: { prompt: 'x', description: 'x', run_in_background: false, ...input } });
const denied = (out) => out.includes('"deny"');
const reasonOf = (out) => JSON.parse(out).hookSpecificOutput.permissionDecisionReason;
const setState = (fx, state) => fs.writeFileSync(path.join(fx.run, 'state.json'), JSON.stringify(state));

test('guard runs as a hook: denies with the PreToolUse JSON and resolves git aliases from the clone', () => {
  const fx = fixture();
  assert.equal(denied(hook(fx, 'guard', bash('git p'), { runDir: fx.clone })), true);
  assert.equal(denied(hook(fx, 'guard', bash('git st'), { runDir: fx.clone })), false);
  assert.match(reasonOf(hook(fx, 'guard', bash('git push'))), /hard stop/);
});

test('guard fails closed when its environment is missing', () => {
  const r = spawnSync('node', [HOOKS, 'guard'], { env: { PATH: process.env.PATH }, input: JSON.stringify(bash('ls')), encoding: 'utf8' });
  assert.equal(denied(r.stdout), true);
  assert.match(reasonOf(r.stdout), /guard hook failed/);
});

function deployFixture(step) {
  const fx = fixture({ approved: { deploys: [{ step: 'S3', commands: ['npm run deploy:docs', 'npm run rollback:docs'], scripts: ['scripts/deploy-docs.sh', 'scripts/rollback-docs.sh'] }] } });
  setState(fx, { steps: [{ id: 'S1', status: 'done' }, { id: 'S3', kind: 'deploy', ...step }] });
  return fx;
}

const DEPLOY_RUNS = (clone) => [
  'npm run deploy:docs', 'npm run rollback:docs', 'timeout 60 npm run deploy:docs', 'bash -c "npm run rollback:docs"',
  'sh scripts/deploy-docs.sh', './scripts/deploy-docs.sh', 'cd scripts && ./deploy-docs.sh', `sh ${clone}/scripts/rollback-docs.sh`,
  'npm test && npm run deploy:docs', '. scripts/deploy-docs.sh', 'if true; then npm run deploy:docs; fi',
];

test('guard refuses a deploy step\'s commands and scripts before its check passes', () => {
  for (const step of [{ status: 'pending', gate: null }, { status: 'in_progress', gate: null }, { status: 'pending', gate: 'pass' }]) {
    const fx = deployFixture(step);
    for (const c of DEPLOY_RUNS(fx.clone)) assert.equal(denied(hook(fx, 'guard', bash(c))), true, `${JSON.stringify(step)}: ${c}`);
  }
});

test('guard allows reading deploy scripts, other npm scripts, and a ledger heredoc that names the deploy', () => {
  const fx = deployFixture({ status: 'in_progress', gate: null });
  for (const c of ['cat scripts/deploy-docs.sh', 'grep -n rm scripts/rollback-docs.sh', 'sh -n scripts/deploy-docs.sh', 'npm test', 'npm run deploy', 'ls site site.previous',
    "cat >> ledger.md <<'EOF'\n### [9] DEPLOY S3: npm run deploy:docs, it's gated\nEOF"]) {
    assert.equal(denied(hook(fx, 'guard', bash(c))), false, c);
  }
});

test('guard allows the deploy once the step is in progress with gate pass', () => {
  const fx = deployFixture({ status: 'in_progress', gate: 'pass' });
  for (const c of DEPLOY_RUNS(fx.clone)) assert.equal(denied(hook(fx, 'guard', bash(c))), false, c);
});

test('guard keeps file tools inside the clone and away from git and Claude Code config', () => {
  const fx = fixture();
  const R = fx.clone;
  const cases = [
    ['in clone', write(`${R}/src/a.js`), false],
    ['relative', write('src/a.js'), true],
    ['dotdot', write(`${R}/../x`), true],
    ['tilde', write('~/x'), true],
    ['symlink out', write(`${R}/esc/x`), true],
    ['prefix trick', write(`${R}x/a`), true],
    ['.claude', write(`${R}/.claude/settings.json`), true],
    ['.git config', write(`${R}/.git/config`), true],
    ['.git hook', write(`${R}/.git/hooks/pre-commit`), true],
    ['.mcp.json', write(`${R}/.mcp.json`), true],
    ['Read anywhere', { tool_name: 'Read', tool_input: { file_path: '/etc/hosts' } }, false],
  ];
  for (const [name, input, want] of cases) assert.equal(denied(hook(fx, 'guard', input)), want, name);
});

test('after STOP only the run folder can be written and the Stop hook lets the run end', () => {
  const fx = fixture();
  fs.writeFileSync(path.join(fx.state, 'STOP'), '');
  assert.equal(denied(hook(fx, 'guard', bash('ls'))), true, 'Bash');
  assert.equal(denied(hook(fx, 'guard', agent({ subagent_type: 'general-purpose' }))), true, 'Agent');
  assert.equal(denied(hook(fx, 'guard', write(`${fx.run}/report.md`))), false, 'run-dir write');
  assert.equal(denied(hook(fx, 'guard', write(`${fx.clone}/src/a.js`))), true, 'src write');
  assert.equal(hook(fx, 'stop', {}).includes('block'), false, 'stop hook');
});

test('guard keeps every subagent in the foreground, including ones a worker starts', () => {
  const fx = fixture();
  assert.match(reasonOf(hook(fx, 'guard', agent({ subagent_type: 'general-purpose', run_in_background: undefined }))), /run_in_background: false/);
  assert.equal(denied(hook(fx, 'guard', agent({ subagent_type: 'general-purpose', run_in_background: true }))), true);
  assert.equal(denied(hook(fx, 'guard', { ...agent({ subagent_type: 'nextc-ecc:code-reviewer', run_in_background: true }), agent_id: 'w1', agent_type: 'general-purpose' })), true);
  assert.equal(denied(hook(fx, 'guard', agent({ subagent_type: 'general-purpose', model: 'sonnet' }))), false);
});

test('decider calls are capped per run, with one warning at 80%, and the count survives relaunches', () => {
  const fx = fixture({ approved: { deciderCap: 5 } });
  setState(fx, { steps: [{ id: 'S1', status: 'in_progress' }] });
  const call = () => hook(fx, 'guard', agent({ subagent_type: 'nextc-core:autopilot-decider', model: 'fable' }));
  for (let i = 1; i <= 3; i++) assert.equal(denied(call()), false, `call ${i}`);
  const warn = call();
  assert.match(reasonOf(warn), /call 4 of 5.*WARN ledger entry.*repeat this exact call/s);
  assert.equal(denied(call()), false, 'call 4 after the warning');
  // A relaunch is a new process with the same state folder.
  assert.equal(readDeciderCount(fx.state).used, 4);
  assert.equal(denied(call()), false, 'call 5');
  const capped = call();
  assert.match(reasonOf(capped), /cap is reached \(5\/5 calls this run\).*Do not stop the run.*NODECIDER/s);
  assert.equal(readDeciderCount(fx.state).used, 5, 'a denied call is not counted');
  assert.equal((fs.statSync(path.join(fx.state, 'decider-calls.json')).mode & 0o777).toString(8), '600');
});

test('decider fallback: Opus only after a recorded fallback, and then Opus for the rest of the run', () => {
  const fx = fixture();
  setState(fx, { steps: [] });
  const call = (model) => hook(fx, 'guard', agent({ subagent_type: 'nextc-core:autopilot-decider', model }));
  assert.match(reasonOf(call('opus')), /record the fallback/);
  assert.equal(denied(call('sonnet')), true);
  setState(fx, { steps: [], deciderModel: 'opus' });
  assert.match(reasonOf(call('fable')), /fell back to Opus/);
  assert.equal(denied(call('opus')), false);
});

test('end of run order: doc-keeper only after every step, report only after docs', () => {
  const fx = fixture();
  setState(fx, { steps: [{ id: 'S1', status: 'done' }, { id: 'S2', status: 'pending' }] });
  assert.match(reasonOf(hook(fx, 'guard', agent({ subagent_type: 'nextc-core:doc-keeper' }))), /after every step/);
  assert.match(reasonOf(hook(fx, 'guard', write(`${fx.run}/report.md`))), /after every step/);
  setState(fx, { steps: [{ id: 'S1', status: 'done' }, { id: 'S2', status: 'blocked' }] });
  assert.equal(denied(hook(fx, 'guard', agent({ subagent_type: 'nextc-core:doc-keeper' }))), false);
  assert.match(reasonOf(hook(fx, 'guard', write(`${fx.run}/report.md`))), /doc-keeper/);
  setState(fx, { steps: [{ id: 'S1', status: 'done' }, { id: 'S2', status: 'blocked' }], docs: 'done' });
  assert.equal(denied(hook(fx, 'guard', write(`${fx.run}/report.md`))), false);
});

test('Stop hook blocks with open steps, but not twice with no progress', () => {
  const fx = fixture();
  setState(fx, { steps: [{ id: 'S1', status: 'done' }, { id: 'S2', status: 'pending' }] });
  assert.equal(hook(fx, 'stop', { stop_hook_active: false }).includes('block'), true, 'first block');
  assert.equal(hook(fx, 'stop', { stop_hook_active: true }).includes('block'), false, 'no loop');
  assert.equal((fs.statSync(path.join(fx.state, 'stop-hook.json')).mode & 0o777).toString(8), '600', 'mark file mode');
});

test('Stop hook blocks an in_progress step with no live worker, and sends the run to the Resume rules', () => {
  const fx = fixture();
  setState(fx, { steps: [{ id: 'S1', status: 'in_progress' }, { id: 'S2', status: 'pending' }] });
  const out = hook(fx, 'stop', { stop_hook_active: false, background_tasks: [] });
  assert.match(JSON.parse(out).reason, /S1 is in_progress but no worker is running.*Resume/s);
});

test('Stop hook lets the turn end while a subagent really is running in the background', () => {
  const fx = fixture();
  setState(fx, { steps: [{ id: 'S1', status: 'in_progress' }] });
  const input = { stop_hook_active: false, background_tasks: [{ id: 't1', type: 'subagent', status: 'running', agent_type: 'general-purpose' }] };
  assert.equal(hook(fx, 'stop', input).includes('block'), false);
});

test('Stop hook keeps the run going until doc-keeper ran and the report exists', () => {
  const fx = fixture();
  setState(fx, { steps: [{ id: 'S1', status: 'done' }, { id: 'S2', status: 'blocked' }] });
  assert.match(JSON.parse(hook(fx, 'stop', {})).reason, /run doc-keeper once/);
  setState(fx, { steps: [{ id: 'S1', status: 'done' }, { id: 'S2', status: 'blocked' }], docs: 'done' });
  assert.match(JSON.parse(hook(fx, 'stop', {})).reason, /report\.md is missing/);
  fs.writeFileSync(path.join(fx.run, 'report.md'), '# report\n');
  assert.equal(hook(fx, 'stop', {}).includes('block'), false);
});

test('Stop hook lets a run with nothing done end without doc-keeper', () => {
  const fx = fixture();
  setState(fx, { steps: [{ id: 'S1', status: 'blocked' }, { id: 'S2', status: 'hard-stop' }] });
  fs.writeFileSync(path.join(fx.run, 'report.md'), '# report\n');
  assert.equal(hook(fx, 'stop', {}).includes('block'), false);
});

test('ledger writer numbers entries, stamps real UTC time and refuses incomplete Q entries', () => {
  const fx = fixture();
  fs.writeFileSync(path.join(fx.run, 'ledger.md'), '# Autopilot run r1\n\n### [7] old entry\n');
  const head = hook(fx, 'ledger', null, { args: ['start', 'S2', 'add the parser'], stdin: '' });
  assert.match(head, /^### \[8\] \d{4}-\d\d-\d\dT\d\d:\d\dZ start S2: add the parser$/m);
  const stamp = Date.parse(head.match(/\] (\S+) /)[1]);
  assert.ok(Math.abs(Date.now() - stamp) < 120000, 'timestamp is now');
  const q = spawnSync('node', [HOOKS, 'ledger', 'Q', 'S2', 'which error shape?', 'Asked-by=worker'], { env: { ...process.env, AUTOPILOT_RUN_DIR: fx.run }, encoding: 'utf8', input: '' });
  assert.equal(q.status, 1);
  assert.match(q.stderr, /needs Options, Context, Lean, Answer/);
  hook(fx, 'ledger', null, { args: ['NODECIDER', 'S2', 'error shape', '-'], stdin: 'Question: which error shape?\nLean: { error: string }\nWhy: decider cap reached\n' });
  const text = fs.readFileSync(path.join(fx.run, 'ledger.md'), 'utf8');
  assert.match(text, /### \[9\] \S+ NODECIDER S2: error shape\n- Question: which error shape\?\n- Lean: \{ error: string \}\n- Why: decider cap reached\n- Review: yes/);
});

test('ledger helpers: numbering, field lines, required fields', () => {
  assert.equal(nextLedgerNumber('### [3] a\n### [end] x\n### [12] b\n'), 13);
  assert.deepEqual(parseFieldLines('Options: a\n  continued\nLean: b'), { Options: 'a continued', Lean: 'b' });
  assert.throws(() => formatLedgerEntry({ n: 1, at: new Date(0), kind: 'D', step: 'S1', title: 't', fields: { By: 'worker' } }), /needs Why/);
  assert.throws(() => formatLedgerEntry({ n: 1, at: new Date(0), kind: 'X', step: 'S1', title: 't', fields: {} }), /unknown ledger kind/);
  assert.equal(formatLedgerEntry({ n: 1, at: new Date(0), kind: 'D', step: 'S1', title: 't', fields: { By: 'worker', Why: 'copies a.js:3' } }),
    '### [1] 1970-01-01T00:00Z D S1: t\n- By: worker\n- Why: copies a.js:3');
});
