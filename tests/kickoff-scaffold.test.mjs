// nextc-project-kickoff identity, stamp-app-id and unity-scaffold scripts against temp fixtures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { deriveIdentity, normalizeOrg } from '../nextc-project-kickoff/scripts/identity.mjs';
import { stamp, setAndroidId, readAndroidId, setBundleIds } from '../nextc-project-kickoff/scripts/stamp-app-id.mjs';
import { writeScaffold, removeSetup, verifyStamp, scanLog, asmdef } from '../nextc-project-kickoff/scripts/unity-scaffold.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'scaf-'));
const put = (dir, rel, c) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), c); };

test('identity: one app id for Android and iOS, no underscores, org normalised', () => {
  assert.deepEqual(deriveIdentity({ name: 'My Cool App', org: 'acme' }), { product_name: 'My Cool App', slug: 'my_cool_app', org: 'com.acme', app_id: 'com.acme.mycoolapp' });
  assert.equal(deriveIdentity({ name: 'Nestly', org: 'com.nestly', kind: 'unity' }).slug, 'Nestly');
  assert.equal(deriveIdentity({ name: '2048 Plus', org: 'a' }).slug, 'app_2048_plus');
  assert.equal(deriveIdentity({ name: 'Test', org: 'a' }).slug, 'test_app');
  assert.equal(normalizeOrg('Com.Acme'), 'com.acme');
  assert.throws(() => normalizeOrg('my_org'), /lowercase/);
  assert.throws(() => normalizeOrg(''), /required/);
});

test('stamp-app-id edits build.gradle.kts, build.gradle and pbxproj, and is a no-op when equal', () => {
  const kts = 'android {\n  defaultConfig {\n    applicationId = "com.acme.my_app"\n    minSdk = flutter.minSdkVersion\n  }\n}\n';
  const groovy = "defaultConfig {\n    applicationId 'com.acme.my_app'\n}\n";
  assert.equal(readAndroidId(kts), 'com.acme.my_app');
  assert.match(setAndroidId(kts, 'com.acme.myapp'), /applicationId = "com\.acme\.myapp"/);
  assert.match(setAndroidId(groovy, 'com.acme.myapp'), /applicationId 'com\.acme\.myapp'/);
  assert.throws(() => setAndroidId('nothing here', 'x'), /no applicationId/);

  const pbx = 'PRODUCT_BUNDLE_IDENTIFIER = com.acme.myApp;\nPRODUCT_BUNDLE_IDENTIFIER = com.acme.myApp.RunnerTests;\nPRODUCT_BUNDLE_IDENTIFIER = "$(X)";\n';
  const out = setBundleIds(pbx, 'com.acme.myapp');
  assert.match(out, /= com\.acme\.myapp;/);
  assert.match(out, /= com\.acme\.myapp\.RunnerTests;/);

  const dir = tmp();
  put(dir, 'android/app/build.gradle.kts', kts);
  put(dir, 'ios/Runner.xcodeproj/project.pbxproj', pbx);
  assert.deepEqual(stamp({ dir, appId: 'com.acme.myapp', check: true }).changed, []);
  assert.equal(stamp({ dir, appId: 'com.acme.myapp' }).changed.length, 2);
  assert.equal(stamp({ dir, appId: 'com.acme.myapp' }).changed.length, 0);
  assert.match(readFileSync(join(dir, 'android/app/build.gradle.kts'), 'utf8'), /com\.acme\.myapp/);
});

test('unity scaffold writes text files only, with BuildScript matching the /unity-build contract', () => {
  const dir = tmp();
  const r = writeScaffold({ dir, name: 'Nestly', product: 'Nestly', editor: '6000.4.1f1' });
  assert.ok(r.written.includes('Assets/Editor/BuildScript.cs'));
  const build = readFileSync(join(dir, 'Assets/Editor/BuildScript.cs'), 'utf8');
  assert.match(build, /public static void BuildAndroid\(\)/);
  assert.match(build, /public static void BuildIOS\(\)/);
  for (const a of ['-appname', '-buildVersion', '-buildNumber', '-developmentBuild']) assert.ok(build.includes(a), a);
  assert.match(build, /Builds\/Android|"Builds\/Android"/);
  assert.equal(readFileSync(join(dir, 'ProjectSettings/ProjectVersion.txt'), 'utf8'), 'm_EditorVersion: 6000.4.1f1\n');
  assert.ok(!existsSync(join(dir, 'ProjectSettings/ProjectSettings.asset')));
  assert.ok(!existsSync(join(dir, 'Assets/Scenes/Main.unity')));
  const mk = readFileSync(join(dir, 'Makefile'), 'utf8');
  assert.match(mk, /BuildScript\.BuildAndroid/);
  assert.match(mk, /BuildScript\.BuildIOS/);
  assert.doesNotMatch(mk, /BuildiOS|BuildStandalone|BuildWebGL/);
  assert.doesNotMatch(mk, /\[unity_version\]|__PRODUCT_NAME__/);
  assert.match(readFileSync(join(dir, '.gitattributes'), 'utf8'), /filter=lfs/);
  const core = JSON.parse(readFileSync(join(dir, 'Assets/Scripts/Core/Nestly.Core.asmdef'), 'utf8'));
  assert.equal(core.name, 'Nestly.Core');
  const edit = JSON.parse(readFileSync(join(dir, 'Assets/Scripts/Tests/EditMode/Nestly.EditMode.asmdef'), 'utf8'));
  assert.deepEqual(edit.includePlatforms, ['Editor']);
});

