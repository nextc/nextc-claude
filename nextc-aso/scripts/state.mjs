#!/usr/bin/env node
// The only writer of aso/.pipeline-state.json. Timestamps come from the clock, never from the model.
//
//   state.mjs init --mode run|audit|express --app "<name>" [--auto]
//   state.mjs step <name> start|done|failed|skipped [--note "..."] [--files a,b]
//   state.mjs source <name> available|unavailable|used [--note "..."]
//   state.mjs assume "<assumption made under --auto>"
//   state.mjs show
//   state.mjs snapshot                 copies proposed metadata, keywords.csv and listings to aso/.snapshots/<time>/
//   state.mjs diff [--out file]        what changed since the previous run's snapshot (markdown)
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, readJson, writeJson, writeText, isoNow, parseCsv, isMain, die } from './lib/common.mjs';

export const STATUSES = ['start', 'done', 'failed', 'skipped'];

export function statePath(root) {
  return path.join(root, '.pipeline-state.json');
}

export function load(root) {
  const f = statePath(root);
  if (!fs.existsSync(f)) throw new Error(`No state at ${f}. Run: state.mjs init --mode <mode> --app "<name>"`);
  return readJson(f);
}

// One clock reading per operation, so updatedAt equals the event's own timestamp.
function save(root, state, at) {
  state.updatedAt = at;
  writeJson(statePath(root), state);
  return state;
}

export function init(root, { mode, app, auto = false }, now = () => Date.now()) {
  if (!['run', 'audit', 'express'].includes(mode)) throw new Error('mode must be run, audit or express');
  const t = isoNow(now());
  const previous = fs.existsSync(statePath(root)) ? readJson(statePath(root)) : null;
  const state = {
    schema: 2,
    app: app || previous?.app || null,
    mode,
    auto: Boolean(auto),
    runId: t.replace(/[:.]/g, '-'),
    startedAt: t,
    updatedAt: t,
    previousRunId: previous?.runId ?? null,
    steps: [],
    dataSources: [],
    assumptions: [],
    snapshots: previous?.snapshots ?? [],
  };
  return save(root, state, t);
}

export function step(root, name, status, { note = '', files = [] } = {}, now = () => Date.now()) {
  if (!STATUSES.includes(status)) throw new Error(`status must be one of ${STATUSES.join(', ')}`);
  const state = load(root);
  const t = isoNow(now());
  let s = [...state.steps].reverse().find((x) => x.name === name && x.status === 'running');
  if (status === 'start') {
    state.steps.push({ name, status: 'running', startedAt: t, endedAt: null, note, files });
  } else {
    if (!s) {
      s = { name, status: 'running', startedAt: null, endedAt: null, note: '', files: [] };
      state.steps.push(s);
    }
    s.status = status;
    s.endedAt = t;
    if (note) s.note = note;
    if (files.length) s.files = files;
  }
  return save(root, state, t);
}

export function source(root, name, status, { note = '' } = {}, now = () => Date.now()) {
  const state = load(root);
  const t = isoNow(now());
  state.dataSources = state.dataSources.filter((d) => d.name !== name);
  state.dataSources.push({ name, status, note, at: t });
  return save(root, state, t);
}

export function assume(root, text, now = () => Date.now()) {
  const state = load(root);
  const t = isoNow(now());
  state.assumptions.push({ at: t, text });
  return save(root, state, t);
}

export function show(state) {
  const lines = [
    `ASO run ${state.runId} — ${state.app ?? 'unnamed app'} — mode ${state.mode}${state.auto ? ' (--auto)' : ''}`,
    `Started ${state.startedAt}; last update ${state.updatedAt}`,
    '',
    '| Step | Status | Started | Ended | Note |',
    '|---|---|---|---|---|',
    ...state.steps.map((s) => `| ${s.name} | ${s.status} | ${s.startedAt ?? ''} | ${s.endedAt ?? ''} | ${s.note ?? ''} |`),
  ];
  if (state.dataSources.length) lines.push('', 'Data sources:', ...state.dataSources.map((d) => `- ${d.name}: ${d.status}${d.note ? ` — ${d.note}` : ''} (${d.at})`));
  if (state.assumptions.length) lines.push('', 'Assumptions:', ...state.assumptions.map((a) => `- ${a.text} (${a.at})`));
  const open = state.steps.filter((s) => s.status === 'running' || s.status === 'failed');
  if (open.length) lines.push('', `Unfinished or failed: ${open.map((s) => `${s.name} (${s.status})`).join(', ')}`);
  return lines.join('\n') + '\n';
}

function listFiles(dir, rx) {
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => rx.test(f)).sort() : [];
}

