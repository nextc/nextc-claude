// The decisions in nextc-core/scripts/autopilot-run.mjs, tested without starting claude.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseArgs, resolveRunPaths, selectPluginDirs, denyRules, buildSettings, buildEnv, buildClaudeArgs, launchBudget,
  settleLaunches, lockIsStale, recoveryPlan, recoveryText, sandboxProposal, guardGitConfig, REMOVED_TOOLS, SECRET_ENV,
  BG_WAIT_CEILING_MS, STATE_ROOT,
} from '../nextc-core/scripts/autopilot-run.mjs';

const RUN = fileURLToPath(new URL('../nextc-core/scripts/autopilot-run.mjs', import.meta.url));
const SKILL = fileURLToPath(new URL('../nextc-core/skills/autopilot/SKILL.md', import.meta.url));

test('parseArgs: flags with values, repeatable flags, booleans, and a missing value', () => {
  assert.deepEqual(parseArgs(['r1', '--model', 'opus', '--dry-run']), { positional: ['r1'], model: 'opus', 'dry-run': true });
  assert.deepEqual(parseArgs(['sandbox-check', '.', '--verify', 'a', '--verify', 'b']).verify, ['a', 'b']);
  assert.throws(() => parseArgs(['r1', '--max-budget-usd']), /needs a value/);
});

test('resolveRunPaths: relative clone, absolute clone, and a moved repo with the fix in the message', () => {
  const have = new Set(['/repo', '/repo/.claude/autopilot-runs/r1']);
  const exists = (p) => have.has(p);
  assert.deepEqual(resolveRunPaths({ sourceRepo: '/repo', clone: '.claude/autopilot-runs/r1' }, 'r1', exists), { sourceRepo: '/repo', clone: '/repo/.claude/autopilot-runs/r1' });
  assert.deepEqual(resolveRunPaths({ sourceRepo: '/repo', clone: '/repo/.claude/autopilot-runs/r1' }, 'r1', exists).clone, '/repo/.claude/autopilot-runs/r1');
  assert.throws(() => resolveRunPaths({ sourceRepo: '/old', clone: '/old/.claude/autopilot-runs/r1' }, 'r1', exists), /\/old no longer exists.*relocate r1 <new-repo-path>/s);
  assert.throws(() => resolveRunPaths({ sourceRepo: '/repo', clone: '.claude/autopilot-runs/gone' }, 'r1', exists), /no longer exists \(was it cleaned\?\)/);
  assert.throws(() => resolveRunPaths({ clone: 'x' }, 'r1', exists), /no absolute sourceRepo/);
});

test('relocate rewrites approved.json for a renamed repo and status then resolves', () => {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-home-')));
  const repo = path.join(home, 'new-name');
  fs.mkdirSync(path.join(repo, '.claude', 'autopilot-runs', 'r1', '.git'), { recursive: true });
  const stateDir = path.join(home, '.claude', 'autopilot', 'r1');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'approved.json'), JSON.stringify({ id: 'r1', sourceRepo: path.join(home, 'old-name'), clone: path.join(home, 'old-name', '.claude', 'autopilot-runs', 'r1') }));
  const env = { ...process.env, HOME: home };
  const r = spawnSync('node', [RUN, 'relocate', 'r1', repo], { env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const approved = JSON.parse(fs.readFileSync(path.join(stateDir, 'approved.json'), 'utf8'));
  assert.equal(approved.sourceRepo, repo);
  assert.equal(approved.clone, path.join('.claude', 'autopilot-runs', 'r1'));
  assert.equal(approved.relocatedFrom, path.join(home, 'old-name'));
  const s = spawnSync('node', [RUN, 'status', 'r1'], { env, encoding: 'utf8' });
  assert.equal(s.status, 0, s.stderr);
  assert.match(s.stdout, /no status\.json yet/);
});

