// nextc-ecc's block-no-verify hook.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../nextc-ecc/hooks/scripts/block-no-verify.js', import.meta.url));
const { check, run } = createRequire(import.meta.url)(SCRIPT);

const ALLOWED = [
  'git add -A && git commit -m "feat: S1" && grep -n foo ledger.md',
  'git commit -m "x"; sed -n 1,5p file',
  'git commit -m x | head -n 3',
  'echo -n hi && git commit -m "y"',
  'git log -n 5',
  'git push -n origin main',
  'git commit -m "-n is in the message"',
  'git commit -m -n',
  'git commit -am "fix"',
  'git commit -m"no"',
  'git -C repo commit -m "ok" && npm run deploy -- -n',
  'git status # git commit -n',
  'git merge -n feature',
  'git commit --amend --no-edit',
];

const BLOCKED = [
  'git commit --no-verify -m x',
  'git commit -n -m x',
  'git commit -nm x',
  'git commit -an -m x',
  'git commit -m x -n',
  'git push --no-verify',
  'git merge --no-verify x',
  'git -c core.hooksPath=/dev/null commit -m x',
  'git -c "core.hooksPath=" commit -m x',
  'git -c core.hookspath=/tmp commit -m x',
  'git -ccore.hooksPath=/x commit -m x',
  'sh -c "git commit -n -m x"',
  "bash -c 'git commit --no-verify'",
  'eval "git commit -n -m x"',
  'echo "$(git commit -n -m x)"',
  'x=`git commit -n -m y`',
  '(cd repo && git commit -n -m x)',
  'grep -n a f; git commit -n -m x',
  '/usr/bin/git commit -n -m x',
  'git -C repo --git-dir .git commit -n -m x',
  'g\\it commit -n',
  'git commit -m "a;" -n',
];

test('allows -n that belongs to another command or a message', () => {
  for (const c of ALLOWED) assert.equal(check(c), null, c);
});

test('blocks every hook-bypass form', () => {
  for (const c of BLOCKED) assert.ok(check(c), c);
});

test('run() blocks with exit 2, allows bad or empty input, and refuses truncated input', () => {
  assert.equal(run(JSON.stringify({ tool_input: { command: BLOCKED[0] } })).exitCode, 2);
  assert.equal(run(JSON.stringify({ tool_input: { command: ALLOWED[0] } })).exitCode, 0);
  assert.equal(run('not json').exitCode, 0);
  assert.equal(run('{}', { truncated: true }).exitCode, 2);
});

test('as a process: exit codes, the reason on stderr, and stdin passed through', () => {
  for (const [command, want] of [[ALLOWED[0], 0], [BLOCKED[0], 2]]) {
    const input = JSON.stringify({ tool_name: 'Bash', tool_input: { command } });
    const r = spawnSync('node', [SCRIPT], { input, encoding: 'utf8' });
    assert.equal(r.status, want, command);
    if (want === 0) assert.equal(r.stdout, input);
    else assert.match(r.stderr, /^BLOCKED: /);
  }
});
