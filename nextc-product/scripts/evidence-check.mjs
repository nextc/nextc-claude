#!/usr/bin/env node
// Evidence records, run state and memo checks for /product-explore and /idea-explore.
// No dependencies: Node 18+ built-ins only. Run with no arguments for usage.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const KINDS = ['fact', 'observation', 'estimate', 'founder'];
export const CONFIDENCES = ['high', 'medium', 'low'];
export const VERDICTS = ['upheld', 'weakened', 'refuted', 'unverifiable'];
export const LABELS = ['BUILD', 'VALIDATE FIRST', 'PIVOT', 'DO NOT BUILD'];
const REQUIRED_FIELDS = ['claim', 'quote', 'url', 'retrieved_at', 'published', 'kind', 'confidence', 'bears_on', 'topic'];
const KNOWN_FIELDS = new Set([
  'id', ...REQUIRED_FIELDS, 'derived_from', 'source_title', 'note',
  'verified_source', 'fetch_note', 'checked_at', 'imported_from', 'original_topic',
]);
// MAGIC: a quote shorter than this rarely pins a claim to its page; longer than the max is
// usually a pasted paragraph that hides which sentence supports the claim.
export const QUOTE_MIN = 12;
export const QUOTE_MAX = 600;
export const CLAIM_MIN = 10;
export const CLAIM_MAX = 400;
const CLAIM_ID_RE = /\bc_[0-9a-f]{10}\b/g;
const INTAKE_ID_RE = /^[OAK]\d+$/;
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const FETCH_CONCURRENCY = 4;

// ─── small helpers ──────────────────────────────────────────────────

export function nowIso(now = new Date()) {
  return now.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw new Error(`${file}: ${err.message}`);
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

export function normalizeUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return '';
  try {
    const u = new URL(url.trim());
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (/^utm_/i.test(key)) u.searchParams.delete(key);
    }
    let out = u.toString();
    if (out.endsWith('/') && u.pathname !== '/') out = out.slice(0, -1);
    return out;
  } catch {
    return url.trim();
  }
}

function normalizeClaim(claim) {
  return String(claim || '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');
}

export function claimId(url, claim) {
  const hash = crypto.createHash('sha256').update(`${normalizeUrl(url)}\n${normalizeClaim(claim)}`).digest('hex');
  return `c_${hash.slice(0, 10)}`;
}

function isHttpUrl(url) {
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') && Boolean(u.hostname) && u.hostname.includes('.');
  } catch {
    return false;
  }
}

const DATE_RE = /^\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?)?)?$/;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', hellip: '...', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"' };