test('selectPluginDirs: enabled user plugins, this nextc-core first, installed nextc-core dropped', () => {
  const installed = {
    'a@m': [{ scope: 'project', installPath: '/p/a-project' }, { scope: 'user', installPath: '/p/a-user' }],
    'nextc-core@m': [{ scope: 'user', installPath: '/cache/nextc-core/1.6.16' }],
    'off@m': [{ scope: 'user', installPath: '/p/off' }],
    'missing@m': [{ scope: 'user', installPath: '/p/missing' }],
  };
  const enabled = { 'a@m': true, 'nextc-core@m': true, 'off@m': false, 'missing@m': true };
  const exists = (p) => p !== '/p/missing';
  assert.deepEqual(selectPluginDirs({ enabled, installed, pluginRoot: '/repo/nextc-core', exists }), ['/repo/nextc-core', '/p/a-user']);
});

test('settings: sandbox on and required, guard fail-closed, deny rules except a gated deploy\'s own command', () => {
  const approved = { allowedDomains: ['pub.dev'], excludedCommands: ['flutter *'], allowLocalBinding: true, deploys: [{ step: 'S3', commands: ['firebase deploy --only hosting'] }] };
  const s = buildSettings({ approved, hooksScript: '/h.mjs', authVars: ['ANTHROPIC_API_KEY'] });
  assert.equal(s.sandbox.enabled, true);
  assert.equal(s.sandbox.allowUnsandboxedCommands, false);
  assert.equal(s.sandbox.failIfUnavailable, true);
  assert.deepEqual(s.sandbox.network, { allowedDomains: ['pub.dev'], allowLocalBinding: true });
  assert.ok(s.sandbox.credentials.files.some((f) => f.path === '~/.npmrc' && f.mode === 'deny'));
  assert.ok(s.sandbox.credentials.files.some((f) => f.path === '~/.pub-cache/credentials.json'));
  assert.deepEqual(s.sandbox.credentials.envVars, [{ name: 'ANTHROPIC_API_KEY', mode: 'deny' }]);
  assert.equal(s.hooks.PreToolUse[0].hooks[0].onFailure, 'block');
  assert.equal(s.hooks.PreToolUse[0].matcher, '*');
  assert.ok(s.permissions.deny.includes('Bash(git push*)'));
  assert.ok(!s.permissions.deny.includes('Bash(firebase deploy*)'), 'the gated deploy command is left to the guard');
  assert.ok(denyRules({}).includes('Bash(firebase deploy*)'));
});

