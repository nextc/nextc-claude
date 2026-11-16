// nextc-project-kickoff/scripts/upm-check.mjs with an injected registry and a fixture editor install.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pickVersion, resolvePackage, resolveAll, buildManifest, readEditorVersion, editorLine } from '../nextc-project-kickoff/scripts/upm-check.mjs';

const meta = (versions) => ({ status: 200, json: { versions: Object.fromEntries(Object.entries(versions).map(([v, unity]) => [v, { unity }])) } });
const unityReg = {
  'com.unity.inputsystem': meta({ '1.8.2': '2019.4', '1.11.2': '2019.4', '1.20.1': '6000.0', '1.99.0': '6000.9', '1.21.0-pre.1': '6000.0', '1.9.0': '2019.4' }),
  'com.unity.render-pipelines.universal': meta({ '10.10.1': '2019.3' }),
  'com.unity.netcode.gameobjects': meta({ '1.0.0': '2022.3', '2.14.0': '6000.0' }),
  'com.unity.onlynew': meta({ '3.0.0': '6000.5' }),
};
const openupm = {
  'com.cysharp.unitask': meta({ '2.5.9': '2018.4', '2.5.11': '2018.4', '2.6.0-rc.1': '2018.4' }),
};
const get = async (url) => {
  const name = url.split('/').pop();
  const table = url.startsWith('https://packages.unity.com') ? unityReg : openupm;
  return table[name] || { status: 404, json: { error: 'not found' } };
};

function fixtureEditor() {
  const app = mkdtempSync(join(tmpdir(), 'unity-app-'));
  const dir = join(app, 'Contents', 'Resources', 'PackageManager', 'BuiltInPackages', 'com.unity.render-pipelines.universal');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'com.unity.render-pipelines.universal', version: '17.4.0' }));
  return app;
}

test('picks the highest stable version whose minimum editor is not above the editor line', () => {
  const line = editorLine('6000.4.1f1');
  assert.equal(pickVersion(unityReg['com.unity.inputsystem'].json, line), '1.20.1');
  assert.equal(pickVersion(unityReg['com.unity.inputsystem'].json, editorLine('2021.3.5f1')), '1.11.2');
  assert.equal(pickVersion(unityReg['com.unity.inputsystem'].json, line, { allowPre: true }), '1.21.0-pre.1');
  assert.equal(pickVersion(unityReg['com.unity.onlynew'].json, line), null);
});

test('version order is semantic, not lexical or listing order', () => {
  assert.equal(pickVersion(meta({ '1.9.0': '2019.4', '1.10.0': '2019.4', '1.2.0': '2019.4' }).json, editorLine('6000.0.1f1')), '1.10.0');
});

test('editor-bundled versions win over the registry (the registry only carries a stale URP line)', async () => {
  const editorApp = fixtureEditor();
  const r = await resolvePackage('com.unity.render-pipelines.universal', { editor: '6000.4.1f1', editorApp, get });
  assert.deepEqual([r.status, r.source, r.version], ['ok', 'editor-bundled', '17.4.0']);
});

test('editor-bound packages are unresolved, never taken from the stale registry, when no editor install is known', async () => {
  const r = await resolvePackage('com.unity.render-pipelines.universal', { editor: '6000.4.1f1', get });
  assert.equal(r.status, 'unresolved');
  assert.match(r.message, /Package Manager/);
});

test('built-in modules resolve to 1.0.0; registry and OpenUPM packages resolve with their source', async () => {
  const opts = { editor: '6000.4.1f1', get };
  assert.equal((await resolvePackage('com.unity.modules.audio', opts)).version, '1.0.0');
  assert.deepEqual(await resolvePackage('com.unity.netcode.gameobjects', opts), { name: 'com.unity.netcode.gameobjects', status: 'ok', source: 'unity-registry', version: '2.14.0' });
  const u = await resolvePackage('com.cysharp.unitask', opts);
  assert.deepEqual([u.source, u.version], ['openupm', '2.5.11']);
});

test('a package on neither registry is missing; one with no compatible version is unresolved', async () => {
  assert.equal((await resolvePackage('com.mirror-networking.mirror', { editor: '6000.4.1f1', get })).status, 'missing');
  assert.equal((await resolvePackage('com.unity.onlynew', { editor: '6000.4.1f1', get })).status, 'unresolved');
});

test('an unknown editor is an error, not a guess', async () => {
  assert.equal((await resolvePackage('com.unity.inputsystem', { editor: undefined, get })).status, 'error');
});

test('buildManifest adds OpenUPM scopes only for packages that need them and sorts dependencies', async () => {
  const results = await resolveAll(['com.unity.inputsystem', 'com.cysharp.unitask', 'com.unity.modules.audio'], { editor: '6000.4.1f1', get });
  const m = buildManifest(results, { dependencies: { 'com.unity.ugui': '2.0.0' } });
  assert.deepEqual(Object.keys(m.dependencies), ['com.cysharp.unitask', 'com.unity.inputsystem', 'com.unity.modules.audio', 'com.unity.ugui']);
  assert.deepEqual(m.scopedRegistries, [{ name: 'OpenUPM', url: 'https://package.openupm.com', scopes: ['com.cysharp.unitask'] }]);
  assert.equal(buildManifest(results.filter((r) => r.source !== 'openupm')).scopedRegistries, undefined);
});

test('the editor line is read from ProjectVersion.txt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'unity-proj-'));
  mkdirSync(join(dir, 'ProjectSettings'));
  writeFileSync(join(dir, 'ProjectSettings', 'ProjectVersion.txt'), 'm_EditorVersion: 6000.4.1f1\nm_EditorVersionWithRevision: 6000.4.1f1 (abc)\n');
  assert.equal(readEditorVersion(dir), '6000.4.1f1');
  assert.equal(readEditorVersion(tmpdir() + '/nope'), null);
});