// Lowercase, straight quotes, plain dashes, single spaces: a quote copied from a rendered page
// must still match the raw HTML it came from.
export function normalizeText(text) {
  return String(text || '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : ' ';
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[  -​  　]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function htmlToText(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

// A quote may elide text with "..."; every fragment must then appear in the page, in order.
export function quoteAppears(quote, pageText) {
  const page = normalizeText(pageText);
  const fragments = normalizeText(quote)
    .replace(/^["'\s.]+|["'\s.]+$/g, '')
    .split(/\s*\.\.\.\s*|\s*\[\s*\.\.\.\s*\]\s*/)
    .map((f) => f.trim())
    .filter(Boolean);
  if (!fragments.length) return false;
  let from = 0;
  for (const fragment of fragments) {
    const at = page.indexOf(fragment, from);
    if (at === -1) return false;
    from = at + fragment.length;
  }
  return true;
}

// ─── intake ─────────────────────────────────────────────────────────

export function validateIntake(intake) {
  const errors = [];
  const ids = new Set();
  if (!intake || typeof intake !== 'object') return { errors: ['intake.json is not an object'], ids };
  if (!intake.decision || typeof intake.decision.question !== 'string' || !intake.decision.question.trim()) {
    errors.push('decision.question is required');
  }
  const lists = [
    ['decision.options', intake.decision?.options, 'O', 'label'],
    ['assumptions', intake.assumptions, 'A', 'statement'],
    ['kill_conditions', intake.kill_conditions, 'K', 'condition'],
  ];
  for (const [name, list, prefix, textField] of lists) {
    if (list === undefined) continue;
    if (!Array.isArray(list)) { errors.push(`${name} must be an array`); continue; }
    list.forEach((item, i) => {
      if (!item || typeof item.id !== 'string' || !new RegExp(`^${prefix}\\d+$`).test(item.id)) {
        errors.push(`${name}[${i}].id must look like ${prefix}1`);
        return;
      }
      if (ids.has(item.id)) errors.push(`${name}[${i}].id ${item.id} is duplicated`);
      ids.add(item.id);
      if (typeof item[textField] !== 'string' || !item[textField].trim()) errors.push(`${item.id}.${textField} is required`);
    });
  }
  if (intake.assets !== undefined && !Array.isArray(intake.assets)) errors.push('assets must be an array');
  return { errors, ids };
}

// ─── records ────────────────────────────────────────────────────────

export function validateRecord(rec, { topic, intakeIds } = {}) {
  const errors = [];
  const warnings = [];
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return { errors: ['record is not a JSON object'], warnings };
  for (const field of REQUIRED_FIELDS) {
    if (!(field in rec)) errors.push(`missing field "${field}"`);
  }
  for (const key of Object.keys(rec)) {
    if (!KNOWN_FIELDS.has(key)) warnings.push(`unknown field "${key}"`);
  }
  if (!KINDS.includes(rec.kind)) errors.push(`kind must be one of ${KINDS.join('|')}`);
  if (!CONFIDENCES.includes(rec.confidence)) errors.push(`confidence must be one of ${CONFIDENCES.join('|')}`);
  if (typeof rec.claim !== 'string' || rec.claim.trim().length < CLAIM_MIN || rec.claim.length > CLAIM_MAX) {
    errors.push(`claim must be a string of ${CLAIM_MIN}-${CLAIM_MAX} characters`);
  }
  if (typeof rec.quote !== 'string' || rec.quote.trim().length < QUOTE_MIN || rec.quote.length > QUOTE_MAX) {
    errors.push(`quote must be verbatim text of ${QUOTE_MIN}-${QUOTE_MAX} characters`);
  }
  if (rec.kind === 'founder') {
    if (rec.url !== null && rec.url !== undefined && !isHttpUrl(rec.url)) errors.push('founder url must be null or an http(s) URL');
  } else if (!isHttpUrl(rec.url)) {
    errors.push('url must be a well-formed http(s) URL');
  }
  if (rec.kind !== 'founder' && (typeof rec.retrieved_at !== 'string' || !DATE_RE.test(rec.retrieved_at))) {
    errors.push('retrieved_at must be an ISO date or date-time');
  } else if (rec.retrieved_at != null && !DATE_RE.test(String(rec.retrieved_at))) {
    errors.push('retrieved_at must be an ISO date or date-time');
  }
  if (rec.published !== null && rec.published !== undefined && !DATE_RE.test(String(rec.published))) {
    errors.push('published must be null or an ISO date (YYYY, YYYY-MM or YYYY-MM-DD)');
  }
  if (!Array.isArray(rec.bears_on)) {
    errors.push('bears_on must be an array of intake ids');
  } else {
    for (const ref of rec.bears_on) {
      if (typeof ref !== 'string' || !INTAKE_ID_RE.test(ref)) errors.push(`bears_on entry "${ref}" is not an option (O1), assumption (A1) or kill-condition (K1) id`);
      else if (intakeIds && intakeIds.size && !intakeIds.has(ref)) errors.push(`bears_on entry "${ref}" is not defined in intake.json`);
    }
  }
  if (rec.kind === 'estimate') {
    const d = rec.derived_from;
    const ok = (typeof d === 'string' && d.trim()) || (Array.isArray(d) && d.length);
    if (!ok) errors.push('an estimate must say what it is derived_from (claim ids or a method)');
  }
  if (typeof rec.topic !== 'string' || !rec.topic.trim()) errors.push('topic is required');
  else if (topic && rec.topic !== topic) errors.push(`topic "${rec.topic}" does not match file topic "${topic}"`);
  return { errors, warnings };
}

function topicOf(file) {
  return path.basename(file).replace(/\.jsonl$/, '');
}

export function evidenceFiles(dir) {
  const evDir = path.join(dir, 'evidence');
  if (!fs.existsSync(evDir)) return [];
  return fs.readdirSync(evDir)
    .filter((f) => f.endsWith('.jsonl') && !f.startsWith('_'))
    .sort()
    .map((f) => path.join(evDir, f));
}

// Parses one JSONL file. Each entry keeps its raw line so invalid lines survive a rewrite.
export function parseFile(file, { intakeIds } = {}) {
  const topic = topicOf(file);
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const entries = [];
  lines.forEach((raw, i) => {
    if (!raw.trim()) return;
    const line = i + 1;
    let rec;
    try {
      rec = JSON.parse(raw);
    } catch (err) {
      entries.push({ file, line, raw, rec: null, errors: [`invalid JSON: ${err.message}`], warnings: [] });
      return;
    }
    const { errors, warnings } = validateRecord(rec, { topic, intakeIds });
    entries.push({ file, line, raw, rec, errors, warnings });
  });
  return { topic, entries };
}

export function lintFile(file, { intakeIds } = {}) {
  const { topic, entries } = parseFile(file, { intakeIds });
  const failures = [];
  const seen = new Map();
  let valid = 0;
  for (const e of entries) {
    if (e.errors.length) { failures.push({ line: e.line, errors: e.errors }); continue; }
    const id = claimId(e.rec.url, e.rec.claim);
    if (seen.has(id)) failures.push({ line: e.line, errors: [`duplicate of line ${seen.get(id)} (${id})`] });
    else seen.set(id, e.line);
    valid += 1;
  }
  return { file, topic, records: entries.length, valid, failures };
}

// ─── fetching ───────────────────────────────────────────────────────

export async function defaultFetcher(url, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; evidence-check/1.0)', accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.5' },
    });
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok) return { ok: false, status: res.status, contentType, text: '' };
    if (!/text|json|xml|javascript/i.test(contentType) && contentType) {
      return { ok: true, status: res.status, contentType, text: '', nonText: true };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { ok: true, status: res.status, contentType, text: buf.subarray(0, MAX_BODY_BYTES).toString('utf8') };
  } finally {
    clearTimeout(timer);
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

async function verifySources(records, { fetcher, timeoutMs, refetch }) {
  const byUrl = new Map();
  for (const rec of records) {
    if (rec.kind === 'founder' || !rec.url) continue;
    if (!refetch && rec.verified_source === true) continue;
    if (!byUrl.has(rec.url)) byUrl.set(rec.url, []);
    byUrl.get(rec.url).push(rec);
  }
  const urls = [...byUrl.keys()];
  await mapLimit(urls, FETCH_CONCURRENCY, async (url) => {
    let page;
    try {
      page = await fetcher(url, { timeoutMs });
    } catch (err) {
      page = { ok: false, error: err?.name === 'AbortError' ? `timed out after ${timeoutMs}ms` : String(err?.message || err) };
    }
    for (const rec of byUrl.get(url)) {
      if (!page || !page.ok) {
        rec.verified_source = 'unreachable';
        rec.fetch_note = page?.error || `HTTP ${page?.status ?? 'error'}`;
      } else if (page.nonText) {
        rec.verified_source = 'unreachable';
        rec.fetch_note = `non-text content (${page.contentType}); check the quote by hand`;
      } else if (quoteAppears(rec.quote, htmlToText(page.text))) {
        rec.verified_source = true;
        delete rec.fetch_note;
      } else {
        rec.verified_source = false;
        rec.fetch_note = 'quote not found in the fetched page (it may be rendered by script or paraphrased)';
      }
    }
  });
}

// ─── verification ───────────────────────────────────────────────────

export function readVerification(dir, validIds) {
  const file = path.join(dir, 'verification.jsonl');
  const result = { present: false, total: 0, upheld: 0, weakened: 0, refuted: 0, unverifiable: 0, failures: [], verdicts: {} };
  if (!fs.existsSync(file)) return result;
  result.present = true;
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim()) return;
    const line = i + 1;
    let v;
    try { v = JSON.parse(raw); } catch (err) { result.failures.push({ line, errors: [`invalid JSON: ${err.message}`] }); return; }
    const errors = [];
    if (typeof v.claim_id !== 'string' || !/^c_[0-9a-f]{10}$/.test(v.claim_id)) errors.push('claim_id must look like c_0123456789');
    else if (validIds && !validIds.has(v.claim_id)) errors.push(`claim_id ${v.claim_id} is not a valid evidence record`);
    if (!VERDICTS.includes(v.verdict)) errors.push(`verdict must be one of ${VERDICTS.join('|')}`);
    if (v.counter_url !== null && v.counter_url !== undefined && !isHttpUrl(v.counter_url)) errors.push('counter_url must be null or an http(s) URL');
    if ((v.verdict === 'refuted' || v.verdict === 'weakened') && !isHttpUrl(v.counter_url)) errors.push(`a ${v.verdict} verdict needs a counter_url`);
    if (typeof v.note !== 'string' || !v.note.trim()) errors.push('note is required');
    if (errors.length) { result.failures.push({ line, errors }); return; }
    result.verdicts[v.claim_id] = v;
  });
  for (const v of Object.values(result.verdicts)) {
    result.total += 1;
    result[v.verdict] += 1;
  }
  return result;
}

