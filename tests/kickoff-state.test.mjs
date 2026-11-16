// nextc-project-kickoff/scripts/kickoff-state.mjs: schema, checkpoints, resume, legacy migration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { initState, loadState, decide, assume, setStep, setPath, nextStep, validateState, migrateLegacy, STEPS, statePath } from '../nextc-project-kickoff/scripts/kickoff-state.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'kick-'));
const CLI = fileURLToPath(new URL('../nextc-project-kickoff/scripts/kickoff-state.mjs', import.meta.url));

test('init writes a valid state in a non-empty target and does not overwrite on re-run', () => {
  const dir = tmp();
  mkdirSync(join(dir, 'docs'));
  writeFileSync(join(dir, 'docs', 'proposal.md'), '# p');
  const a = initState(dir, 'flutter');
  assert.equal(a.created, true);
  assert.deepEqual(validateState(a.state), []);
  assert.deepEqual(Object.keys(a.state.steps), STEPS.flutter);
  decide(dir, 'routing', 'go_router', 'user');
  const b = initState(dir, 'flutter');
  assert.equal(b.created, false);
  assert.equal(b.state.decisions.routing.value, 'go_router');
});

test('timestamps are real ISO times written by the script', () => {
  const dir = tmp();
  initState(dir, 'unity');
  const before = Date.now();
  const s = setStep(dir, 'preflight', 'done', { evidence: 'flutter 3.44.0' });
  const t = Date.parse(s.steps.preflight.finished_at);
  assert.ok(t >= before - 1000 && t <= Date.now() + 1000);
  assert.equal(s.steps.preflight.evidence, 'flutter 3.44.0');
});

test('resume: next step is the first not done, and a step left running is redone', () => {
  const dir = tmp();
  initState(dir, 'flutter');
  for (const id of ['preflight', 'extract', 'intake']) setStep(dir, id, 'done');
  setStep(dir, 'create', 'running');
  assert.equal(nextStep(loadState(dir)), 'create');
  setStep(dir, 'create', 'failed', { error: 'exit 1', log: '.kickoff/logs/create.log' });
  assert.equal(nextStep(loadState(dir)), 'create');
  setStep(dir, 'create', 'done');
  assert.equal(nextStep(loadState(dir)), 'identity');
  for (const id of STEPS.flutter) setStep(dir, id, id === 'ios-signing' ? 'skipped' : 'done');
  assert.equal(nextStep(loadState(dir)), null);
});

test('--auto records every defaulted decision as an assumption; user decisions are not assumptions', () => {
  const dir = tmp();
  initState(dir, 'flutter', { auto: true });
  decide(dir, 'backend', 'none', 'auto', 'proposal names no backend');
  decide(dir, 'platforms', ['ios', 'android'], 'user');
  const s = loadState(dir);
  assert.deepEqual(s.assumptions.map((a) => a.key), ['backend']);
  assert.equal(s.assumptions[0].reason, 'proposal names no backend');
  assume(dir, 'offline', false, 'proposal silent');
  assert.equal(loadState(dir).assumptions.length, 2);
});

test('invalid writes are refused and leave the file untouched', () => {
  const dir = tmp();
  initState(dir, 'flutter');
  const before = readFileSync(statePath(dir), 'utf8');
  assert.throws(() => decide(dir, 'x', 1, 'guess'), /source/);
  assert.throws(() => setStep(dir, 'nope', 'done'), /unknown step/);
  assert.throws(() => setStep(dir, 'create', 'finished'), /status/);
  assert.throws(() => setPath(dir, 'steps.create', {}), /path must start/);
  assert.equal(readFileSync(statePath(dir), 'utf8'), before);
  const broken = loadState(dir);
  delete broken.steps.create;
  assert.ok(validateState(broken).some((e) => /steps.create/.test(e)));
  assert.ok(validateState({ ...loadState(dir), schema_version: 9 }).length > 0);
});

test('setPath updates nested identity and options fields', () => {
  const dir = tmp();
  initState(dir, 'flutter');
  setPath(dir, 'identity.app_id', 'com.acme.nestly');
  setPath(dir, 'options.commit', true);
  setPath(dir, 'dependencies', [{ name: 'go_router', reason: 'deep links', feature_ids: ['F1'] }]);
  const s = loadState(dir);
  assert.equal(s.identity.app_id, 'com.acme.nestly');
  assert.equal(s.options.commit, true);
  assert.equal(s.dependencies[0].name, 'go_router');
  assert.throws(() => setPath(dir, 'dependencies', [{ name: 'x' }]), /dependencies\[0\]/);
});

test('legacy .flutter-kickoff/decisions.json is migrated and its completed phases are honoured', () => {
  const dir = tmp();
  mkdirSync(join(dir, '.flutter-kickoff'));
  writeFileSync(join(dir, '.flutter-kickoff', 'decisions.json'), JSON.stringify({ product_name: 'Nestly', org: 'com.nestly', app_id: 'com.nestly.nestly', platforms: ['ios'], routing: 'go_router', mode: 'auto-full', completed_phases: [0, 1, 2] }));
  const s = migrateLegacy(dir, 'flutter');
  assert.equal(s.identity.product_name, 'Nestly');
  assert.equal(s.decisions.routing.value, 'go_router');
  assert.equal(s.mode.auto, true);
  assert.equal(s.steps.create.status, 'done');
  assert.equal(s.steps['docs-architecture'].status, 'pending');
  assert.equal(migrateLegacy(tmp(), 'flutter'), null);
});

test('CLI: init, decide, step, next and validate work end to end, with exit 2 on misuse', () => {
  const dir = tmp();
  const run = (...args) => spawnSync('node', [CLI, ...args, '--dir', dir], { encoding: 'utf8' });
  assert.equal(run('init', '--kind', 'unity', '--auto').status, 0);
  assert.equal(run('decide', '--key', 'render_pipeline', '--value', '"urp"', '--source', 'auto', '--note', 'mobile target').status, 0);
  assert.equal(run('step', '--id', 'preflight', '--status', 'done').status, 0);
  assert.equal(JSON.parse(run('next').stdout).next, 'extract');
  assert.equal(run('validate').status, 0);
  assert.equal(run('step', '--id', 'bogus', '--status', 'done').status, 2);
  assert.ok(existsSync(statePath(dir)));
});
