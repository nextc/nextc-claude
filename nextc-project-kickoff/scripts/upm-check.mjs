#!/usr/bin/env node
// Resolves Unity packages at run time for a given editor line and writes/merges Packages/manifest.json.
// Order per package: editor-bundled (BuiltInPackages) -> built-in module -> Unity registry -> OpenUPM.
// Usage: node upm-check.mjs --project <dir> [--editor 6000.4.1f1] [--editor-app <Unity.app dir>] [--allow-pre] [--write] <pkg>...
// Exit: 0 all resolved, 1 a package is unresolved, 2 network/usage error.
import { readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { compareSemver, isPrerelease, fetchJson, writeJsonAtomic, parseArgs, isMain } from './lib/util.mjs';

export const UNITY_REGISTRY = 'https://packages.unity.com';
export const OPENUPM_REGISTRY = 'https://package.openupm.com';
// Packages whose version is tied to the editor; the public registry only carries stale lines of them.
const EDITOR_BOUND = [/^com\.unity\.render-pipelines\./, /^com\.unity\.shadergraph$/, /^com\.unity\.visualeffectgraph$/, /^com\.unity\.ugui$/, /^com\.unity\.ui$/, /^com\.unity\.textmeshpro$/];

export function editorLine(version) {
  const m = /^(\d+)\.(\d+)/.exec(String(version || '').trim());
  return m ? { major: +m[1], minor: +m[2], text: `${m[1]}.${m[2]}` } : null;
}

export function readEditorVersion(projectDir) {
  const f = join(projectDir, 'ProjectSettings', 'ProjectVersion.txt');
  if (!existsSync(f)) return null;
  const m = /m_EditorVersion:\s*(\S+)/.exec(readFileSync(f, 'utf8'));
  return m ? m[1] : null;
}

function unityMinOk(minUnity, line) {
  if (!minUnity) return true;
  const m = editorLine(minUnity);
  if (!m) return true;
  return m.major < line.major || (m.major === line.major && m.minor <= line.minor);
}

export function pickVersion(meta, line, { allowPre = false } = {}) {
  const versions = Object.keys((meta && meta.versions) || {});
  const ok = versions
    .filter((v) => (allowPre || !isPrerelease(v)) && unityMinOk(meta.versions[v].unity, line))
    .sort(compareSemver);
  return ok.length ? ok[ok.length - 1] : null;
}

function bundledVersion(editorApp, name) {
  if (!editorApp) return null;
  const f = join(editorApp, 'Contents', 'Resources', 'PackageManager', 'BuiltInPackages', name, 'package.json');
  if (!existsSync(f)) return null;
  try {
    return JSON.parse(readFileSync(f, 'utf8')).version || null;
  } catch {
    return null;
  }
}

export async function resolvePackage(name, { editor, editorApp, allowPre = false, get = fetchJson } = {}) {
  const line = editorLine(editor);
  if (!line) return { name, status: 'error', message: 'editor version unknown: pass --editor or a project with ProjectSettings/ProjectVersion.txt' };
  const bundled = bundledVersion(editorApp, name);
  if (bundled) return { name, status: 'ok', source: 'editor-bundled', version: bundled };
  if (/^com\.unity\.modules\./.test(name)) return { name, status: 'ok', source: 'builtin', version: '1.0.0' };
  const bound = EDITOR_BOUND.some((r) => r.test(name));
  if (bound) {
    return { name, status: 'unresolved', source: 'editor-bound', message: `${name} is versioned with the editor and the editor install was not found; add it in Window > Package Manager, or pass --editor-app` };
  }
  for (const [label, base] of [['unity-registry', UNITY_REGISTRY], ['openupm', OPENUPM_REGISTRY]]) {
    let res;
    try {
      res = await get(`${base}/${name}`);
    } catch (e) {
      return { name, status: 'error', message: `network error reaching ${label}: ${e.message}` };
    }
    if (res.status === 404 || (res.json && res.json.error)) continue;
    if (res.status !== 200 || !res.json) return { name, status: 'error', message: `${label} answered HTTP ${res.status}` };
    const v = pickVersion(res.json, line, { allowPre });
    if (!v) {
      return { name, status: 'unresolved', source: label, message: `${name} exists on ${label} but no ${allowPre ? '' : 'stable '}version supports editor ${line.text}` };
    }
    return { name, status: 'ok', source: label, version: v };
  }
  return { name, status: 'missing', message: `${name} was not found on the Unity registry or OpenUPM (check the package id; it may be distributed only through the Asset Store or a git URL)` };
}

export async function resolveAll(names, opts) {
  const results = [];
  for (const n of [...new Set(names)]) results.push(await resolvePackage(n, opts));
  return results;
}

export function buildManifest(results, existing = { dependencies: {} }) {
  const manifest = { ...existing, dependencies: { ...(existing.dependencies || {}) } };
  const scopes = new Set();
  for (const r of results) {
    if (r.status !== 'ok') continue;
    manifest.dependencies[r.name] = r.version;
    if (r.source === 'openupm') scopes.add(r.name);
  }
  if (scopes.size) {
    const regs = [...(manifest.scopedRegistries || [])];
    let open = regs.find((x) => x.url === OPENUPM_REGISTRY);
    if (!open) {
      open = { name: 'OpenUPM', url: OPENUPM_REGISTRY, scopes: [] };
      regs.push(open);
    }
    open.scopes = [...new Set([...(open.scopes || []), ...scopes])].sort();
    manifest.scopedRegistries = regs;
  }
  manifest.dependencies = Object.fromEntries(Object.entries(manifest.dependencies).sort(([a], [b]) => a.localeCompare(b)));
  return manifest;
}

export function findInstalledEditorApp(version, root = '/Applications/Unity/Hub/Editor') {
  const app = join(root, version, 'Unity.app');
  return existsSync(app) ? app : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2), { flags: ['write', 'allow-pre', 'json'] });
  const project = args.project || '.';
  const editor = args.editor || readEditorVersion(project);
  const editorApp = args['editor-app'] || (editor ? findInstalledEditorApp(editor) : null);
  const names = args._;
  if (!names.length || !editor) {
    console.error('usage: upm-check.mjs --project <dir> [--editor 6000.4.1f1] [--editor-app <Unity.app>] [--allow-pre] [--write] <pkg>...');
    process.exit(2);
  }
  const results = await resolveAll(names, { editor, editorApp, allowPre: !!args['allow-pre'] });
  if (args.json) console.log(JSON.stringify({ editor, editorApp, results }, null, 2));
  else {
    console.log(`Editor ${editor}${editorApp ? '' : ' (install not found; editor-bundled versions unavailable)'}`);
    for (const r of results) console.log(r.status === 'ok' ? `OK ${r.name} ${r.version} [${r.source}]` : `${r.status.toUpperCase()} ${r.name}: ${r.message}`);
  }
  if (args.write) {
    const f = join(project, 'Packages', 'manifest.json');
    const existing = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : { dependencies: {} };
    mkdirSync(join(project, 'Packages'), { recursive: true });
    writeJsonAtomic(f, buildManifest(results, existing));
  }
  if (results.some((r) => r.status === 'error')) process.exit(2);
  process.exit(results.every((r) => r.status === 'ok') ? 0 : 1);
}

if (isMain(import.meta.url)) main();