// ─── check ──────────────────────────────────────────────────────────

function emptyCounts() {
  return { total: 0, fact: 0, observation: 0, estimate: 0, founder: 0, high: 0, medium: 0, low: 0 };
}

export function loadIntake(dir) {
  const file = path.join(dir, 'intake.json');
  if (!fs.existsSync(file)) return { present: false, ids: new Set(), errors: [] };
  let intake;
  try { intake = readJson(file); } catch (err) { return { present: true, ids: new Set(), errors: [err.message] }; }
  const { errors, ids } = validateIntake(intake);
  return { present: true, ids, errors, intake };
}

export async function runCheck({ dir, require = ['prior-art'], fetch: doFetch = false, refetch = false, fetcher = defaultFetcher, now = () => new Date(), timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const intake = loadIntake(dir);
  const files = evidenceFiles(dir);
  const failures = [];
  const rekeyed = [];
  const duplicates = [];
  const seen = new Map();
  const valid = [];
  const perFile = [];

  for (const file of files) {
    const { topic, entries } = parseFile(file, { intakeIds: intake.ids });
    const kept = [];
    for (const e of entries) {
      if (e.errors.length) {
        failures.push({ file: path.relative(dir, file), line: e.line, id: e.rec?.id ?? null, errors: e.errors });
        kept.push({ raw: e.raw });
        continue;
      }
      const id = claimId(e.rec.url, e.rec.claim);
      if (e.rec.id && e.rec.id !== id) rekeyed.push({ file: path.relative(dir, file), line: e.line, old: e.rec.id, new: id });
      const rec = { id, ...e.rec, id };
      if (seen.has(id)) {
        duplicates.push({ id, file: path.relative(dir, file), line: e.line, first_seen: seen.get(id) });
        continue;
      }
      seen.set(id, `${path.relative(dir, file)}:${e.line}`);
      kept.push({ rec });
      valid.push({ rec, topic });
    }
    perFile.push({ file, topic, kept });
  }

  if (doFetch) await verifySources(valid.map((v) => v.rec), { fetcher, timeoutMs, refetch });

  const stamp = nowIso(now());
  for (const v of valid) v.rec.checked_at = stamp;

  for (const { file, kept } of perFile) {
    const body = kept.map((k) => (k.rec ? JSON.stringify(k.rec) : k.raw)).join('\n');
    fs.writeFileSync(file, body ? body + '\n' : '');
  }

  const counts = { total: valid.length, invalid: failures.length, duplicates: duplicates.length, by_topic: {}, by_kind: {}, by_confidence: {}, verified_source: { true: 0, false: 0, unreachable: 0, unchecked: 0 } };
  for (const { topic } of perFile) counts.by_topic[topic] = emptyCounts();
  for (const { rec, topic } of valid) {
    const t = counts.by_topic[topic];
    t.total += 1; t[rec.kind] += 1; t[rec.confidence] += 1;
    counts.by_kind[rec.kind] = (counts.by_kind[rec.kind] || 0) + 1;
    counts.by_confidence[rec.confidence] = (counts.by_confidence[rec.confidence] || 0) + 1;
    if (rec.kind === 'founder') continue;
    const vs = rec.verified_source;
    if (vs === true) counts.verified_source.true += 1;
    else if (vs === false) counts.verified_source.false += 1;
    else if (vs === 'unreachable') counts.verified_source.unreachable += 1;
    else counts.verified_source.unchecked += 1;
  }

  const emptyRequired = require.filter((t) => !counts.by_topic[t] || counts.by_topic[t].total === 0);
  const verification = readVerification(dir, new Set(valid.map((v) => v.rec.id)));
  const meta = {};
  for (const { topic } of perFile) {
    const m = readJson(path.join(dir, 'evidence', `${topic}.meta.json`), null);
    if (m) meta[topic] = { searched: m.searched ?? [], gaps: m.gaps ?? [], open_questions: m.open_questions ?? [] };
  }

  const index = {
    generated_at: stamp,
    dir,
    files: perFile.map((p) => path.relative(dir, p.file)),
    counts,
    required_topics: require,
    empty_required: emptyRequired,
    failures,
    rekeyed,
    duplicates,
    verification: {
      present: verification.present,
      total: verification.total,
      upheld: verification.upheld,
      weakened: verification.weakened,
      refuted: verification.refuted,
      unverifiable: verification.unverifiable,
      failures: verification.failures,
      refuted_ids: Object.values(verification.verdicts).filter((v) => v.verdict === 'refuted').map((v) => v.claim_id),
      weakened_ids: Object.values(verification.verdicts).filter((v) => v.verdict === 'weakened').map((v) => v.claim_id),
      unverifiable_ids: Object.values(verification.verdicts).filter((v) => v.verdict === 'unverifiable').map((v) => v.claim_id),
    },
    intake: { present: intake.present, ids: [...intake.ids], errors: intake.errors },
    meta,
  };
  writeJson(path.join(dir, 'evidence', '_index.json'), index);
  const ok = !failures.length && !emptyRequired.length && !verification.failures.length && !intake.errors.length;
  return { ok, index };
}

// Loads valid records (as last written by `check`) keyed by id.
export function loadRecords(dir) {
  const intake = loadIntake(dir);
  const records = new Map();
  for (const file of evidenceFiles(dir)) {
    for (const e of parseFile(file, { intakeIds: intake.ids }).entries) {
      if (e.errors.length) continue;
      const id = claimId(e.rec.url, e.rec.claim);
      if (!records.has(id)) records.set(id, { ...e.rec, id });
    }
  }
  return records;
}

// ─── select claims for refuters ─────────────────────────────────────

export function selectClaims(dir, { max = 25, per = 5 } = {}) {
  const records = loadRecords(dir);
  const verification = readVerification(dir, new Set(records.keys()));
  const confScore = { high: 2, medium: 1, low: 0 };
  const candidates = [...records.values()]
    .filter((r) => r.kind !== 'founder' && Array.isArray(r.bears_on) && r.bears_on.length && !verification.verdicts[r.id])
    .map((r) => ({ r, score: r.bears_on.length * 2 + confScore[r.confidence] + (r.kind === 'estimate' ? 1 : 0) }))
    .sort((a, b) => b.score - a.score || a.r.id.localeCompare(b.r.id));
  const picked = candidates.slice(0, max).map(({ r }) => ({
    id: r.id, claim: r.claim, quote: r.quote, url: r.url, kind: r.kind, confidence: r.confidence, bears_on: r.bears_on, topic: r.topic,
  }));
  const batches = [];
  for (let i = 0; i < picked.length; i += per) batches.push(picked.slice(i, i + per));
  return { batches, selected: picked.length, not_selected: Math.max(0, candidates.length - picked.length) };
}

// ─── appendix ───────────────────────────────────────────────────────

function sourceCheckLabel(rec) {
  if (rec.kind === 'founder') return 'founder statement';
  if (rec.verified_source === true) return 'quote found on page';
  if (rec.verified_source === false) return 'quote NOT found on page';
  if (rec.verified_source === 'unreachable') return 'page unreachable';
  return 'not checked';
}

function oneLine(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function recordLine(rec, verdict, cited) {
  const host = rec.url ? (() => { try { return new URL(rec.url).hostname; } catch { return rec.url; } })() : 'intake';
  const src = rec.url ? `[${host}](${rec.url})` : 'founder (intake)';
  const parts = [
    `- **${rec.id}**${cited ? ' (cited)' : ''} — ${oneLine(rec.claim)} _(${rec.kind}, ${rec.confidence})_`,
    `  > "${oneLine(rec.quote)}"`,
    `  ${src} · published ${rec.published ?? 'unknown'} · retrieved ${rec.retrieved_at ?? 'n/a'} · source check: ${sourceCheckLabel(rec)}${verdict ? ` · refuter: ${verdict.verdict}` : ''}`,
  ];
  if (rec.kind === 'estimate') parts.push(`  derived from: ${Array.isArray(rec.derived_from) ? rec.derived_from.join(', ') : oneLine(rec.derived_from)}`);
  if (verdict && verdict.verdict !== 'upheld') parts.push(`  refuter note: ${oneLine(verdict.note)}${verdict.counter_url ? ` ([counter-source](${verdict.counter_url}))` : ''}`);
  return parts.join('\n');
}

export function buildAppendix(dir, { memo = null, now = () => new Date() } = {}) {
  const records = loadRecords(dir);
  const verification = readVerification(dir, new Set(records.keys()));
  const cited = new Set(memo && fs.existsSync(memo) ? fs.readFileSync(memo, 'utf8').match(CLAIM_ID_RE) ?? [] : []);
  const index = readJson(path.join(dir, 'evidence', '_index.json'), {});
  const all = [...records.values()];
  const v = (r) => verification.verdicts[r.id];
  const refuted = all.filter((r) => v(r)?.verdict === 'refuted');
  const weakened = all.filter((r) => v(r)?.verdict === 'weakened');
  const unverified = all.filter((r) => r.kind !== 'founder' && !['refuted', 'weakened'].includes(v(r)?.verdict)
    && (r.verified_source !== true || v(r)?.verdict === 'unverifiable'));
  const out = [
    '# Evidence appendix',
    '',
    `Generated ${nowIso(now())} by evidence-check from ${all.length} records. Do not edit by hand; re-run \`appendix\` instead.`,
    '',
    `Source check: ${all.filter((r) => r.verified_source === true).length} quotes found on their page, ${all.filter((r) => r.verified_source === false).length} not found, ${all.filter((r) => r.verified_source === 'unreachable').length} unreachable. Refuters: ${verification.upheld} upheld, ${verification.weakened} weakened, ${verification.refuted} refuted, ${verification.unverifiable} unverifiable.`,
    '',
  ];
  const section = (title, list, note) => {
    out.push(`## ${title}`, '');
    if (note) out.push(note, '');
    if (!list.length) out.push('None.', '');
    else out.push(list.map((r) => recordLine(r, v(r), cited.has(r.id))).join('\n'), '');
  };
  section('Refuted claims', refuted, 'A refuter found a source that contradicts these. Do not rely on them.');
  section('Weakened claims', weakened, 'A refuter found a source that narrows or qualifies these.');
  section('Unverified claims', unverified, 'The quote was not found on its page, the page could not be fetched, or a refuter could not confirm the claim. Unverified is not the same as false.');
  const topics = [...new Set(all.map((r) => r.topic))].sort();
  out.push('## All claims by topic', '');
  for (const topic of topics) {
    out.push(`### ${topic}`, '', all.filter((r) => r.topic === topic).map((r) => recordLine(r, v(r), cited.has(r.id))).join('\n'), '');
  }
  const meta = index.meta || {};
  const gapLines = [];
  const questionLines = [];
  for (const [topic, m] of Object.entries(meta)) {
    for (const g of m.gaps || []) gapLines.push(`- ${topic}: ${oneLine(typeof g === 'string' ? g : JSON.stringify(g))}`);
    for (const q of m.open_questions || []) questionLines.push(`- ${topic}: ${oneLine(typeof q === 'string' ? q : JSON.stringify(q))}`);
  }
  out.push('## Searched and not found', '', gapLines.length ? gapLines.join('\n') : 'None recorded.', '');
  out.push('## Open questions for the founder', '', questionLines.length ? questionLines.join('\n') : 'None recorded.', '');
  return out.join('\n');
}

// ─── memo checks ────────────────────────────────────────────────────

function stripForProse(text) {
  return text.replace(/<!--[\s\S]*?-->/g, ' ').replace(/```[\s\S]*?```/g, ' ');
}

export function countWords(text) {
  return stripForProse(text).split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

// Units are table rows, and sentences of prose lines. Headings are skipped.
export function memoUnits(text) {
  const units = [];
  const lines = stripForProse(text).split(/\r?\n/);
  let para = [];
  const flush = () => {
    if (!para.length) return;
    const joined = para.join(' ');
    para = [];
    for (const s of joined.split(/(?<=[.!?])\s+(?=[A-Z0-9[("*_])/)) if (s.trim()) units.push(s.trim());
  };
  for (const line of lines) {
    if (!line.trim()) { flush(); continue; }
    if (/^\s*#/.test(line)) { flush(); continue; }
    if (/^\s*\|/.test(line)) {
      flush();
      if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue;
      units.push(line.trim());
      continue;
    }
    if (/^\s*([-*+]|\d+\.)\s/.test(line)) flush();
    para.push(line.trim());
  }
  flush();
  return units;
}

const MARKER_RE = /\[(?:c_[0-9a-f]{10}|A\d+|assumption|index)\]/i;

export function unmarkedNumbers(unit) {
  if (MARKER_RE.test(unit)) return null;
  const scrubbed = unit
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\b\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?\b/g, ' ')
    .replace(/\b(?:[OAKEFJH]\d+|v\d+(?:\.\d+)*|c_[0-9a-f]{10})\b/g, ' ')
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/, ' ')
    .replace(/^\s*\|\s*\d+\s*\|/, '|');
  const hits = scrubbed.match(/\d[\d,.]*%?/g);
  return hits && hits.length ? hits : null;
}

export function memoCheck({ dir, memo, words = 1500, labels = LABELS, previous = null, sampleOut = null, numbers = true }) {
  const errors = [];
  const warnings = [];
  if (!fs.existsSync(memo)) return { ok: false, errors: [`memo not found: ${memo}`], warnings, words: 0 };
  const text = fs.readFileSync(memo, 'utf8');
  const records = loadRecords(dir);
  const verification = readVerification(dir, new Set(records.keys()));
  const intake = loadIntake(dir);
  const assumptionIds = new Set((intake.intake?.assumptions ?? []).map((a) => a.id));

  const wordCount = countWords(text);
  if (words > 0 && wordCount > words) errors.push(`memo has ${wordCount} words; the budget is ${words}`);

  if (labels && labels.length) {
    const h2 = [...text.matchAll(/^##\s/gm)].map((m) => m.index);
    const head = h2.length > 1 ? text.slice(0, h2[1]) : text;
    const found = labels.filter((l) => new RegExp(`\\b${l.replace(/ /g, '\\s+')}\\b`).test(head));
    if (!found.length) errors.push(`no recommendation label (${labels.join(' / ')}) before the second section`);
  }

  const units = memoUnits(text);
  for (const unit of numbers ? units : []) {
    const nums = unmarkedNumbers(unit);
    if (nums) errors.push(`number(s) ${nums.join(', ')} without a claim id or [assumption]/[A#] marker: "${oneLine(unit).slice(0, 140)}"`);
  }

  const citedIds = [...new Set(text.match(CLAIM_ID_RE) ?? [])];
  for (const id of citedIds) {
    if (!records.has(id)) { errors.push(`cites ${id}, which is not a valid evidence record`); continue; }
    const verdict = verification.verdicts[id]?.verdict;
    if (verdict === 'refuted') errors.push(`cites ${id}, which a refuter refuted`);
    else if (verdict === 'weakened') warnings.push(`cites ${id}, which a refuter weakened; say so in the sentence`);
    else if (verdict === 'unverifiable') warnings.push(`cites ${id}, which a refuter could not verify`);
  }
  for (const m of text.matchAll(/\[(A\d+)\]/g)) {
    if (intake.present && !assumptionIds.has(m[1])) errors.push(`marks [${m[1]}], which is not an assumption in intake.json`);
  }

  for (const m of text.matchAll(/\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
    const target = m[1];
    if (/^(https?:|mailto:|#)/i.test(target)) continue;
    const file = decodeURIComponent(target.split('#')[0]);
    if (!file) continue;
    if (!fs.existsSync(path.resolve(path.dirname(memo), file))) errors.push(`links to ${target}, which does not exist`);
  }

  if (previous && !/^#{2,3}\s+What changed/im.test(text)) errors.push('a previous memo exists but there is no "What changed" section');

  let sample = null;
  if (sampleOut) {
    sample = writeCitationSample({ units, records, verification, out: sampleOut, memo });
  }
  return { ok: !errors.length, errors, warnings, words: wordCount, cited: citedIds.length, sample };
}

// A short, deterministic spot-check file: cited sentences next to the records they cite.
function writeCitationSample({ units, records, verification, out, memo, size = 8 }) {
  const cited = units.filter((u) => (u.match(CLAIM_ID_RE) ?? []).some((id) => records.has(id)));
  const picks = [];
  if (cited.length <= size) picks.push(...cited);
  else for (let i = 0; i < size; i++) picks.push(cited[Math.floor((i * cited.length) / size)]);
  const lines = [
    '# Citation spot-check',
    '',
    `Sentences sampled from ${path.basename(memo)} (${picks.length} of ${cited.length} cited sentences), each followed by the records it cites. Generated by evidence-check memo-check.`,
    '',
  ];
  if (!picks.length) lines.push('The memo cites no evidence records.');
  picks.forEach((u, i) => {
    lines.push(`## ${i + 1}. ${oneLine(u)}`, '');
    for (const id of [...new Set(u.match(CLAIM_ID_RE))]) {
      const r = records.get(id);
      if (!r) { lines.push(`- ${id}: no such record`); continue; }
      const v = verification.verdicts[id];
      lines.push(`- **${id}** claim: ${oneLine(r.claim)}`, `  quote: "${oneLine(r.quote)}"`, `  source: ${r.url ?? 'founder (intake)'} · source check: ${sourceCheckLabel(r)}${v ? ` · refuter: ${v.verdict}` : ''}`);
    }
    lines.push('');
  });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, lines.join('\n'));
  return { file: out, sampled: picks.length, cited_sentences: cited.length };
}

export function memoDiff(oldText, newText) {
  const label = (t) => {
    const h2 = [...t.matchAll(/^##\s/gm)].map((m) => m.index);
    const head = h2.length > 1 ? t.slice(0, h2[1]) : t.slice(0, 2000);
    return LABELS.slice().sort((a, b) => b.length - a.length).find((l) => new RegExp(`\\b${l.replace(/ /g, '\\s+')}\\b`).test(head)) ?? null;
  };
  const headings = (t) => new Set([...t.matchAll(/^#{2,3}\s+(.+)$/gm)].map((m) => m[1].trim()));
  const ids = (t) => new Set(t.match(CLAIM_ID_RE) ?? []);
  const diff = (a, b) => [...a].filter((x) => !b.has(x));
  const [ho, hn, io, inew] = [headings(oldText), headings(newText), ids(oldText), ids(newText)];
  return {
    label: { old: label(oldText), new: label(newText) },
    headings_added: diff(hn, ho),
    headings_removed: diff(ho, hn),
    ids_added: diff(inew, io),
    ids_removed: diff(io, inew),
    words: { old: countWords(oldText), new: countWords(newText) },
  };
}

// ─── state ──────────────────────────────────────────────────────────

const STATE_EVENTS = { start: 'running', done: 'done', skip: 'skipped', fail: 'failed' };

export function initRun(dir, { mode = 'default', fresh = false, now = () => new Date() } = {}) {
  fs.mkdirSync(path.join(dir, 'evidence'), { recursive: true });
  const file = path.join(dir, 'state.json');
  let state = readJson(file, null);
  const stamp = nowIso(now());
  if (!state || fresh) {
    state = { version: 1, mode, created_at: stamp, updated_at: stamp, stages: {}, log: [{ at: stamp, event: 'init', mode }] };
  } else {
    state.log.push({ at: stamp, event: 'reopen', mode });
    state.mode = mode;
    state.updated_at = stamp;
  }
  writeJson(file, state);
  return { state, incomplete: incompleteStages(state) };
}

function incompleteStages(state) {
  return Object.entries(state.stages).filter(([, s]) => s.status === 'running' || s.status === 'failed').map(([name]) => name);
}

export function updateState(dir, event, stage, { note = null, now = () => new Date() } = {}) {
  if (!STATE_EVENTS[event]) throw new Error(`unknown state event "${event}" (start|done|skip|fail)`);
  if (!stage || !/^[a-z0-9][a-z0-9-]*$/.test(stage)) throw new Error('stage must be a kebab-case name such as prior-art');
  const file = path.join(dir, 'state.json');
  const state = readJson(file, null);
  if (!state) throw new Error(`${file} does not exist; run init first`);
  const stamp = nowIso(now());
  const prev = state.stages[stage] || {};
  const next = { ...prev, status: STATE_EVENTS[event] };
  if (event === 'start') { next.started_at = stamp; delete next.finished_at; }
  else next.finished_at = stamp;
  if (note) next.note = note;
  state.stages = { ...state.stages, [stage]: next };
  state.log.push({ at: stamp, stage, event, ...(note ? { note } : {}) });
  state.updated_at = stamp;
  writeJson(file, state);
  return state;
}

// ─── import / snapshot ──────────────────────────────────────────────

export function importEvidence(fromDir, toDir) {
  const records = loadRecords(fromDir);
  const name = `imported-${path.basename(path.resolve(fromDir))}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  const out = [...records.values()].map((r) => ({ ...r, bears_on: [], topic: name, original_topic: r.original_topic ?? r.topic, imported_from: fromDir }));
  fs.mkdirSync(path.join(toDir, 'evidence'), { recursive: true });
  const file = path.join(toDir, 'evidence', `${name}.jsonl`);
  fs.writeFileSync(file, out.map((r) => JSON.stringify(r)).join('\n') + (out.length ? '\n' : ''));
  return { file, records: out.length };
}

export function snapshotMemo(dir, memo, { now = () => new Date() } = {}) {
  if (!fs.existsSync(memo)) return { snapshot: null };
  const stamp = nowIso(now()).replace(/[-:]/g, '');
  const out = path.join(dir, 'history', `${stamp}-${path.basename(memo)}`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.copyFileSync(memo, out);
  return { snapshot: out };
}

// ─── CLI ────────────────────────────────────────────────────────────

const USAGE = `Usage: node evidence-check.mjs <command> [options]

  init       --dir D [--mode M] [--fresh]          create D/evidence and D/state.json
  state      start|done|skip|fail <stage> --dir D [--note TEXT]
  state      show --dir D
  now                                               print the current UTC time
  id         --url U --claim C                      print the claim id for a record
  lint       --file F [--dir D]                     validate one JSONL file, write nothing
  check      --dir D [--require t1,t2] [--fetch] [--refetch] [--timeout MS]
  select     --dir D [--max 25] [--per 5]           batches of decision-bearing claims for refuters
  appendix   --dir D [--memo M] [--out F]           write D/appendix.md from the records
  memo-check --dir D --memo M [--words 1500] [--labels none] [--numbers off]
             [--previous P] [--sample F]                  --words 0 turns the budget off
  snapshot   --dir D --memo M                       copy the memo to D/history/ before rewriting it
  memo-diff  OLD NEW                                compare two memos (label, sections, claim ids)
  import     --from D1 --to D2                      copy records from another run, clearing bears_on

Exit codes: 0 ok, 1 check failed, 2 usage error.`;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) args[key] = true;
      else { args[key] = next; i++; }
    } else args._.push(a);
  }
  return args;
}

function print(value) {
  process.stdout.write((typeof value === 'string' ? value : JSON.stringify(value, null, 2)) + '\n');
}

export async function main(argv) {
  const args = parseArgs(argv);
  const [cmd, ...rest] = args._;
  const need = (key) => {
    if (typeof args[key] !== 'string') throw Object.assign(new Error(`--${key} is required`), { usage: true });
    return args[key];
  };
  switch (cmd) {
    case 'init': {
      const r = initRun(need('dir'), { mode: typeof args.mode === 'string' ? args.mode : 'default', fresh: Boolean(args.fresh) });
      print({ dir: args.dir, mode: r.state.mode, stages: r.state.stages, incomplete: r.incomplete });
      return 0;
    }
    case 'state': {
      const [event, stage] = rest;
      const dir = need('dir');
      if (event === 'show') {
        const state = readJson(path.join(dir, 'state.json'), null);
        if (!state) { print({ state: null }); return 1; }
        print({ ...state, incomplete: incompleteStages(state) });
        return 0;
      }
      const state = updateState(dir, event, stage, { note: typeof args.note === 'string' ? args.note : null });
      print({ stage, ...state.stages[stage] });
      return 0;
    }
    case 'now':
      print(nowIso());
      return 0;
    case 'id':
      print(claimId(need('url'), need('claim')));
      return 0;
    case 'lint': {
      const file = need('file');
      const dir = typeof args.dir === 'string' ? args.dir : path.dirname(path.dirname(file));
      const r = lintFile(file, { intakeIds: loadIntake(dir).ids });
      print(r);
      return r.failures.length ? 1 : 0;
    }
    case 'check': {
      const require = typeof args.require === 'string' ? args.require.split(',').map((s) => s.trim()).filter(Boolean) : ['prior-art'];
      const { ok, index } = await runCheck({
        dir: need('dir'), require, fetch: Boolean(args.fetch), refetch: Boolean(args.refetch),
        timeoutMs: typeof args.timeout === 'string' ? Number(args.timeout) : DEFAULT_TIMEOUT_MS,
      });
      print({ ok, counts: index.counts, empty_required: index.empty_required, failures: index.failures, duplicates: index.duplicates.length, rekeyed: index.rekeyed.length, verification: { ...index.verification, refuted_ids: undefined, weakened_ids: undefined, unverifiable_ids: undefined }, intake_errors: index.intake.errors, index: path.join(index.dir, 'evidence', '_index.json') });
      return ok ? 0 : 1;
    }
    case 'select':
      print(selectClaims(need('dir'), { max: Number(args.max ?? 25), per: Number(args.per ?? 5) }));
      return 0;
    case 'appendix': {
      const dir = need('dir');
      const out = typeof args.out === 'string' ? args.out : path.join(dir, 'appendix.md');
      fs.writeFileSync(out, buildAppendix(dir, { memo: typeof args.memo === 'string' ? args.memo : null }));
      print({ appendix: out });
      return 0;
    }
    case 'memo-check': {
      const dir = need('dir');
      const r = memoCheck({
        dir,
        memo: need('memo'),
        words: Number(args.words ?? 1500),
        labels: args.labels === 'none' ? [] : LABELS,
        previous: typeof args.previous === 'string' ? args.previous : null,
        numbers: args.numbers !== 'off',
        sampleOut: typeof args.sample === 'string' ? args.sample : path.join(dir, 'citation-check.md'),
      });
      print(r);
      return r.ok ? 0 : 1;
    }
    case 'snapshot':
      print(snapshotMemo(need('dir'), need('memo')));
      return 0;
    case 'memo-diff': {
      const [oldPath, newPath] = rest;
      if (!oldPath || !newPath) throw Object.assign(new Error('memo-diff needs OLD and NEW paths'), { usage: true });
      print(memoDiff(fs.readFileSync(oldPath, 'utf8'), fs.readFileSync(newPath, 'utf8')));
      return 0;
    }
    case 'import':
      print(importEvidence(need('from'), need('to')));
      return 0;
    default:
      print(USAGE);
      return cmd ? 2 : 0;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (err) => {
      process.stderr.write(`evidence-check: ${err.message}\n`);
      if (err.usage) process.stderr.write(`\n${USAGE}\n`);
      process.exitCode = err.usage ? 2 : 1;
    },
  );
}
