#!/usr/bin/env node
// Checkpointed state for /flutter-kickoff and /unity-kickoff, stored at <project>/.kickoff/state.json.
// Schema: references/state-schema.md. All timestamps are written here, never typed by the model.
// Usage: node kickoff-state.mjs <init|show|decide|assume|set|step|next|validate|migrate> --dir <project> [...]
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { writeJsonAtomic, parseArgs, isMain } from './lib/util.mjs';

export const SCHEMA_VERSION = 1;
export const STEPS = {
  flutter: ['preflight', 'extract', 'intake', 'create', 'identity', 'deps', 'verify-static', 'docs-architecture', 'docs-tasks', 'docs-support', 'agent-files', 'ios-signing', 'coverage', 'commit', 'report'],
  unity: ['preflight', 'extract', 'intake', 'scaffold-files', 'editor-run', 'docs-architecture', 'docs-tasks', 'docs-support', 'agent-files', 'coverage', 'commit', 'report'],
};
export const STEP_STATUS = ['pending', 'running', 'done', 'failed', 'skipped'];
export const SOURCES = ['user', 'proposal', 'default', 'auto'];

export const statePath = (dir) => join(dir, '.kickoff', 'state.json');
const now = () => new Date().toISOString();

export function newState(kind, { auto = false, docsOnly = false } = {}) {
  if (!STEPS[kind]) throw new Error(`kind must be one of ${Object.keys(STEPS).join(', ')}`);
  const t = now();
  return {
    schema_version: SCHEMA_VERSION,
    kind,
    created_at: t,
    updated_at: t,
    mode: { auto, docs_only: docsOnly },
    proposal: { path: null, format: 'none' },
    identity: { product_name: null, slug: null, org: null, app_id: null, platforms: [] },
    decisions: {},
    assumptions: [],
    options: {},
    dependencies: [],
    steps: Object.fromEntries(STEPS[kind].map((s) => [s, { status: 'pending' }])),
  };
}

export function validateState(s) {
  const errs = [];
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  if (!isObj(s)) return ['state is not an object'];
  if (s.schema_version !== SCHEMA_VERSION) errs.push(`schema_version must be ${SCHEMA_VERSION}`);
  if (!STEPS[s.kind]) errs.push('kind must be flutter or unity');
  for (const k of ['created_at', 'updated_at']) if (Number.isNaN(Date.parse(s[k]))) errs.push(`${k} must be an ISO timestamp`);
  if (!isObj(s.mode) || typeof s.mode.auto !== 'boolean' || typeof s.mode.docs_only !== 'boolean') errs.push('mode.auto and mode.docs_only must be booleans');
  if (!isObj(s.identity)) errs.push('identity must be an object');
  if (!isObj(s.decisions)) errs.push('decisions must be an object');
  else {
    for (const [k, d] of Object.entries(s.decisions)) {
      if (!isObj(d) || !('value' in d)) errs.push(`decisions.${k} needs a value`);
      else if (!SOURCES.includes(d.source)) errs.push(`decisions.${k}.source must be one of ${SOURCES.join('|')}`);
    }
  }
  if (!Array.isArray(s.assumptions)) errs.push('assumptions must be an array');
  else s.assumptions.forEach((a, i) => { if (!a.key || !a.reason || !a.at) errs.push(`assumptions[${i}] needs key, reason, at`); });
  if (!Array.isArray(s.dependencies)) errs.push('dependencies must be an array');
  else s.dependencies.forEach((d, i) => { if (!d.name || !d.reason || !Array.isArray(d.feature_ids)) errs.push(`dependencies[${i}] needs name, reason, feature_ids[]`); });
  if (!isObj(s.steps)) errs.push('steps must be an object');
  else if (STEPS[s.kind]) {
    for (const id of STEPS[s.kind]) {
      const st = s.steps[id];
      if (!st) errs.push(`steps.${id} missing`);
      else if (!STEP_STATUS.includes(st.status)) errs.push(`steps.${id}.status invalid`);
    }
  }
  return errs;
}

export function loadState(dir) {
  const f = statePath(dir);
  if (!existsSync(f)) return null;
  return JSON.parse(readFileSync(f, 'utf8'));
}

export function saveState(dir, s) {
  s.updated_at = now();
  const errs = validateState(s);
  if (errs.length) throw new Error(`refusing to write invalid state:\n- ${errs.join('\n- ')}`);
  writeJsonAtomic(statePath(dir), s);
  return s;
}

export function initState(dir, kind, opts = {}) {
  const existing = loadState(dir);
  if (existing && !opts.force) return { state: existing, created: false };
  mkdirSync(dir, { recursive: true });
  return { state: saveState(dir, newState(kind, opts)), created: true };
}

export function decide(dir, key, value, source, note) {
  if (!SOURCES.includes(source)) throw new Error(`source must be one of ${SOURCES.join('|')}`);
  const s = loadState(dir);
  s.decisions[key] = { value, source, ...(note ? { note } : {}), at: now() };
  if (source === 'auto' || source === 'default') {
    if (s.mode.auto) s.assumptions = [...s.assumptions.filter((a) => a.key !== key), { key, value, reason: note || `${source} value taken without asking`, at: now() }];
  }
  return saveState(dir, s);
}

export function assume(dir, key, value, reason) {
  const s = loadState(dir);
  s.assumptions = [...s.assumptions.filter((a) => a.key !== key), { key, value, reason, at: now() }];
  return saveState(dir, s);
}