export function snapshot(root, now = () => Date.now()) {
  const state = load(root);
  const t = isoNow(now());
  const dir = path.join(root, '.snapshots', t.replace(/[:.]/g, '-'));
  fs.mkdirSync(path.join(dir, 'metadata'), { recursive: true });
  const copied = [];
  for (const f of listFiles(path.join(root, 'metadata'), /^[^.]+\.json$/)) {
    fs.copyFileSync(path.join(root, 'metadata', f), path.join(dir, 'metadata', f));
    copied.push(`metadata/${f}`);
  }
  for (const f of ['keywords.csv', 'report.md']) {
    if (fs.existsSync(path.join(root, f))) { fs.copyFileSync(path.join(root, f), path.join(dir, f)); copied.push(f); }
  }
  for (const f of listFiles(path.join(root, 'data'), /^listing-.*\.json$/)) {
    fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
    fs.copyFileSync(path.join(root, 'data', f), path.join(dir, 'data', f));
    copied.push(`data/${f}`);
  }
  writeJson(path.join(dir, 'snapshot.json'), { runId: state.runId, createdAt: t, files: copied });
  state.snapshots.push({ runId: state.runId, at: t, dir: path.relative(root, dir) });
  save(root, state, t);
  return { dir, files: copied };
}

const keyOf = (r) => `${r.platform}|${r.country}|${r.term}`;

export function diffSnapshots(prevDir, root) {
  const lines = [];
  const prevMetaDir = path.join(prevDir, 'metadata');
  const curMetaDir = path.join(root, 'metadata');
  const locales = new Set([...listFiles(prevMetaDir, /^[^.]+\.json$/), ...listFiles(curMetaDir, /^[^.]+\.json$/)]);
  for (const f of locales) {
    const a = fs.existsSync(path.join(prevMetaDir, f)) ? readJson(path.join(prevMetaDir, f)) : {};
    const b = fs.existsSync(path.join(curMetaDir, f)) ? readJson(path.join(curMetaDir, f)) : {};
    for (const platform of ['ios', 'android']) {
      const fields = new Set([...Object.keys(a[platform] || {}), ...Object.keys(b[platform] || {})]);
      for (const field of fields) {
        const pa = a[platform]?.[field]?.proposed ?? null;
        const pb = b[platform]?.[field]?.proposed ?? null;
        if (pa !== pb) lines.push(`- ${f.replace('.json', '')} ${platform}.${field}: proposed "${pa ?? '—'}" → "${pb ?? '—'}"`);
        const ca = a[platform]?.[field]?.current ?? null;
        const cb = b[platform]?.[field]?.current ?? null;
        if (ca !== cb) lines.push(`- ${f.replace('.json', '')} ${platform}.${field}: live value changed "${ca ?? '—'}" → "${cb ?? '—'}"`);
      }
    }
  }
  const read = (f) => (fs.existsSync(f) ? parseCsv(fs.readFileSync(f, 'utf8')) : []);
  const before = new Map(read(path.join(prevDir, 'keywords.csv')).map((r) => [keyOf(r), r]));
  for (const r of read(path.join(root, 'keywords.csv'))) {
    const p = before.get(keyOf(r));
    if (!p) { lines.push(`- new term ${r.country.toUpperCase()} "${r.term}": ${r.observed_competition}, app rank ${r.app_rank}`); continue; }
    if (p.app_rank !== r.app_rank) lines.push(`- ${r.country.toUpperCase()} "${r.term}": app rank ${p.app_rank} → ${r.app_rank} (${p.retrieved_at.slice(0, 10)} → ${r.retrieved_at.slice(0, 10)})`);
    if (p.observed_competition !== r.observed_competition) lines.push(`- ${r.country.toUpperCase()} "${r.term}": observed competition ${p.observed_competition} → ${r.observed_competition}`);
  }
  return lines;
}

export function diff(root) {
  const state = load(root);
  const prev = [...state.snapshots].reverse().find((s) => s.runId !== state.runId);
  if (!prev) return 'No previous run snapshot; this is the first recorded run.\n';
  const lines = diffSnapshots(path.join(root, prev.dir), root);
  return [`Changes since the run of ${prev.at} (snapshot ${prev.dir}):`, '', ...(lines.length ? lines : ['- No changes in proposed metadata, live values, ranks or observed competition.'])].join('\n') + '\n';
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root || 'aso');
  const [cmd, a, b] = args._;
  try {
    switch (cmd) {
      case 'init': init(root, { mode: args.mode, app: args.app, auto: args.auto }); process.stdout.write(show(load(root))); break;
      case 'step': step(root, a, b, { note: args.note || '', files: args.files ? String(args.files).split(',') : [] }); process.stdout.write(`${a}: ${b}\n`); break;
      case 'source': source(root, a, b, { note: args.note || '' }); process.stdout.write(`${a}: ${b}\n`); break;
      case 'assume': assume(root, a); process.stdout.write('recorded\n'); break;
      case 'show': process.stdout.write(show(load(root))); break;
      case 'snapshot': process.stdout.write(JSON.stringify(snapshot(root), null, 2) + '\n'); break;
      case 'diff': {
        const text = diff(root);
        if (args.out) writeText(args.out, text);
        process.stdout.write(text);
        break;
      }
      default: die('commands: init | step | source | assume | show | snapshot | diff', 2);
    }
  } catch (e) {
    die(`state: ${e.message}`);
  }
}

if (isMain(import.meta.url)) main();
