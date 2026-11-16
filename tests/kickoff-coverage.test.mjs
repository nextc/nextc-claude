// nextc-project-kickoff/scripts/coverage-check.mjs against temp fixture projects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { runCoverage, parsePubspecDeps, parseTasks, validateExtract } from '../nextc-project-kickoff/scripts/coverage-check.mjs';

const EXTRACT = {
  product: { name: 'Nestly' },
  features: [{ id: 'F1', name: 'Add a bond' }, { id: 'F2', name: 'Daily care prompt' }],
  entities: [{ name: 'Bond' }, { name: 'CarePrompt' }],
  integrations: [{ name: 'Push notifications' }],
  non_goals: ['Social feed'],
};
const ARCH = `# Architecture
## Feature map
| F1 | Add a bond | BondScreen | reads/writes Bond | BondRepository |
| F2 | Daily care prompt | PromptScreen | reads CarePrompt | PromptService |
## Data model
Bond and CarePrompt.
## Integrations
Push notifications via flutter_local_notifications.
## Dependencies
- \`go_router\`: navigation for F1 deep links.
- \`flutter_local_notifications\`: Push notifications for F2.
- \`cupertino_icons\`: default icon font from flutter create.
## Non-goals
Social feed.
`;
const TASKS = `# Tasks
- [ ] **T1 · F1 — Bond model** depends: none
  - Do: model.
  - Verify: unit test passes.
- [ ] **T2 · F1 — Add bond screen** depends: T1
  - Verify: screen shows form.
- [ ] **T3 · F2 — Prompt scheduler** depends: T1, T2
  - Verify: notification scheduled.
`;
const PUBSPEC = `name: nestly
dependencies:
  flutter:
    sdk: flutter
  go_router: ^18.1.4
  flutter_local_notifications: ^21.0.0
  cupertino_icons: ^1.0.8
dev_dependencies:
  flutter_test:
    sdk: flutter
flutter:
  uses-material-design: true
`;