const SETTABLE = new Set(['identity', 'options', 'proposal', 'dependencies']);

// Sets identity.*, options.*, proposal.* or replaces dependencies; nothing else is writable this way.
export function setPath(dir, path, value) {
  const [top, ...rest] = path.split('.');
  if (!SETTABLE.has(top)) throw new Error(`path must start with ${[...SETTABLE].join('|')}`);
  const s = loadState(dir);
  if (!rest.length) s[top] = value;
  else {
    const copy = { ...s[top] };
    let cur = copy;
    rest.slice(0, -1).forEach((k) => { cur[k] = { ...(cur[k] || {}) }; cur = cur[k]; });
    cur[rest[rest.length - 1]] = value;
    s[top] = copy;
  }
  return saveState(dir, s);
}

export function setStep(dir, id, status, extra = {}) {
  const s = loadState(dir);
  if (!(id in s.steps)) throw new Error(`unknown step "${id}" for kind ${s.kind}`);
  if (!STEP_STATUS.includes(status)) throw new Error(`status must be one of ${STEP_STATUS.join('|')}`);
  const prev = s.steps[id];
  const t = now();
  const next = { ...prev, status };
  if (status === 'running') { next.started_at = t; delete next.error; }
  if (['done', 'failed', 'skipped'].includes(status)) next.finished_at = t;
  for (const k of ['evidence', 'error', 'log']) if (extra[k]) next[k] = extra[k];
  s.steps = { ...s.steps, [id]: next };
  return saveState(dir, s);
}

// A step left "running" means the previous run stopped mid-step, so it is the one to redo.
export function nextStep(s) {
  for (const id of STEPS[s.kind]) {
    const st = s.steps[id].status;
    if (st === 'pending' || st === 'running' || st === 'failed') return id;
  }
  return null;
}

export function migrateLegacy(dir, kind) {
  const legacyDir = join(dir, kind === 'flutter' ? '.flutter-kickoff' : '.unity-kickoff');
  const f = join(legacyDir, 'decisions.json');
  if (!existsSync(f)) return null;
  const old = JSON.parse(readFileSync(f, 'utf8'));
  const { state } = initState(dir, kind, { auto: /auto/.test(old.mode || '') });
  state.identity = {
    ...state.identity,
    product_name: old.product_name ?? null,
    org: old.org ?? old.company_name ?? null,
    app_id: old.app_id ?? old.bundle_id ?? old.package_name ?? null,
    platforms: old.platforms ?? old.target_platforms ?? [],
  };
  const skip = new Set(['product_name', 'org', 'company_name', 'app_id', 'bundle_id', 'package_name', 'platforms', 'target_platforms', 'completed_phases', 'mode']);
  for (const [k, v] of Object.entries(old)) if (!skip.has(k)) state.decisions[k] = { value: v, source: 'default', note: 'migrated from legacy decisions.json', at: now() };
  const done = new Set((old.completed_phases || []).map(Number));
  state.legacy = { file: f, completed_phases: [...done] };
  if (kind === 'flutter') {
    if (done.has(2)) for (const id of ['preflight', 'extract', 'intake', 'create', 'identity']) state.steps[id] = { status: 'done', note: 'legacy phase 2 completed' };
    if (done.has(3)) for (const id of ['docs-architecture', 'docs-tasks', 'docs-support']) state.steps[id] = { status: 'done', note: 'legacy phase 3 completed' };
  } else {
    if (done.has(2)) for (const id of ['preflight', 'extract', 'intake', 'scaffold-files']) state.steps[id] = { status: 'done', note: 'legacy phase 2 completed' };
    if (done.has(3)) for (const id of ['docs-architecture', 'docs-tasks', 'docs-support']) state.steps[id] = { status: 'done', note: 'legacy phase 3 completed' };
  }
  return saveState(dir, state);
}

function parseValue(raw) {
  try { return JSON.parse(raw); } catch { return raw; }
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const a = parseArgs(rest, { flags: ['auto', 'docs-only', 'force'] });
  const dir = a.dir || '.';
  try {
    let out;
    switch (cmd) {
      case 'init': out = initState(dir, a.kind, { auto: !!a.auto, docsOnly: !!a['docs-only'], force: !!a.force }); break;
      case 'show': out = loadState(dir); if (!out) throw new Error(`no state at ${statePath(dir)}`); break;
      case 'decide': out = decide(dir, a.key, parseValue(a.value), a.source || 'user', a.note); break;
      case 'assume': out = assume(dir, a.key, parseValue(a.value), a.reason); break;
      case 'set': out = setPath(dir, a.path, parseValue(a.value)); break;
      case 'step': out = setStep(dir, a.id, a.status, { evidence: a.evidence, error: a.error, log: a.log }); break;
      case 'next': { const s = loadState(dir); if (!s) throw new Error('no state'); out = { next: nextStep(s) }; break; }
      case 'validate': { const s = loadState(dir); const errs = s ? validateState(s) : ['no state file']; out = { valid: errs.length === 0, errors: errs }; if (errs.length) { console.log(JSON.stringify(out, null, 2)); process.exit(1); } break; }
      case 'migrate': out = migrateLegacy(dir, a.kind); if (!out) throw new Error('no legacy decisions.json found'); break;
      default: throw new Error('commands: init show decide assume set step next validate migrate');
    }
    console.log(JSON.stringify(out, null, 2));
  } catch (e) {
    console.error(`kickoff-state: ${e.message}`);
    process.exit(2);
  }
}

if (isMain(import.meta.url)) main();
