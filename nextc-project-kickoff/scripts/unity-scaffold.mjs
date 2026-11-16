#!/usr/bin/env node
// Writes the text files of a Unity project that can be created reliably outside the editor, and reads editor logs.
// It never writes ProjectSettings assets, scenes, or .meta files except the one for BuildScript.cs (same bytes and GUID
// as /unity-build's scaffold, which commits that file). This script is the only writer of Assets/Editor/BuildScript.cs.
// Usage:
//   node unity-scaffold.mjs write --dir D --name Pascal --product "My Game" --editor 6000.4.1f1 [--ui uitoolkit|ugui] [--no-lfs] [--tests]
//   node unity-scaffold.mjs remove-setup --dir D
//   node unity-scaffold.mjs verify-stamp --dir D --product X --company Y --bundle-id Z
//   node unity-scaffold.mjs scan-log --log file
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, isMain } from './lib/util.mjs';

const TEMPLATES = join(dirname(fileURLToPath(import.meta.url)), '..', 'references', 'templates', 'unity');
const tpl = (n) => readFileSync(join(TEMPLATES, n), 'utf8');

export function dirsFor({ ui = 'uitoolkit', tests = true } = {}) {
  const d = [
    'Assets/Scripts/Core', 'Assets/Scripts/Game', 'Assets/Prefabs', 'Assets/Scenes', 'Assets/ScriptableObjects/Config',
    'Assets/ScriptableObjects/Events', 'Assets/Settings', 'Assets/Audio/Music', 'Assets/Audio/SFX', 'Assets/Editor', 'Packages', 'ProjectSettings',
  ];
  if (ui === 'uitoolkit') d.push('Assets/UI/UXML', 'Assets/UI/USS'); else d.push('Assets/UI');
  if (tests) d.push('Assets/Scripts/Tests/EditMode', 'Assets/Scripts/Tests/PlayMode');
  return d;
}

export function asmdef(name, { references = [], editorOnly = false, test = false } = {}) {
  return JSON.stringify({
    name,
    rootNamespace: name,
    references,
    includePlatforms: editorOnly ? ['Editor'] : [],
    excludePlatforms: [],
    allowUnsafeCode: false,
    overrideReferences: test,
    precompiledReferences: test ? ['nunit.framework.dll'] : [],
    autoReferenced: !test,
    defineConstraints: test ? ['UNITY_INCLUDE_TESTS'] : [],
    versionDefines: [],
    noEngineReferences: false,
  }, null, 2) + '\n';
}

// Keeps files the user or Unity may already have edited; BuildScript.cs is always rewritten (single owner).
function put(dir, rel, content, { overwrite = false, report }) {
  const f = join(dir, rel);
  if (existsSync(f) && !overwrite) { report.kept.push(rel); return; }
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, content);
  report.written.push(rel);
}

export function writeScaffold({ dir, name, product, editor, ui = 'uitoolkit', lfs = true, tests = true }) {
  if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) throw new Error(`name "${name}" must be PascalCase letters and digits`);
  if (!/^\d+\.\d+\.\d+[a-z]\d+$/.test(editor)) throw new Error(`editor "${editor}" must look like 6000.4.1f1`);
  const report = { written: [], kept: [], dirs: [] };
  for (const d of dirsFor({ ui, tests })) {
    const p = join(dir, d);
    mkdirSync(p, { recursive: true });
    report.dirs.push(d);
    if (d.startsWith('Assets/') && !d.startsWith('Assets/Scripts/Tests') && !existsSync(join(p, '.gitkeep'))) writeFileSync(join(p, '.gitkeep'), '');
  }
  put(dir, 'ProjectSettings/ProjectVersion.txt', `m_EditorVersion: ${editor}\n`, { report });
  put(dir, `Assets/Scripts/Core/${name}.Core.asmdef`, asmdef(`${name}.Core`), { report });
  put(dir, `Assets/Scripts/Game/${name}.Game.asmdef`, asmdef(`${name}.Game`, { references: [`${name}.Core`] }), { report });
  if (tests) {
    const runner = ['UnityEngine.TestRunner', 'UnityEditor.TestRunner'];
    put(dir, `Assets/Scripts/Tests/EditMode/${name}.EditMode.asmdef`, asmdef(`${name}.EditMode`, { references: [`${name}.Core`, `${name}.Game`, ...runner], editorOnly: true, test: true }), { report });
    put(dir, `Assets/Scripts/Tests/PlayMode/${name}.PlayMode.asmdef`, asmdef(`${name}.PlayMode`, { references: [`${name}.Core`, `${name}.Game`, ...runner], test: true }), { report });
  }
  put(dir, 'Assets/Editor/BuildScript.cs', tpl('BuildScript.cs'), { overwrite: true, report });
  put(dir, 'Assets/Editor/BuildScript.cs.meta', tpl('BuildScript.cs.meta'), { overwrite: true, report });
  put(dir, 'Assets/Editor/KickoffSetup.cs', tpl('KickoffSetup.cs'), { overwrite: true, report });
  put(dir, '.gitignore', tpl('gitignore'), { report });
  put(dir, '.gitattributes', tpl('gitattributes') + (lfs ? tpl('gitattributes-lfs') : ''), { report });
  put(dir, '.editorconfig', tpl('editorconfig'), { report });
  put(dir, 'Makefile', tpl('Makefile').replaceAll('__PRODUCT_NAME__', product || name), { report });
  return report;
}

