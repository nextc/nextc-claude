#!/usr/bin/env node
// Fails when the kickoff docs do not trace back to the proposal extract.
// Checks: extract shape, every feature id in architecture.md and tasks.md (with a Verify line and ordered dependencies),
// entities and integrations named in architecture.md, relative doc links resolve, every dependency explained.
// Usage: node coverage-check.mjs --dir <project> [--extract <path>] [--kind flutter|unity] [--exempt a,b] [--json]
//        node coverage-check.mjs --dir <project> --extract-only   (validates .kickoff/proposal-extract.json only)
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { parseArgs, isMain } from './lib/util.mjs';

const FEATURE_ID = /^F\d{1,3}$/;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (w) => new RegExp(`(^|[^A-Za-z0-9_.-])${esc(w)}($|[^A-Za-z0-9_-])`, 'i');
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : null);

export function validateExtract(x) {
  const errs = [];
  if (!x || typeof x !== 'object') return ['extract is not an object'];
  if (!x.product || !x.product.name) errs.push('product.name missing');
  if (!Array.isArray(x.features) || !x.features.length) errs.push('features must be a non-empty array');
  else {
    const seen = new Set();
    for (const f of x.features) {
      if (!f.id || !FEATURE_ID.test(f.id)) errs.push(`feature id "${f.id}" must match F<number>`);
      else if (seen.has(f.id)) errs.push(`duplicate feature id ${f.id}`);
      else seen.add(f.id);
      if (!f.name) errs.push(`feature ${f.id} has no name`);
    }
  }
  for (const k of ['entities', 'integrations', 'non_goals', 'constraints']) if (x[k] !== undefined && !Array.isArray(x[k])) errs.push(`${k} must be an array`);
  return errs;
}

export function sectionText(md, headingRe) {
  const lines = md.split('\n');
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.*)$/.exec(lines[i]);
    if (m && headingRe.test(m[2])) { start = i; level = m[1].length; break; }
  }
  if (start < 0) return null;
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const m = /^(#{1,6})\s/.exec(lines[i]);
    if (m && m[1].length <= level) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}

export function parseTasks(md) {
  const blocks = [];
  let cur = null;
  for (const line of md.split('\n')) {
    if (/^- \[[ xX]\] /.test(line)) { cur = { text: line, id: null }; blocks.push(cur); }
    else if (/^#{1,6}\s/.test(line)) cur = null;
    else if (cur) cur.text += `\n${line}`;
  }
  for (const b of blocks) {
    b.id = (/\*\*(T\d+)\b/.exec(b.text) || [])[1] || null;
    b.features = [...new Set(b.text.match(/\bF\d{1,3}\b/g) || [])];
    const dep = /depends?:\s*([^\n]*)/i.exec(b.text);
    b.depends = dep ? (dep[1].match(/\bT\d+\b/g) || []) : [];
    b.hasVerify = /verify:/i.test(b.text);
  }
  return blocks;
}

export function parsePubspecDeps(text) {
  const names = [];
  let inDeps = false;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^(dependencies|dev_dependencies):\s*$/.test(line)) { inDeps = true; continue; }
    if (/^\S/.test(line) && !line.startsWith('#')) { inDeps = false; continue; }
    const m = inDeps && /^ {2}([a-z][a-z0-9_]*):(.*)$/.exec(line);
    if (!m) continue;
    const rest = m[2].trim();
    let sdk = /^sdk:\s*/.test(rest);
    if (!rest || rest.startsWith('#')) {
      for (let j = i + 1; j < lines.length && /^ {4}/.test(lines[j]); j++) if (/^ {4}sdk:/.test(lines[j])) sdk = true;
    }
    if (!sdk) names.push(m[1]);
  }
  return names;
}

export function listMarkdown(dir) {
  const out = [];
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p); else if (e.endsWith('.md')) out.push(p);
    }
  };
  walk(join(dir, 'docs'));
  for (const f of ['README.md', 'AGENTS.md', 'CLAUDE.md']) if (existsSync(join(dir, f))) out.push(join(dir, f));
  return out;
}

export function brokenLinks(dir, files) {
  const broken = [];
  for (const f of files) {
    let inFence = false;
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
      if (inFence) continue;
      const targets = [...line.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]);
      const imp = /^@(\S+)/.exec(line);
      if (imp) targets.push(imp[1]);
      for (const raw of targets) {
        if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('#') || raw.startsWith('/')) continue;
        const path = raw.split('#')[0].split('?')[0];
        if (!path) continue;
        if (!existsSync(resolve(dirname(f), path))) broken.push(`${relative(dir, f)} -> ${raw}`);
      }
    }
  }
  return broken;
}