test('unity scaffold is idempotent: user edits are kept, BuildScript is always restored, LFS can be off', () => {
  const dir = tmp();
  writeScaffold({ dir, name: 'Nestly', editor: '6000.4.1f1', lfs: false });
  assert.doesNotMatch(readFileSync(join(dir, '.gitattributes'), 'utf8'), /lfs/);
  writeFileSync(join(dir, '.gitignore'), 'custom\n');
  writeFileSync(join(dir, 'Assets/Editor/BuildScript.cs'), 'tampered');
  const r = writeScaffold({ dir, name: 'Nestly', editor: '6000.4.1f1' });
  assert.ok(r.kept.includes('.gitignore'));
  assert.equal(readFileSync(join(dir, '.gitignore'), 'utf8'), 'custom\n');
  assert.match(readFileSync(join(dir, 'Assets/Editor/BuildScript.cs'), 'utf8'), /BuildAndroid/);
  assert.throws(() => writeScaffold({ dir, name: 'bad name', editor: '6000.4.1f1' }), /PascalCase/);
  assert.throws(() => writeScaffold({ dir, name: 'Nestly', editor: '6000.4' }), /editor/);
  assert.deepEqual(removeSetup(dir), ['Assets/Editor/KickoffSetup.cs']);
  assert.deepEqual(removeSetup(dir), []);
  assert.deepEqual(JSON.parse(asmdef('X', { test: true })).defineConstraints, ['UNITY_INCLUDE_TESTS']);
});

test('verify-stamp reads the generated ProjectSettings.asset and reports mismatches', () => {
  const dir = tmp();
  assert.equal(verifyStamp(dir, { product: 'Nestly', company: 'nestly', bundleId: 'com.nestly.nestly' }).ok, false);
  const asset = `PlayerSettings:\n  companyName: nestly\n  productName: Nestly\n  applicationIdentifier:\n    Android: com.nestly.nestly\n    Standalone: com.nestly.nestly\n    iPhone: com.nestly.nestly\n  buildNumber:\n    iPhone: 0\n`;
  put(dir, 'ProjectSettings/ProjectSettings.asset', asset);
  assert.equal(verifyStamp(dir, { product: 'Nestly', company: 'nestly', bundleId: 'com.nestly.nestly' }).ok, true);
  put(dir, 'ProjectSettings/ProjectSettings.asset', asset.replace('Android: com.nestly.nestly', 'Android: com.DefaultCompany.x'));
  const bad = verifyStamp(dir, { product: 'Nestly', company: 'nestly', bundleId: 'com.nestly.nestly' });
  assert.equal(bad.ok, false);
  assert.match(bad.problems[0], /Android/);
});

test('scan-log separates compile errors, clean exit, licence problems and an already-open project', () => {
  assert.equal(scanLog('Assets/A.cs(3,5): error CS1002: ; expected\nAborting batchmode due to failure').compiled, 'failed');
  assert.deepEqual(scanLog('Assets/A.cs(3,5): error CS1002: ; expected\nAssets/A.cs(3,5): error CS1002: ; expected').errors.length, 1);
  assert.equal(scanLog('Compilation succeeded\nExiting batchmode successfully now!').compiled, 'passed');
  assert.equal(scanLog('nothing useful').compiled, 'unknown');
  assert.equal(scanLog('No valid Unity Editor license found. Please activate your license.').licenseProblem, true);
  assert.equal(scanLog('It looks like another Unity instance is running with this project open.').projectAlreadyOpen, true);
});