export function removeSetup(dir) {
  const removed = [];
  for (const rel of ['Assets/Editor/KickoffSetup.cs', 'Assets/Editor/KickoffSetup.cs.meta']) {
    const f = join(dir, rel);
    if (existsSync(f)) { rmSync(f); removed.push(rel); }
  }
  return removed;
}

// ASSUMPTION: Unity's text serialization of ProjectSettings.asset (Force Text is the default since 2014); a binary asset yields "unreadable".
export function verifyStamp(dir, { product, company, bundleId }) {
  const f = join(dir, 'ProjectSettings', 'ProjectSettings.asset');
  if (!existsSync(f)) return { ok: false, problems: ['ProjectSettings/ProjectSettings.asset does not exist yet (Unity has not generated it)'] };
  const text = readFileSync(f, 'utf8');
  const problems = [];
  const scalar = (k) => (new RegExp(`^\\s{2}${k}:\\s*(.*)$`, 'm').exec(text) || [])[1]?.trim();
  if (scalar('productName') !== product) problems.push(`productName is "${scalar('productName')}", expected "${product}"`);
  if (scalar('companyName') !== company) problems.push(`companyName is "${scalar('companyName')}", expected "${company}"`);
  const block = /^\s{2}applicationIdentifier:\n((?:\s{4}.*\n)+)/m.exec(text);
  if (!block) problems.push('applicationIdentifier block not found');
  else {
    const ids = Object.fromEntries([...block[1].matchAll(/^\s{4}([A-Za-z0-9]+):\s*(.*)$/gm)].map((m) => [m[1], m[2].trim()]));
    for (const k of ['Android', 'iPhone', 'Standalone']) if (ids[k] !== bundleId) problems.push(`applicationIdentifier.${k} is "${ids[k]}", expected "${bundleId}"`);
  }
  return { ok: problems.length === 0, problems };
}

export function scanLog(text) {
  const errors = [...new Set((text.match(/^.*error CS\d+.*$/gm) || []).map((l) => l.trim()))];
  const license = /No valid Unity Editor license|licensing.*(failed|error)|Failed to activate|com\.unity\.licensing/i.test(text);
  const abort = /Aborting batchmode due to failure/i.test(text);
  const clean = /Exiting batchmode successfully now!/i.test(text);
  const alreadyOpen = /another Unity instance is running with this project open|Multiple Unity instances cannot open the same project/i.test(text);
  const compileFailed = errors.length > 0 || /Scripts have compiler errors|Compilation failed/i.test(text);
  let compiled = 'unknown';
  if (compileFailed) compiled = 'failed';
  else if (clean) compiled = 'passed';
  return { compiled, errors, exitedCleanly: clean, aborted: abort, licenseProblem: license, projectAlreadyOpen: alreadyOpen };
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const a = parseArgs(rest, { flags: ['no-lfs', 'tests', 'no-tests'] });
  try {
    let out;
    if (cmd === 'write') out = writeScaffold({ dir: a.dir, name: a.name, product: a.product, editor: a.editor, ui: a.ui || 'uitoolkit', lfs: !a['no-lfs'], tests: !a['no-tests'] });
    else if (cmd === 'remove-setup') out = { removed: removeSetup(a.dir) };
    else if (cmd === 'verify-stamp') out = verifyStamp(a.dir, { product: a.product, company: a.company, bundleId: a['bundle-id'] });
    else if (cmd === 'scan-log') out = scanLog(readFileSync(a.log, 'utf8'));
    else throw new Error('commands: write remove-setup verify-stamp scan-log');
    console.log(JSON.stringify(out, null, 2));
    if (out.ok === false) process.exit(1);
    if (out.compiled === 'failed') process.exit(1);
  } catch (e) {
    console.error(`unity-scaffold: ${e.message}`);
    process.exit(2);
  }
}

if (isMain(import.meta.url)) main();
