// nextc-flutter's upload-guard PreToolUse hook. No installs, no model calls.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCRIPT = fileURLToPath(new URL('../nextc-flutter/hooks/scripts/upload-guard.js', import.meta.url));
const { check, run } = createRequire(import.meta.url)(SCRIPT);

let tmp;
let fresh;
let uploaded;
let outside;

function makeProject(name, buildlog) {
  const root = path.join(tmp, name);
  for (const d of ['ios', 'android', 'lib', 'docs']) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, 'pubspec.yaml'), 'name: demo\nversion: 1.2.3+7\n');
  if (buildlog) fs.writeFileSync(path.join(root, 'docs', 'buildlog.md'), buildlog);
  return fs.realpathSync(root);
}

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-guard-'));
  fresh = makeProject(
    'fresh',
    [
      '# Build Log',
      '',
      '## Build #7 — 1.2.3+7 (2026-11-16 10:00)',
      '',
      '- **Status:** in progress',
      '- **Uploaded:** no',
      '',
      '## Build #6 — 1.2.3+6 (2026-11-15 10:00)',
      '',
      '- **Uploaded:** yes (App Store Connect)',
      '',
    ].join('\n'),
  );
  uploaded = makeProject(
    'uploaded',
    [
      '# Build Log',
      '',
      '## Build #7 — 1.2.3+7 (2026-11-16 10:00)',
      '',
      '- **Status:** success',
      '- **Uploaded:** yes (App Store Connect)',
      '',
    ].join('\n'),
  );
  outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'upload-guard-nopubspec-')));
});

after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

const LANE = 'bundle exec fastlane ios release_testflight';

test('allows an upload lane from ios/ when the build is not yet uploaded', () => {
  assert.equal(check(LANE, path.join(fresh, 'ios'), {}), null);
});

test('allows an upload lane from the project root and android/', () => {
  assert.equal(check('fastlane ios release_testflight', fresh, {}), null);
  assert.equal(check('fastlane android deploy_supply', path.join(fresh, 'android'), {}), null);
});

test('allows the compound cd ios && env-prefixed lane from the root', () => {
  const cmd = `cd ios && FL_CHANGELOG="Bug fixes && faster startup" TESTFLIGHT_GROUPS=Beta ${LANE}`;
  assert.equal(check(cmd, fresh, {}), null);
});

test('denies a duplicate upload from ios/', () => {
  assert.match(check(LANE, path.join(uploaded, 'ios'), {}), /already records 1\.2\.3\+7 as uploaded/);
});

test('denies a duplicate upload in a compound command with env prefix', () => {
  assert.match(check(`cd ios && FL_CHANGELOG="notes" ${LANE}`, uploaded, {}), /already records/);
});

test('denies a duplicate upload for pilot, deliver and fastlane run', () => {
  for (const cmd of ['fastlane pilot upload', 'fastlane deliver', 'fastlane run upload_to_testflight']) {
    assert.match(check(cmd, uploaded, {}), /already records/, cmd);
  }
});

test('denies an upload lane run from a non-project directory', () => {
  assert.match(check(LANE, path.join(fresh, 'lib'), {}), /not the project root/);
});

test('denies when cd moves the effective directory out of the project', () => {
  assert.match(check(`cd lib && ${LANE}`, fresh, {}), /not the project root/);
  assert.match(check(`cd /tmp && ${LANE}`, fresh, {}), /not the project root/);
});

test('cd back into ios/ is allowed', () => {
  assert.equal(check(`cd lib; cd ../ios; ${LANE}`, fresh, {}), null);
});

test('stays silent for read-only fastlane commands, even in a duplicate project', () => {
  assert.equal(check('cd ios && bundle exec fastlane lanes', uploaded, {}), null);
  assert.equal(check('fastlane env', path.join(uploaded, 'lib'), {}), null);
  assert.equal(check('fastlane actions upload_to_testflight', uploaded, {}), null);
});

test('stays silent for non-upload lanes', () => {
  assert.equal(check('cd ios && bundle exec fastlane ios build_adhoc', uploaded, {}), null);
});

test('ignores lane names that only appear inside quotes', () => {
  assert.equal(check('echo "run fastlane ios release_testflight later"', uploaded, {}), null);
  assert.equal(check("git commit -m 'docs: fastlane ios release_testflight is gated'", uploaded, {}), null);
  assert.equal(check('grep -n "fastlane pilot upload" notes.md', uploaded, {}), null);
});

test('ignores lane names inside heredoc bodies', () => {
  const cmd = ['cat > notes.md <<EOF', 'cd ios && fastlane ios release_testflight', 'EOF', 'ls'].join('\n');
  assert.equal(check(cmd, uploaded, {}), null);
});

test('still catches a real lane that follows a heredoc', () => {
  const cmd = ['cat > notes.md <<EOF', 'some text', 'EOF', LANE].join('\n');
  assert.match(check(cmd, uploaded, {}), /already records/);
});

test('catches a lane inside sh -c', () => {
  assert.match(check(`sh -c "cd ios && ${LANE}"`, uploaded, {}), /already records/);
});

test('a lane parameter that mentions upload does not turn a build lane into an upload', () => {
  assert.equal(check('fastlane ios build_adhoc note:upload', uploaded, {}), null);
});

test('is skipped inside an autopilot run', () => {
  assert.equal(check(LANE, uploaded, { AUTOPILOT_RUN_DIR: '/x' }), null);
});

test('stays silent outside a Flutter project (fail open)', () => {
  assert.equal(check(LANE, outside, {}), null);
});

test('stays silent when the buildlog is missing or the entry is not uploaded', () => {
  assert.equal(check(LANE, makeProject('nolog'), {}), null);
  assert.equal(check(LANE, fresh, {}), null);
});

test('does not match a build number that only shares a prefix (+7 vs +70)', () => {
  const root = makeProject('prefix', '# Build Log\n\n## Build #70 — 1.2.3+70 (2026-11-16 10:00)\n\n- **Uploaded:** yes\n');
  assert.equal(check(LANE, root, {}), null);
});

test('a cd with a variable skips the directory check but keeps the duplicate check', () => {
  assert.equal(check(`cd "$PROJ/ios" && ${LANE}`, fresh, {}), null);
  assert.match(check(`cd "$PROJ/ios" && ${LANE}`, uploaded, {}), /already records/);
});

test('hook entry point: deny JSON on stdout with exit 0; silent otherwise', () => {
  const input = (command, cwd) => JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd });
  const denied = spawnSync('node', [SCRIPT], { input: input(LANE, uploaded), encoding: 'utf8' });
  assert.equal(denied.status, 0);
  const out = JSON.parse(denied.stdout);
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /already records/);

  const silent = spawnSync('node', [SCRIPT], { input: input('fastlane lanes', uploaded), encoding: 'utf8' });
  assert.equal(silent.status, 0);
  assert.equal(silent.stdout, '');
  assert.equal(silent.stderr, '');
});

test('hook entry point fails open on garbage input', () => {
  const r = spawnSync('node', [SCRIPT], { input: '{not json', encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, '');
  assert.equal(run('', {}), null);
});
