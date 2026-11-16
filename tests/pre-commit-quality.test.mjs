// nextc-ecc's pre-commit-quality hook.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../nextc-ecc/hooks/scripts/pre-commit-quality.js', import.meta.url));
const { evaluate, extractCommits, commitSubjectIssues, scanContent } = createRequire(import.meta.url)(SCRIPT);

// Built at runtime so this file never contains a literal that looks like a secret.
const FAKE_KEY = 'sk-ant-' + 'a1B2c3D4'.repeat(4);

let base;
let repo;
let sub;

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const hook = (command, cwd) => evaluate(JSON.stringify({ tool_name: 'Bash', cwd, tool_input: { command } }));

before(() => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pcq-')));
  repo = path.join(base, 'dirty');
  sub = path.join(base, 'clean');
  for (const dir of [repo, sub]) {
    fs.mkdirSync(dir);
    git(dir, 'init', '--quiet');
    git(dir, 'config', 'user.email', 't@example.com');
    git(dir, 'config', 'user.name', 't');
  }
  fs.writeFileSync(path.join(repo, 'leak.txt'), `export=${FAKE_KEY}\n`);
  git(repo, 'add', 'leak.txt');
  fs.writeFileSync(path.join(sub, 'ok.txt'), 'nothing secret\n');
  git(sub, 'add', 'ok.txt');
});

after(() => fs.rmSync(base, { recursive: true, force: true }));

test('extractCommits finds real commits and ignores text that mentions one', () => {
  assert.equal(extractCommits('git commit -m "x"', '/w').length, 1);
  assert.equal(extractCommits('echo "git commit -m x"', '/w').length, 0);
  assert.equal(extractCommits('grep "git commit" log.txt', '/w').length, 0);
  assert.equal(extractCommits('cat <<EOF\ngit commit -m "don\'t"\nEOF', '/w').length, 0);
  assert.equal(extractCommits('git status && git add -A', '/w').length, 0);
});

test('extractCommits resolves the directory from -C and cd', () => {
  assert.equal(extractCommits('git -C sub commit -m x', '/w')[0].dir, path.resolve('/w', 'sub'));
  assert.equal(extractCommits('cd sub && git commit -m x', '/w')[0].dir, path.resolve('/w', 'sub'));
  assert.equal(extractCommits('git -C /abs -c a=b commit -m x', '/w')[0].dir, '/abs');
  assert.equal(extractCommits('FOO=1 git commit -m x', '/w')[0].dir, '/w');
});

test('extractCommits reads the message from every -m form and from heredocs', () => {
  const msg = (cmd) => extractCommits(cmd, '/w')[0].message;
  assert.equal(msg('git commit -m "feat: a"'), 'feat: a');
  assert.equal(msg('git commit -am "fix: b"'), 'fix: b');
  assert.equal(msg('git commit -m"fix: c"'), 'fix: c');
  assert.equal(msg('git commit --message="docs: d"'), 'docs: d');
  assert.equal(msg('git commit --message "docs: e"'), 'docs: e');
  assert.equal(msg('git commit -F msg.txt'), null);
  assert.equal(msg('git commit'), null);
  assert.equal(msg('git commit -m "$(date)"'), null);
  assert.equal(
    msg('git commit -m "$(cat <<\'EOF\'\nfeat: heredoc subject\n\nbody with "quotes" and don\'t\nEOF\n)"'),
    'feat: heredoc subject\n\nbody with "quotes" and don\'t',
  );
  assert.equal(extractCommits('git commit -a -m x', '/w')[0].all, true);
});

test('subject check: conventional passes, others warn, auto subjects skip', () => {
  assert.deepEqual(commitSubjectIssues('feat(core): add thing\n\nbody'), []);
  assert.deepEqual(commitSubjectIssues('fixup! feat: x'), []);
  assert.deepEqual(commitSubjectIssues('Merge branch main'), []);
  assert.deepEqual(commitSubjectIssues(null), []);
  assert.equal(commitSubjectIssues('updated stuff')[0].sev, 'warn');
});

test('a heredoc commit message with a conventional subject raises no warning', () => {
  const cmd = 'git commit -m "$(cat <<\'EOF\'\nfeat: heredoc subject\n\nCo-Authored-By: someone\nEOF\n)"';
  assert.deepEqual(hook(cmd, sub), { exitCode: 0 });
});

test('scanContent keeps the secret and debugger patterns', () => {
  assert.equal(scanContent('a.txt', FAKE_KEY)[0].sev, 'error');
  assert.equal(scanContent('a.txt', 'token = "' + 'x'.repeat(12) + '"')[0].sev, 'error');
  assert.equal(scanContent('a.js', 'debugger;')[0].sev, 'error');
  assert.equal(scanContent('a.js', 'console.log(1)')[0].sev, 'warn');
  assert.deepEqual(scanContent('a.txt', 'debugger;'), []);
  assert.deepEqual(scanContent('a.js', '// console.log(1)'), []);
});

test('blocks a staged secret, scanning the right directory', () => {
  assert.equal(hook('git commit -m "feat: x"', repo).exitCode, 2);
  assert.equal(hook('git commit -m "feat: x"', sub).exitCode, 0);
  assert.equal(hook(`git -C ${repo} commit -m "feat: x"`, sub).exitCode, 2);
  assert.equal(hook(`cd ${repo} && git commit -m "feat: x"`, sub).exitCode, 2);
  assert.equal(hook(`git -C ${sub} commit -m "feat: x"`, repo).exitCode, 0);
});

test('does not scan when the command only mentions git commit', () => {
  assert.deepEqual(hook('echo "git commit -m x"', repo), { exitCode: 0 });
  assert.deepEqual(hook('git log --grep="git commit"', repo), { exitCode: 0 });
});

test('-a also scans modified tracked files', () => {
  const dir = path.join(base, 'tracked');
  fs.mkdirSync(dir);
  git(dir, 'init', '--quiet');
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'user.name', 't');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'clean\n');
  git(dir, 'add', 'a.txt');
  git(dir, 'commit', '--quiet', '-m', 'chore: init');
  fs.writeFileSync(path.join(dir, 'a.txt'), `${FAKE_KEY}\n`);
  assert.equal(hook('git commit -m "feat: x"', dir).exitCode, 0);
  assert.equal(hook('git commit -am "feat: x"', dir).exitCode, 2);
});

test('ignores non-Bash tools, empty and malformed input', () => {
  assert.deepEqual(evaluate(JSON.stringify({ tool_name: 'Edit', tool_input: { command: 'git commit' } })), { exitCode: 0 });
  assert.deepEqual(evaluate(''), { exitCode: 0 });
  assert.deepEqual(evaluate('not json'), { exitCode: 0 });
});

test('as a process: blocks with exit 2 on stderr, prints nothing on stdout, exits at once on stdin end', () => {
  const run = (command, cwd, env = {}) =>
    spawnSync('node', [SCRIPT], { input: JSON.stringify({ tool_name: 'Bash', cwd, tool_input: { command } }), encoding: 'utf8', env: { ...process.env, ...env } });
  const blocked = run('git commit -m "feat: x"', repo);
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /Commit BLOCKED/);
  assert.equal(blocked.stdout, '');
  const allowed = run('git commit -m "feat: x"', sub);
  assert.equal(allowed.status, 0);
  assert.equal(allowed.stdout, '');
  assert.equal(run('git commit -m "feat: x"', repo, { PRECOMMIT_QUALITY: 'off' }).status, 0);
});