function loadDependencies(dir, kind) {
  const pub = read(join(dir, 'pubspec.yaml'));
  if (pub && kind !== 'unity') return { names: parsePubspecDeps(pub), source: 'pubspec.yaml' };
  const man = read(join(dir, 'Packages', 'manifest.json'));
  if (man && kind !== 'flutter') {
    const names = Object.keys(JSON.parse(man).dependencies || {}).filter((n) => !n.startsWith('com.unity.modules.'));
    return { names, source: 'Packages/manifest.json' };
  }
  const st = read(join(dir, '.kickoff', 'state.json'));
  if (st) return { names: (JSON.parse(st).dependencies || []).map((d) => d.name), source: '.kickoff/state.json (planned, no project files yet)' };
  return { names: [], source: 'none found' };
}

export function runCoverage({ dir, extractPath, kind, exempt = [] }) {
  const checks = [];
  const add = (name, details) => checks.push({ name, ok: details.length === 0, details });
  const exPath = extractPath || join(dir, '.kickoff', 'proposal-extract.json');
  let extract = null;
  try { extract = JSON.parse(read(exPath) ?? 'null'); } catch (e) { add('extract', [`cannot parse ${exPath}: ${e.message}`]); }
  if (extract === null && !checks.length) add('extract', [`missing ${exPath}`]);
  if (!extract) return { ok: false, checks };
  const exErrs = validateExtract(extract);
  add('extract', exErrs);
  if (exErrs.length) return { ok: false, checks };

  const arch = read(join(dir, 'docs', 'architecture.md'));
  const tasksMd = read(join(dir, 'docs', 'tasks.md'));
  if (arch === null) add('architecture.md', ['docs/architecture.md does not exist']);
  if (tasksMd === null) add('tasks.md', ['docs/tasks.md does not exist']);

  const ids = extract.features.map((f) => f.id);
  if (arch !== null) {
    add('features in architecture.md', ids.filter((id) => !wordRe(id).test(arch)).map((id) => `${id} (${extract.features.find((f) => f.id === id).name}) not mentioned`));
    add('entities in architecture.md', (extract.entities || []).filter((e) => !wordRe(e.name || String(e)).test(arch)).map((e) => `entity ${e.name || e} not mentioned`));
    add('integrations in architecture.md', (extract.integrations || []).filter((e) => !wordRe(e.name || String(e)).test(arch)).map((e) => `integration ${e.name || e} not mentioned`));
    if (!/^#{1,6}\s+.*non-?goals?/im.test(arch) && (extract.non_goals || []).length) add('non-goals section', ['architecture.md has no "Non-goals" heading but the extract lists non-goals']);
  }
  if (tasksMd !== null) {
    const blocks = parseTasks(tasksMd);
    const details = [];
    for (const id of ids) {
      const mine = blocks.filter((b) => b.features.includes(id));
      if (!mine.length) details.push(`${id} has no task in tasks.md`);
      else if (!mine.some((b) => b.hasVerify)) details.push(`${id} has tasks but none with a "Verify:" line`);
    }
    blocks.forEach((b) => { if (!b.hasVerify) details.push(`${b.id || b.text.split('\n')[0].slice(0, 40)} has no "Verify:" line`); });
    add('features and verify lines in tasks.md', details);
    const order = [];
    const defined = new Set();
    for (const b of blocks) {
      for (const d of b.depends) if (!defined.has(d)) order.push(`${b.id} depends on ${d}, which is not defined earlier`);
      if (b.id) defined.add(b.id);
    }
    add('task dependency order', order);
  }

  add('relative links resolve', brokenLinks(dir, listMarkdown(dir)));

  const deps = loadDependencies(dir, kind);
  if (arch !== null) {
    const section = sectionText(arch, /dependenc/i);
    const skip = new Set(exempt);
    const unexplained = section === null
      ? (deps.names.length ? [`architecture.md has no "Dependencies" section but ${deps.source} declares ${deps.names.length} packages`] : [])
      : deps.names.filter((n) => !skip.has(n) && !wordRe(n).test(section)).map((n) => `${n} (${deps.source}) is not explained in the Dependencies section`);
    add('dependencies explained', unexplained);
  }
  return { ok: checks.every((c) => c.ok), checks };
}

function main() {
  const a = parseArgs(process.argv.slice(2), { flags: ['json', 'extract-only'] });
  if (a['extract-only']) {
    const f = a.extract || join(a.dir || '.', '.kickoff', 'proposal-extract.json');
    let errs;
    try { errs = validateExtract(JSON.parse(readFileSync(f, 'utf8'))); } catch (e) { errs = [`cannot read ${f}: ${e.message}`]; }
    errs.forEach((e) => console.log(`FAIL  ${e}`));
    console.log(errs.length ? 'extract: FAIL' : 'extract: PASS');
    process.exit(errs.length ? 1 : 0);
  }
  const r = runCoverage({ dir: a.dir || '.', extractPath: a.extract, kind: a.kind, exempt: a.exempt ? a.exempt.split(',') : [] });
  if (a.json) console.log(JSON.stringify(r, null, 2));
  else {
    for (const c of r.checks) {
      console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}`);
      c.details.forEach((d) => console.log(`        - ${d}`));
    }
    console.log(r.ok ? 'coverage: PASS' : 'coverage: FAIL');
  }
  process.exit(r.ok ? 0 : 1);
}

if (isMain(import.meta.url)) main();
