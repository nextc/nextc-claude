// Guard and Stop hooks of nextc-core/scripts/autopilot-hooks.mjs, run as Claude Code runs them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOKS = fileURLToPath(new URL('../nextc-core/scripts/autopilot-hooks.mjs', import.meta.url));

function fixture() {
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
  return { base, clone, state, run: path.join(clone, 'run') };
}

function hook(fx, mode, input, runDir = fx.run) {
  const env = { ...process.env, AUTOPILOT_ROOT: fx.clone, AUTOPILOT_RUN_DIR: runDir, AUTOPILOT_STATE_DIR: fx.state };
  return execFileSync('node', [HOOKS, mode], { env, input: JSON.stringify(input), encoding: 'utf8' });
}

const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });
const write = (file_path) => ({ tool_name: 'Write', tool_input: { file_path } });
const denied = (out) => out.includes('"deny"');

const ALLOWED_COMMANDS = [
  'git log --grep=push', 'git commit -m "push the button"', 'grep -r push src', 'echo "git push"',
  "echo 'npm publish'", 'git status && npm run build', 'fastlane build_ios', 'gh issue list', 'git st',
  'npm test -- --publish', 'cat deliver.md', 'node scripts/autopilot.js', 'git -C repo log --oneline | grep push',
  'git config --get alias.p',
];

const DENIED_COMMANDS = [
  'git push', 'git push origin HEAD', 'git -C /x push', 'git -c core.x=1 push', 'cd a && git push',
  'FOO=1 git push', 'sudo -u bob git push', 'env -i git push', 'bash -c "git push"', "sh -c 'cd x; git push'",
  'echo $(git push)', 'echo "`git push`"', 'eval git push', 'git p', 'git sp', 'git -c alias.x=push x',
  'git config alias.y push', 'GIT_CONFIG_KEY_0=alias.z git z', '/usr/bin/git push', 'gh pr create',
  'gh api repos/x', 'fastlane ios release_testflight', 'bundle exec fastlane pilot upload',
  'fastlane run upload_to_testflight', 'xcrun altool --upload-app', 'eas submit -p ios', 'npm publish',
  'yarn npm publish', 'dart pub publish', 'cargo publish --dry-run', 'timeout 60 git push', 'npx eas submit',
];

test('guard allows commands that only mention a hard-stop word', () => {
  const fx = fixture();
  for (const c of ALLOWED_COMMANDS) assert.equal(denied(hook(fx, 'guard', bash(c), fx.clone)), false, c);
});

test('guard denies push, store uploads and publishing in every form', () => {
  const fx = fixture();
  for (const c of DENIED_COMMANDS) assert.equal(denied(hook(fx, 'guard', bash(c), fx.clone)), true, c);
});

function deployFixture(step) {
  const fx = fixture();
  fs.writeFileSync(path.join(fx.state, 'approved.json'), JSON.stringify({
    deploys: [{ step: 'S3', commands: ['npm run deploy:docs', 'npm run rollback:docs'], scripts: ['scripts/deploy-docs.sh', 'scripts/rollback-docs.sh'] }],
  }));
  fs.writeFileSync(path.join(fx.run, 'state.json'), JSON.stringify({ steps: [{ id: 'S1', status: 'done' }, { id: 'S3', kind: 'deploy', ...step }] }));
  return fx;
}

const DEPLOY_RUNS = (clone) => [
  'npm run deploy:docs', 'npm run rollback:docs', 'timeout 60 npm run deploy:docs', 'bash -c "npm run rollback:docs"',
  'sh scripts/deploy-docs.sh', './scripts/deploy-docs.sh', 'cd scripts && ./deploy-docs.sh', `sh ${clone}/scripts/rollback-docs.sh`,
  'npm test && npm run deploy:docs', '. scripts/deploy-docs.sh',
];

test('guard refuses a deploy step\'s commands and scripts before its check passes', () => {
  for (const step of [{ status: 'pending', gate: null }, { status: 'in_progress', gate: null }, { status: 'pending', gate: 'pass' }]) {
    const fx = deployFixture(step);
    for (const c of DEPLOY_RUNS(fx.clone)) assert.equal(denied(hook(fx, 'guard', bash(c))), true, `${JSON.stringify(step)}: ${c}`);
  }
});

test('guard allows reading deploy scripts and other npm scripts before the check passes', () => {
  const fx = deployFixture({ status: 'in_progress', gate: null });
  for (const c of ['cat scripts/deploy-docs.sh', 'grep -n rm scripts/rollback-docs.sh', 'sh -n scripts/deploy-docs.sh', 'npm test', 'npm run deploy', 'ls site site.previous']) {
    assert.equal(denied(hook(fx, 'guard', bash(c))), false, c);
  }
});

test('guard allows the deploy once the step is in progress with gate pass', () => {
  const fx = deployFixture({ status: 'in_progress', gate: 'pass' });
  for (const c of DEPLOY_RUNS(fx.clone)) assert.equal(denied(hook(fx, 'guard', bash(c))), false, c);
});

test('guard keeps file tools inside the clone', () => {
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
    ['.git', write(`${R}/.git/config`), true],
    ['.mcp.json', write(`${R}/.mcp.json`), true],
    ['Read anywhere', { tool_name: 'Read', tool_input: { file_path: '/etc/hosts' } }, false],
  ];
  for (const [name, input, want] of cases) assert.equal(denied(hook(fx, 'guard', input)), want, name);
});

test('after STOP only the run folder can be written and the Stop hook lets the run end', () => {
  const fx = fixture();
  fs.writeFileSync(path.join(fx.state, 'STOP'), '');
  assert.equal(denied(hook(fx, 'guard', bash('ls'))), true, 'Bash');
  assert.equal(denied(hook(fx, 'guard', write(`${fx.run}/report.md`))), false, 'run-dir write');
  assert.equal(denied(hook(fx, 'guard', write(`${fx.clone}/src/a.js`))), true, 'src write');
  assert.equal(hook(fx, 'stop', {}).includes('block'), false, 'stop hook');
});

test('Stop hook blocks with open steps, but not twice with no progress', () => {
  const fx = fixture();
  fs.writeFileSync(path.join(fx.run, 'state.json'), JSON.stringify({ steps: [{ id: 'S1', status: 'done' }, { id: 'S2', status: 'pending' }] }));
  assert.equal(hook(fx, 'stop', { stop_hook_active: false }).includes('block'), true, 'first block');
  assert.equal(hook(fx, 'stop', { stop_hook_active: true }).includes('block'), false, 'no loop');
  assert.equal((fs.statSync(path.join(fx.state, 'stop-hook.json')).mode & 0o777).toString(8), '600', 'mark file mode');
});

test('Stop hook lets the turn end while a worker step is in progress', () => {
  const fx = fixture();
  fs.writeFileSync(path.join(fx.run, 'state.json'), JSON.stringify({ steps: [{ id: 'S1', status: 'in_progress' }, { id: 'S2', status: 'pending' }] }));
  assert.equal(hook(fx, 'stop', { stop_hook_active: false }).includes('block'), false);
});

test('Stop hook lets a finished run with a report end', () => {
  const fx = fixture();
  fs.writeFileSync(path.join(fx.run, 'state.json'), JSON.stringify({ steps: [{ id: 'S1', status: 'done' }, { id: 'S2', status: 'blocked' }] }));
  fs.writeFileSync(path.join(fx.run, 'report.md'), '# report\n');
  assert.equal(hook(fx, 'stop', {}).includes('block'), false);
});