test('env: secrets stripped (GIT_AUTHOR kept), passEnv honoured, waits and timeouts set', () => {
  const processEnv = {
    PATH: '/bin', HOME: '/h', GIT_AUTHOR_NAME: 'me', GIT_AUTHOR_EMAIL: 'me@x', STRIPE_KEY: 's', STRIPE_SECRET_KEY: 's', DATABASE_URL: 'pg://',
    SENTRY_DSN: 'd', SUPABASE_ACCESS_TOKEN: 't', SUPABASE_URL: 'u', GITHUB_TOKEN: 'g', SSH_AUTH_SOCK: '/s', DEPLOY_TOKEN: 'd', ANTHROPIC_API_KEY: 'a',
    FLUTTER_ROOT: '/f', PUB_CACHE: '/pc', JAVA_HOME: '/j', AUTHOR: 'x', MY_AUTH: 'x',
  };
  const env = buildEnv({ approved: { passEnv: ['DEPLOY_TOKEN'] }, processEnv, stateDir: '/st', runDir: '/c/docs/autopilot/r1', clone: '/c' });
  for (const k of ['PATH', 'HOME', 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'FLUTTER_ROOT', 'PUB_CACHE', 'JAVA_HOME', 'AUTHOR', 'DEPLOY_TOKEN', 'ANTHROPIC_API_KEY']) assert.ok(k in env, `${k} kept`);
  for (const k of ['STRIPE_KEY', 'STRIPE_SECRET_KEY', 'DATABASE_URL', 'SENTRY_DSN', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_URL', 'GITHUB_TOKEN', 'SSH_AUTH_SOCK', 'MY_AUTH']) assert.ok(!(k in env), `${k} stripped`);
  assert.equal(env.CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS, String(BG_WAIT_CEILING_MS));
  assert.equal(env.BASH_DEFAULT_TIMEOUT_MS, '600000');
  assert.equal(env.TMPDIR, '/c/.autopilot-tmp');
  assert.ok(env.AUTOPILOT_HOOKS.endsWith('autopilot-hooks.mjs'));
  assert.ok(!SECRET_ENV.test('GIT_AUTHOR_DATE'));
});

test('claude args: bypass mode only with prompts off, per-launch budget, removed tools', () => {
  const a = buildClaudeArgs({ runId: 'r1', model: 'opus', settingsPath: '/s.json', bundlePath: '/b.md', pluginDirs: ['/p'], budgetUsd: 12.345 });
  assert.equal(a[a.indexOf('--max-budget-usd') + 1], '12.35');
  assert.equal(a[a.indexOf('--permission-mode') + 1], 'bypassPermissions');
  assert.equal(a[a.indexOf('--permission-prompts') + 1], 'none');
  assert.deepEqual(a.slice(a.indexOf('--disallowedTools') + 1), REMOVED_TOOLS);
});

test('the removed tools are the ones SKILL.md says are removed', () => {
  const skill = fs.readFileSync(SKILL, 'utf8');
  for (const t of ['WebSearch', 'WebFetch', 'PushNotification', 'ScheduleWakeup', 'Monitor', 'Workflow', 'SendToProject', 'EnterWorktree', 'AskUserQuestion']) {
    assert.ok(REMOVED_TOOLS.includes(t), `${t} removed`);
    assert.ok(skill.includes(t), `SKILL.md names ${t}`);
  }
});

test('launchBudget: refuses with no budget or none left, else gives this launch what remains', () => {
  assert.throws(() => launchBudget({ approvedTotal: undefined, launches: [] }), /no budget/);
  assert.throws(() => launchBudget({ approvedTotal: 20, launches: [{ costUsd: 19.8 }] }), /used up: \$19\.80 of \$20\.00/);
  assert.equal(launchBudget({ approvedTotal: 20, launches: [{ costUsd: 5 }, { budgetUsd: 4 }] }).remaining, 11);
  assert.equal(launchBudget({ approvedTotal: 20, override: '50', launches: [{ costUsd: 30 }] }).remaining, 20);
});

test('settleLaunches fills in a killed launcher\'s launch from its transcript slice', () => {
  const before = '{"type":"result","session_id":"a","total_cost_usd":3}\n';
  const crashed = `${JSON.stringify({ type: 'assistant', message: { id: 'm', model: 'claude-sonnet-5-5', usage: { input_tokens: 1e6 } } })}\n`;
  const billedSlice = '{"type":"result","session_id":"b","total_cost_usd":1.5}\n';
  const text = before + crashed + billedSlice;
  const launches = [
    { costUsd: 3, transcriptStart: 0 },
    { budgetUsd: 10, transcriptStart: before.length },
    { budgetUsd: 10, transcriptStart: before.length + crashed.length },
  ];
  const settled = settleLaunches(launches, text);
  assert.equal(settled[0].costUsd, 3);
  assert.ok(Math.abs(settled[1].costEstimateUsd - 2 / 0.58) < 1e-9);
  assert.equal(settled[2].costUsd, 1.5);
});

test('lockIsStale: dead pid, reused pid, live launcher, live child, legacy plain-pid lock', () => {
  const t0 = Date.parse('2026-11-16T10:00:00Z');
  const probe = (table) => (pid) => table[pid] ?? null;
  const lock = JSON.stringify({ pid: 10, pidStartedAt: t0, childPid: 11, childStartedAt: t0 + 1000 });
  assert.equal(lockIsStale(lock, probe({})), true, 'both gone');
  assert.equal(lockIsStale(lock, probe({ 10: t0 + 3600e3 })), true, 'pid reused by a later process');
  assert.equal(lockIsStale(lock, probe({ 10: t0 })), false, 'launcher alive');
  assert.equal(lockIsStale(lock, probe({ 11: t0 + 1000 })), false, 'launcher killed, claude child still running');
  assert.equal(lockIsStale('4242', probe({ 4242: t0 })), false, 'legacy lock, pid alive');
  assert.equal(lockIsStale('4242\n', probe({})), true, 'legacy lock, pid gone');
});

test('recoveryPlan: continue from a dead worker\'s edits, or start fresh, never both', () => {
  const state = { steps: [{ id: 'S1', status: 'done' }, { id: 'S2', status: 'in_progress' }] };
  const dirty = ' M lib/a.dart\n?? lib/b.dart\n M docs/autopilot/r1/ledger.md\n?? .autopilot-tmp/x\n';
  const plan = recoveryPlan(state, dirty, 'docs/autopilot/r1');
  assert.deepEqual(plan, [{ step: 'S2', files: ['lib/a.dart', 'lib/b.dart'], action: 'continue-from-edits' }]);
  assert.match(recoveryText(plan), /S2 was in_progress.*2 uncommitted file\(s\).*ONE foreground worker.*Do not start the step over/s);
  assert.deepEqual(recoveryPlan(state, ' M docs/autopilot/r1/state.json\n', 'docs/autopilot/r1')[0].action, 'redispatch-fresh');
  assert.deepEqual(recoveryPlan({ steps: [{ id: 'S1', status: 'done' }] }, dirty, 'docs/autopilot/r1'), []);
});

test('sandboxProposal: toolchain exclusions with what they expose, and warnings that matter', () => {
  const flutter = sandboxProposal({ files: ['pubspec.yaml', 'lib/main.dart', 'service/go.mod'], verifyCommands: ['flutter analyze', 'cd service && go test ./...'], excluded: ['node *', 'flutter'] });
  assert.deepEqual(flutter.proposals.map((p) => p.pattern), ['flutter *', 'dart *', 'go *']);
  assert.ok(flutter.proposals.every((p) => p.why && p.exposes));
  assert.ok(flutter.warnings.some((w) => /"node \*" runs any script/.test(w)));
  assert.ok(flutter.warnings.some((w) => /"flutter" has no " \*"/.test(w)));
  assert.ok(flutter.warnings.some((w) => /cd service && go test.*keeps the whole call sandboxed/.test(w)));
  const node = sandboxProposal({ files: ['package.json', 'src/a.ts'], verifyCommands: ['npm test', 'npx playwright test'] });
  assert.deepEqual(node.proposals, []);
  assert.equal(node.suggestLocalBinding, true);
  assert.deepEqual(sandboxProposal({ files: ['pkg/pubspec.yaml'], verifyCommands: ['dart test'] }).proposals.map((p) => p.pattern), ['dart *']);
});

test('guardGitConfig saves the first copy and restores it when the run changed it', () => {
  const clone = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-cfg-')));
  execFileSync('git', ['init', '--quiet', clone]);
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-state-'));
  const original = fs.readFileSync(path.join(clone, '.git', 'config'), 'utf8');
  assert.equal(guardGitConfig(clone, stateDir), null);
  fs.appendFileSync(path.join(clone, '.git', 'config'), '[core]\n\tfsmonitor = touch /tmp/pwned\n');
  assert.match(guardGitConfig(clone, stateDir), /restored the approved copy/);
  assert.equal(fs.readFileSync(path.join(clone, '.git', 'config'), 'utf8'), original);
  assert.equal((fs.statSync(path.join(stateDir, 'git-config.saved')).mode & 0o777).toString(8), '600');
});

test('state lives under ~/.claude/autopilot', () => {
  assert.equal(STATE_ROOT, path.join(os.homedir(), '.claude', 'autopilot'));
});