function project(over = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cov-'));
  const files = {
    '.kickoff/proposal-extract.json': JSON.stringify(EXTRACT),
    'docs/architecture.md': ARCH,
    'docs/tasks.md': TASKS,
    'pubspec.yaml': PUBSPEC,
    'README.md': 'See [architecture](docs/architecture.md).\n',
    ...over,
  };
  for (const [rel, content] of Object.entries(files)) {
    if (content === null) continue;
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return dir;
}
const failed = (r) => r.checks.filter((c) => !c.ok).map((c) => c.name);

test('a fully traced project passes every check', () => {
  const r = runCoverage({ dir: project(), kind: 'flutter' });
  assert.deepEqual(failed(r), []);
  assert.equal(r.ok, true);
});

test('a feature id missing from architecture.md fails and names the feature', () => {
  const r = runCoverage({ dir: project({ 'docs/architecture.md': ARCH.replaceAll('F2', 'F9') }), kind: 'flutter' });
  assert.equal(r.ok, false);
  assert.match(r.checks.find((c) => c.name === 'features in architecture.md').details[0], /F2 \(Daily care prompt\)/);
});

test('F1 does not satisfy F10-style ids (whole-id match)', () => {
  const extract = { ...EXTRACT, features: [{ id: 'F1', name: 'a' }, { id: 'F10', name: 'b' }] };
  const r = runCoverage({ dir: project({ '.kickoff/proposal-extract.json': JSON.stringify(extract), 'docs/architecture.md': `${ARCH}\nF10 mentioned` }), kind: 'flutter' });
  assert.deepEqual(r.checks.find((c) => c.name === 'features in architecture.md').details, []);
  const r2 = runCoverage({ dir: project({ '.kickoff/proposal-extract.json': JSON.stringify(extract) }), kind: 'flutter' });
  assert.equal(r2.checks.find((c) => c.name === 'features in architecture.md').ok, false);
});

test('a feature with no task, or a task without a Verify line, fails', () => {
  const noTask = TASKS.replace('F2', 'F1');
  assert.ok(failed(runCoverage({ dir: project({ 'docs/tasks.md': noTask }), kind: 'flutter' })).includes('features and verify lines in tasks.md'));
  const noVerify = TASKS.replace('  - Verify: notification scheduled.\n', '');
  assert.ok(failed(runCoverage({ dir: project({ 'docs/tasks.md': noVerify }), kind: 'flutter' })).includes('features and verify lines in tasks.md'));
});

test('a task that depends on a later or undefined task fails the order check', () => {
  const bad = TASKS.replace('depends: none', 'depends: T3');
  assert.ok(failed(runCoverage({ dir: project({ 'docs/tasks.md': bad }), kind: 'flutter' })).includes('task dependency order'));
});

test('a missing entity or integration in architecture.md fails', () => {
  const r = runCoverage({ dir: project({ 'docs/architecture.md': ARCH.replaceAll('CarePrompt', 'Prompt').replaceAll('Push notifications', 'Pushes') }), kind: 'flutter' });
  assert.ok(failed(r).includes('entities in architecture.md'));
  assert.ok(failed(r).includes('integrations in architecture.md'));
});

test('a dependency in pubspec.yaml that the Dependencies section does not explain fails; sdk packages are ignored', () => {
  const r = runCoverage({ dir: project({ 'pubspec.yaml': PUBSPEC.replace('  cupertino_icons', '  isar: ^3.1.0\n  cupertino_icons') }), kind: 'flutter' });
  const c = r.checks.find((x) => x.name === 'dependencies explained');
  assert.equal(c.ok, false);
  assert.deepEqual(c.details.map((d) => d.split(' ')[0]), ['isar']);
  assert.deepEqual(parsePubspecDeps(PUBSPEC), ['go_router', 'flutter_local_notifications', 'cupertino_icons']);
});

test('a name mentioned only outside the Dependencies section does not count as explained', () => {
  const arch = ARCH.replace('- `cupertino_icons`: default icon font from flutter create.\n', '') + '\nWe also use cupertino_icons somewhere.\n';
  assert.ok(failed(runCoverage({ dir: project({ 'docs/architecture.md': arch }), kind: 'flutter' })).includes('dependencies explained'));
});

test('a Unity manifest is checked the same way, ignoring built-in modules', () => {
  const manifest = JSON.stringify({ dependencies: { 'com.unity.inputsystem': '1.20.1', 'com.unity.modules.audio': '1.0.0' } });
  const arch = ARCH.replace('## Dependencies', '## Dependencies\n- `com.unity.inputsystem`: touch input for F1.');
  const ok = runCoverage({ dir: project({ 'pubspec.yaml': null, 'Packages/manifest.json': manifest, 'docs/architecture.md': arch }), kind: 'unity' });
  assert.deepEqual(failed(ok), []);
  const bad = runCoverage({ dir: project({ 'pubspec.yaml': null, 'Packages/manifest.json': manifest }), kind: 'unity' });
  assert.ok(failed(bad).includes('dependencies explained'));
});

test('before a project exists the planned dependencies in state.json are checked', () => {
  const state = JSON.stringify({ dependencies: [{ name: 'go_router', reason: 'x', feature_ids: ['F1'] }, { name: 'riverpod', reason: 'x', feature_ids: [] }] });
  const r = runCoverage({ dir: project({ 'pubspec.yaml': null, '.kickoff/state.json': state }) });
  assert.deepEqual(r.checks.find((c) => c.name === 'dependencies explained').details.map((d) => d.split(' ')[0]), ['riverpod']);
});

test('broken relative links and imports fail; urls, anchors and fenced code are ignored', () => {
  const readme = '[ok](docs/architecture.md#top) [web](https://example.com) [gone](docs/missing.md)\n```\n[code](nope.md)\n```\n';
  const r = runCoverage({ dir: project({ 'README.md': readme, 'CLAUDE.md': '@AGENTS.md\n' }), kind: 'flutter' });
  const c = r.checks.find((x) => x.name === 'relative links resolve');
  assert.deepEqual(c.details, ['README.md -> docs/missing.md', 'CLAUDE.md -> AGENTS.md']);
});

test('a missing or malformed extract stops with a clear error', () => {
  assert.equal(runCoverage({ dir: project({ '.kickoff/proposal-extract.json': null }) }).ok, false);
  assert.ok(validateExtract({ product: { name: 'x' }, features: [{ id: 'feat-1', name: 'a' }] })[0].includes('F<number>'));
  assert.ok(validateExtract({ product: { name: 'x' }, features: [{ id: 'F1', name: 'a' }, { id: 'F1', name: 'b' }] }).some((e) => /duplicate/.test(e)));
  assert.equal(parseTasks(TASKS).length, 3);
});
