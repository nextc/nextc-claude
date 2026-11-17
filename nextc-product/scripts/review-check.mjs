#!/usr/bin/env node
// Criteria, measurements, verdicts and conclusions for /product-review.
// No dependencies: Node 18+ built-ins only. Reuses nowIso and claimId from evidence-check.mjs.
// Run with no arguments for usage. Every number in a verdict comes from a recorded measurement,
// and the report's table and conclusion are printed here, never typed by the session.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { nowIso, claimId } from './evidence-check.mjs';

export const METRICS = ['retention', 'activation', 'funnel', 'conversion', 'revenue', 'rating', 'installs', 'crash_rate', 'signups', 'dau_wau', 'qualitative', 'count'];
export const SOURCES = ['bigquery', 'store_public', 'asc_reviews', 'play_reviews', 'manual', 'asc_sales', 'asc_analytics', 'play_export', 'play_vitals'];
export const COMPARISONS = ['>=', '>', '<=', '<'];
export const UNITS = ['ratio', 'count', 'usd', 'value'];
export const ACTIONS = ['build', 'continue', 'pivot', 'stop', 'revisit'];
// A kill criterion that fires cannot mean "carry on".
export const KILL_ACTIONS = ['pivot', 'stop', 'revisit'];
export const KINDS = ['experiment', 'kill'];
export const RETENTION_FORMS = ['exact_day', 'on_or_after', 'rolling'];
export const VERDICTS = ['met', 'missed', 'too early', 'unmeasured'];
export const UNMEASURED_REASONS = ['no_source', 'no_access', 'event_not_instrumented', 'window_not_closed', 'qualitative_needs_founder_input', 'not_parseable'];
const KNOWN_KEYS = new Set([
  'id', 'kind', 'ties_to', 'statement', 'metric', 'retention_form', 'population', 'numerator', 'denominator',
  'comparison', 'threshold', 'unit', 'window', 'planned_n', 'min_n', 'source', 'evaluate_after', 'if_missed', 'if_met',
  'derived_from', 'confirmed', 'incomplete', 'needs', 'draft_text',
]);
const DRAFT_KEYS = ['derived_from', 'confirmed', 'incomplete', 'needs', 'draft_text'];
// MAGIC: 95% two-sided normal quantile. The sample rule is fixed at 95% so a verdict never depends on a tuned level.
export const Z95 = 1.96;
const EVENT_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[EK]\d{1,3}$/;
// SECURITY: free text that travels from a result into the printed table is held to a narrow
// character set and length, so a query or store result cannot carry instructions into the report.
const PLAIN_TEXT_RE = /^[A-Za-z0-9 _,.:()\/-]{1,120}$/;
const MAX_STRING = 2000;

const isObj = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x);
const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const usageError = (message) => Object.assign(new Error(message), { usage: true });

// ─── statistics ─────────────────────────────────────────────────────

// Wilson score interval for a binomial proportion (Brown, Cai and DasGupta 2001,
// projecteuclid.org/euclid.ss/1009213286).
export function wilson(k, n, z = Z95) {
  if (!Number.isInteger(k) || !Number.isInteger(n) || n <= 0 || k < 0 || k > n) throw new Error(`wilson needs integers with 0 <= k <= n and n > 0 (got ${k}/${n})`);
  const p = k / n;
  const d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  // The bounds at k = 0 and k = n are exactly 0 and 1; computed, they carry floating-point
  // noise (0.9999999999999999) that would flip a verdict at a threshold of 0 or 1.
  return { p, lower: k === 0 ? 0 : Math.max(0, centre - half), upper: k === n ? 1 : Math.min(1, centre + half) };
}

const isUp = (cmp) => cmp === '>=' || cmp === '>';
const holds = (cmp, x, t) => (cmp === '>=' ? x >= t : cmp === '>' ? x > t : cmp === '<=' ? x <= t : x < t);

// Whether a whole interval is on the passing side, on the failing side, or neither.
function intervalSide(cmp, lower, upper, t) {
  const meets = cmp === '>=' ? lower >= t : cmp === '>' ? lower > t : cmp === '<=' ? upper <= t : upper < t;
  const fails = cmp === '>=' ? upper < t : cmp === '>' ? upper <= t : cmp === '<=' ? lower > t : lower >= t;
  return meets ? 'met' : fails ? 'missed' : null;
}

// Smallest total sample (at the observed rate) whose interval no longer straddles the threshold; null when none is found.
export function usersNeeded(p, threshold, cmp, from = 1) {
  if (p === threshold) return null;
  const limit = Math.max(from, 1) * 400;
  for (let n = Math.max(from, 1); n <= limit; n = n < 100 ? n + 1 : Math.ceil(n * 1.05)) {
    const { lower, upper } = wilson(Math.round(p * n), n);
    if (intervalSide(cmp, lower, upper, threshold) !== null) return n;
  }
  return null;
}

// One decimal of a percent, three near 0% and 100% so a 0.12% rate does not print as the 0.1% threshold.
const pct = (x) => `${(x * 100).toFixed((x > 0 && x < 0.01) || (x < 1 && x > 0.99) ? 3 : 1)}%`;

export function thresholdDisplay(c) {
  if (typeof c.threshold !== 'number' || !COMPARISONS.includes(c.comparison)) return 'not stated';
  const t = c.unit === 'ratio' ? `${Number((c.threshold * 100).toPrecision(10))}%` : String(c.threshold);
  return `${c.comparison} ${t}`;
}

// ─── verdicts ───────────────────────────────────────────────────────

function unmeasured(reason) {
  return { verdict: 'unmeasured', reason, measured: null, interval: null };
}

const isUnconfirmedDraft = (c) => c.derived_from === 'prose' && c.confirmed !== true;

// Purely from the criterion and one recorded measurement. `asOf` is an ISO date or null.
export function verdict(criterion, measurement, { asOf = null } = {}) {
  const c = criterion;
  const m = measurement;
  const base = {
    id: c.id, kind: c.kind, statement: c.statement, threshold: thresholdDisplay(c), measurement_id: m?.id ?? null,
    source: m?.source ?? null, mode: m?.mode ?? null, retrieved: typeof m?.retrieved_at === 'string' ? m.retrieved_at.slice(0, 10) : null,
    founder_reported: Boolean(m?.founder_reported), window: m?.window ?? null, unconfirmed: isUnconfirmedDraft(c),
  };
  if (c.incomplete) return { ...base, ...unmeasured('not_parseable') };
  if (asOf && c.evaluate_after && asOf < c.evaluate_after) return { ...base, ...unmeasured('window_not_closed') };
  if (!m) return { ...base, ...unmeasured(c.metric === 'qualitative' ? 'qualitative_needs_founder_input' : 'no_source') };
  if (m.unmeasured) return { ...base, ...unmeasured(m.unmeasured) };

  if (c.unit === 'ratio') {
    const { numerator: k, denominator: n } = m;
    if (!Number.isInteger(k) || !Number.isInteger(n) || k < 0 || n < 0 || k > n) return { ...base, ...unmeasured('no_source') };
    if (n === 0) return { ...base, verdict: 'too early', reason: 'denominator is 0', measured: `${k}/${n}`, interval: null };
    const w = wilson(k, n);
    const measured = `${k}/${n} (${pct(w.p)})`;
    const interval = `${pct(w.lower)}-${pct(w.upper)}`;
    if (c.min_n != null && n < c.min_n) return { ...base, verdict: 'too early', reason: `n ${n} is below the minimum ${c.min_n}`, measured, interval, value: w.p };
    const side = intervalSide(c.comparison, w.lower, w.upper, c.threshold);
    if (side !== null) return { ...base, verdict: side, reason: `the whole 95% interval is on the ${side === 'met' ? 'passing' : 'failing'} side`, measured, interval, value: w.p };
    const leaning = holds(c.comparison, w.p, c.threshold) ? 'met' : 'missed';
    const total = usersNeeded(w.p, c.threshold, c.comparison, n);
    return { ...base, verdict: 'too early', reason: `the 95% interval straddles the threshold, leaning ${leaning}`, measured, interval, value: w.p, leaning, n_needed: total, more_needed: total == null ? null : total - n };
  }

  if (c.unit === 'count') {
    const { numerator: count, denominator: n } = m;
    if (!Number.isFinite(count)) return { ...base, ...unmeasured('no_source') };
    const observed = Number.isFinite(n) ? n : null;
    // A count is settled by the plan: the planned sample is in, or (with no planned sample) the date has passed.
    const hasPlan = c.planned_n != null || c.evaluate_after != null;
    const complete = hasPlan && (c.planned_n == null || (observed != null && observed >= c.planned_n));
    const notYet = !hasPlan ? 'the memo gives no planned sample or date, so one reading cannot settle it' : `planned n ${c.planned_n} not reached (n ${observed ?? 'unknown'})`;
    const measured = observed != null ? `${count} of ${observed}` : `${count}`;
    const passing = holds(c.comparison, count, c.threshold);
    // A count only grows, so a floor that is reached is met and a cap that is passed is missed before the sample is complete.
    if (isUp(c.comparison)) {
      if (passing) return { ...base, verdict: 'met', reason: 'the count reached the threshold', measured, interval: null, value: count };
      if (!complete) return { ...base, verdict: 'too early', reason: notYet, measured, interval: null, value: count };
      return { ...base, verdict: 'missed', reason: 'the planned sample is complete and the count is below the threshold', measured, interval: null, value: count };
    }
    if (!passing) return { ...base, verdict: 'missed', reason: 'the count passed the limit', measured, interval: null, value: count };
    if (!complete) return { ...base, verdict: 'too early', reason: notYet, measured, interval: null, value: count };
    return { ...base, verdict: 'met', reason: 'the planned sample is complete and the count is within the limit', measured, interval: null, value: count };
  }

  const value = m.value;
  if (!Number.isFinite(value)) return { ...base, ...unmeasured('no_source') };
  const n = Number.isFinite(m.denominator) ? m.denominator : null;
  const measured = `${value}${n != null ? ` (n ${n})` : ''}`;
  if (c.min_n == null && c.evaluate_after == null) return { ...base, verdict: 'too early', reason: 'the memo gives no minimum sample or date, so one reading cannot settle it', measured, interval: null, value };
  if (c.min_n != null && (n == null || n < c.min_n)) return { ...base, verdict: 'too early', reason: `n ${n ?? 'unknown'} is below the minimum ${c.min_n}`, measured, interval: null, value };
  return { ...base, verdict: holds(c.comparison, value, c.threshold) ? 'met' : 'missed', reason: 'one value compared with the threshold, no interval', measured, interval: null, value };
}

// ─── conclusion ─────────────────────────────────────────────────────

// Order: a missed kill criterion wins; then anything too early, unmeasured or drafted without
// confirmation blocks; then a missed experiment; then all met.
export function conclude(criteria, verdicts) {
  const byId = new Map(criteria.map((c) => [c.id, c]));
  const rows = verdicts.map((v) => ({ v, c: byId.get(v.id) })).filter((r) => r.c);
  if (!rows.length) return { status: 'none', action: null, actions: [], basis: [], blocking: [], needs_critic: false, text: 'No conclusion yet. The memo has no criteria.' };
  const killMissed = rows.filter((r) => r.c.kind === 'kill' && r.v.verdict === 'missed' && !r.v.unconfirmed);
  const blocking = rows.filter((r) => r.v.verdict === 'too early' || r.v.verdict === 'unmeasured' || r.v.unconfirmed);
  const expMissed = rows.filter((r) => r.c.kind === 'experiment' && r.v.verdict === 'missed' && !r.v.unconfirmed);
  const label = (r) => `${r.c.id} (${oneLine(r.c.statement)})${r.v.founder_reported ? ' [founder-reported]' : ''}`;
  const actionOf = (list) => [...new Set(list.map((r) => r.c.if_missed).filter(Boolean))];
  const why = (r) => (r.v.unconfirmed && r.v.verdict !== 'unmeasured' ? `${r.v.verdict}, drafted from the memo's prose and not confirmed` : `${r.v.verdict}: ${r.v.reason}`);
  if (killMissed.length) {
    const actions = actionOf(killMissed);
    return { status: 'rule', action: actions.length === 1 ? actions[0] : null, actions, basis: killMissed.map(label), text: `The memo's own rule for a missed kill criterion is: ${actions.join(' / ') || 'not stated'}. Missed: ${killMissed.map(label).join('; ')}.`, needs_critic: actions.some((a) => a === 'stop' || a === 'pivot') };
  }
  if (blocking.length) {
    return {
      status: 'none', action: null, actions: [], basis: [], needs_critic: false,
      blocking: blocking.map((r) => ({ id: r.c.id, verdict: r.v.verdict, reason: r.v.reason, unconfirmed: Boolean(r.v.unconfirmed) })),
      missed_experiments: expMissed.map(label),
      text: `No conclusion yet. Blocked by: ${blocking.map((r) => `${r.c.id} (${why(r)})`).join('; ')}.${expMissed.length ? ` Experiments already missed: ${expMissed.map(label).join('; ')}.` : ''}`,
    };
  }
  if (expMissed.length) {
    const actions = actionOf(expMissed);
    return { status: 'rule', action: actions.length === 1 ? actions[0] : null, actions, basis: expMissed.map(label), text: `The memo's own rule for a missed experiment is: ${actions.join(' / ') || 'not stated'}. Missed: ${expMissed.map(label).join('; ')}.`, needs_critic: actions.some((a) => a === 'stop' || a === 'pivot') };
  }
  const metActions = [...new Set(rows.filter((r) => r.c.kind === 'experiment').map((r) => r.c.if_met).filter(Boolean))];
  return { status: 'rule', action: metActions.length === 1 ? metActions[0] : null, actions: metActions, basis: rows.map(label), text: `Every criterion is met. The memo's own rule is: ${metActions.join(' / ') || 'continue'}.`, needs_critic: false };
}

// ─── criteria parsing ───────────────────────────────────────────────

export function validateCriterion(c) {
  const errors = [];
  if (!isObj(c)) return ['criterion is not an object'];
  for (const k of Object.keys(c)) if (!KNOWN_KEYS.has(k)) errors.push(`unknown field "${k}"`);
  const need = (cond, msg) => { if (!cond) errors.push(msg); };
  need(typeof c.id === 'string' && ID_RE.test(c.id), 'id must look like E1 or K1');
  need(KINDS.includes(c.kind), `kind must be one of ${KINDS.join(', ')}`);
  need(typeof c.statement === 'string' && c.statement.trim().length >= 5 && c.statement.length <= 300, 'statement is required (5 to 300 characters)');
  need(METRICS.includes(c.metric), `metric must be one of ${METRICS.join(', ')}`);
  need(COMPARISONS.includes(c.comparison), `comparison must be one of ${COMPARISONS.join(' ')}`);
  need(typeof c.threshold === 'number' && Number.isFinite(c.threshold), 'threshold must be a number');
  need(UNITS.includes(c.unit), `unit must be one of ${UNITS.join(', ')}`);
  if (c.unit === 'ratio' && typeof c.threshold === 'number') need(c.threshold >= 0 && c.threshold <= 1, 'a ratio threshold is between 0 and 1');
  need(SOURCES.includes(c.source), `source must be one of ${SOURCES.join(', ')}`);
  need((c.kind === 'kill' ? KILL_ACTIONS : ACTIONS).includes(c.if_missed), c.kind === 'kill' ? `a kill criterion's if_missed must be one of ${KILL_ACTIONS.join(', ')}` : `if_missed must be one of ${ACTIONS.join(', ')}`);
  need(c.if_met === undefined || c.if_met === null || ACTIONS.includes(c.if_met), `if_met must be one of ${ACTIONS.join(', ')}`);
  if (c.ties_to !== undefined) need(Array.isArray(c.ties_to) && c.ties_to.every((t) => /^[OAK]\d+$/.test(t)), 'ties_to must be an array of O#, A# or K# ids');
  if (c.evaluate_after != null) need(typeof c.evaluate_after === 'string' && ISO_DATE_RE.test(c.evaluate_after), 'evaluate_after must be YYYY-MM-DD');
  for (const k of ['planned_n', 'min_n']) if (c[k] != null) need(Number.isInteger(c[k]) && c[k] > 0, `${k} must be a positive integer or null`);
  // One reading of a count or a single value says nothing about whether the test is over, so the
  // memo has to say when it is: a planned sample, a minimum sample, or a date.
  if (c.unit === 'count') need(c.planned_n != null || c.evaluate_after != null, 'a count needs planned_n or evaluate_after, so one early reading cannot settle it');
  if (c.unit === 'usd' || c.unit === 'value') need(c.min_n != null || c.evaluate_after != null, 'a single value needs min_n or evaluate_after, so one early reading cannot settle it');
  if (c.metric === 'retention') need(RETENTION_FORMS.includes(c.retention_form), `retention needs retention_form: ${RETENTION_FORMS.join(', ')}`);
  for (const k of ['numerator', 'denominator']) {
    if (c[k] == null) continue;
    if (!isObj(c[k])) { errors.push(`${k} must be an object like {"event":"item_logged"}`); continue; }
    if (c[k].event != null) need(typeof c[k].event === 'string' && EVENT_RE.test(c[k].event), `${k}.event must match ${EVENT_RE}`);
  }
  if (c.source === 'bigquery' && ['retention', 'activation', 'funnel', 'conversion', 'dau_wau', 'revenue'].includes(c.metric)) {
    need(isObj(c.numerator) && c.numerator.event, 'a bigquery criterion needs numerator.event');
  }
  if (c.window != null) need(isObj(c.window), 'window must be an object');
  if (c.confirmed != null) need(typeof c.confirmed === 'boolean', 'confirmed must be true or false');
  return errors;
}

export function extractCriteriaBlock(text) {
  const m = text.match(/```criteria[^\n]*\n([\s\S]*?)```/);
  return m ? m[1] : null;
}

function splitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((s) => s.trim());
}

function sectionTable(text, headingRe) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => headingRe.test(l));
  if (start < 0) return null;
  const rows = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,3}\s/.test(lines[i])) break;
    if (/^\s*\|/.test(lines[i])) rows.push(splitRow(lines[i]));
  }
  if (rows.length < 2) return null;
  const header = rows[0].map((h) => h.toLowerCase());
  return { header, body: rows.slice(1).filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c))) };
}

const PCT = String.raw`\d+(?:\.\d+)?\s*%`;
// A comparison phrase counts only when it sits next to the percentage ("at least 50%", "50% or more"),
// so "40% convert in under 7 days" is not read as "under 40%".
const TEXT_COMPARISONS = [
  ['>=', new RegExp(String.raw`(?:\bat least|\bminimum of|>=|≥)\s*${PCT}|${PCT}\s+or more\b`, 'i')],
  ['<=', new RegExp(String.raw`(?:\bat most|\bup to|\bmaximum of|<=|≤)\s*${PCT}|${PCT}\s+or (?:less|fewer)\b`, 'i')],
  ['>', new RegExp(String.raw`(?:\bover|\babove|\bmore than|\bgreater than|>)\s*${PCT}`, 'i')],
  ['<', new RegExp(String.raw`(?:\bunder|\bbelow|\bless than|\bfewer than|<)\s*${PCT}`, 'i')],
];
// The memo states when a kill fires ("under 30%"); the criterion states what keeps the idea alive.
const SURVIVAL_OF = { '<': '>=', '<=': '>', '>=': '<', '>': '<=' };

// Reads a threshold cell only when it is unambiguous: one percentage with one comparison phrase
// next to it, no "N of M" and no negation ("not more than", "no fewer than", "zero"). Anything
// else is left to the founder.
export function guessThreshold(text) {
  const t = String(text ?? '');
  const percents = t.match(new RegExp(PCT, 'g')) ?? [];
  if (percents.length !== 1 || /\b\d+\s+(?:out\s+)?of\s+\d+\b/i.test(t) || /\b(not|no|never|none|neither|nor|zero)\b|n't\b/i.test(t)) return { comparison: null, value: null };
  const hits = TEXT_COMPARISONS.filter(([, re]) => re.test(t)).map(([op]) => op);
  if (hits.length !== 1) return { comparison: null, value: null };
  const value = Number(percents[0].replace(/\s*%/, '')) / 100;
  return value >= 0 && value <= 1 ? { comparison: hits[0], value } : { comparison: null, value: null };
}

const actionWord = (text) => String(text ?? '').match(/^\s*(stop|pivot|revisit|continue|build)\b/i)?.[1].toLowerCase() ?? null;

const stripDraftKeys = (c) => Object.fromEntries(Object.entries(c).filter(([k]) => !DRAFT_KEYS.includes(k)));
const isComputable = (c) => COMPARISONS.includes(c.comparison) && typeof c.threshold === 'number' && Number.isFinite(c.threshold) && UNITS.includes(c.unit) && (c.unit !== 'ratio' || (c.threshold >= 0 && c.threshold <= 1));

// What a draft still needs, and whether a verdict can be computed for it at all.
function draftStatus(c) {
  const needs = validateCriterion(stripDraftKeys(c));
  if (c.confirmed !== true) needs.push('confirm the drafted comparison and threshold with the founder, then set "confirmed": true');
  return { needs, incomplete: !isComputable(c) };
}

// A memo without the block: the two tables become draft criteria. A draft with an unambiguous
// threshold gets a verdict, marked unconfirmed, and no conclusion is drawn from it until the founder confirms it.
export function parseProse(text) {
  const drafts = [];
  const exp = sectionTable(text, /^##\s+Experiments\b/i);
  const expAction = new Map();
  if (exp) {
    const col = (name) => exp.header.findIndex((h) => h.includes(name));
    const [iNo, iTests, iAct, iThr, iDen, iFail] = ['#', 'tests', 'action', 'threshold', 'denominator', 'if it fails'].map(col);
    for (const r of exp.body) {
      const no = String(r[iNo] ?? '').match(/\d+/)?.[0];
      if (!no) continue;
      const g = guessThreshold(r[iThr]);
      const ifMissed = actionWord(r[iFail]);
      if (ifMissed) expAction.set(no, ifMissed);
      drafts.push({
        id: `E${no}`, kind: 'experiment', statement: oneLine(r[iTests] || r[iAct] || `Experiment ${no}`).slice(0, 300),
        draft_text: { action: oneLine(r[iAct]), threshold: oneLine(r[iThr]), denominator: oneLine(r[iDen]), if_missed: oneLine(r[iFail]) },
        ...(g.comparison ? { comparison: g.comparison, threshold: g.value, unit: 'ratio' } : {}),
        ...(ifMissed ? { if_missed: ifMissed } : {}),
      });
    }
  }
  const kill = sectionTable(text, /^##\s+Kill criteria\b/i);
  if (kill) {
    const col = (name) => kill.header.findIndex((h) => h.includes(name));
    const [iCond, iExp, iThr] = ['kill condition', 'experiment', 'threshold'].map(col);
    kill.body.forEach((r, i) => {
      const g = guessThreshold(r[iThr]);
      const linked = expAction.get(String(r[iExp] ?? '').match(/\d+/)?.[0]);
      drafts.push({
        id: `K${i + 1}`, kind: 'kill', statement: oneLine(r[iCond] ?? `Kill condition ${i + 1}`).slice(0, 300),
        draft_text: { experiment: oneLine(r[iExp]), threshold: oneLine(r[iThr]) },
        ...(g.comparison ? { comparison: SURVIVAL_OF[g.comparison], threshold: g.value, unit: 'ratio' } : {}),
        ...(KILL_ACTIONS.includes(linked) ? { if_missed: linked } : {}),
      });
    });
  }
  return drafts.map((d) => {
    const draft = { ...d, derived_from: 'prose', confirmed: false };
    return { ...draft, ...draftStatus(draft) };
  });
}

export function parse(text) {
  const block = extractCriteriaBlock(text);
  if (block == null) {
    const criteria = parseProse(text);
    return { derived_from: 'prose', criteria, errors: criteria.length ? [] : ['no criteria block and no Experiments or Kill criteria table found'] };
  }
  const criteria = [];
  const errors = [];
  const ids = new Set();
  block.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    let c;
    try { c = JSON.parse(line); } catch (e) { errors.push(`criteria line ${i + 1}: not valid JSON (${e.message})`); return; }
    const errs = validateCriterion(c);
    if (isObj(c)) for (const k of DRAFT_KEYS) if (k in c) errs.push(`"${k}" is not a memo field`);
    if (c?.id && ids.has(c.id)) errs.push(`duplicate id ${c.id}`);
    if (c?.id) ids.add(c.id);
    for (const e of errs) errors.push(`${typeof c?.id === 'string' ? c.id : `line ${i + 1}`}: ${e}`);
    criteria.push(isObj(c) && c.kind === 'kill' && c.if_met == null ? { ...c, if_met: 'continue' } : c);
  });
  if (!criteria.length) errors.push('the criteria block is empty');
  return { derived_from: 'block', criteria, errors };
}

// Re-checks a criteria.json the main session completed with the founder. A draft counts as
// confirmed only when it says so and every field is valid.
export function revalidate(doc) {
  const errors = [];
  const ids = new Set();
  const criteria = (Array.isArray(doc.criteria) ? doc.criteria : []).map((c) => {
    if (!isObj(c)) { errors.push('a criterion is not an object'); return c; }
    if (ids.has(c.id)) errors.push(`duplicate id ${c.id}`);
    ids.add(c.id);
    if (c.derived_from !== 'prose') {
      for (const e of validateCriterion(c)) errors.push(`${c.id}: ${e}`);
      return c;
    }
    const { needs, incomplete } = draftStatus(c);
    if (c.confirmed === true) {
      for (const e of needs) errors.push(`${c.id}: ${e}`);
      return Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'needs' && k !== 'incomplete'));
    }
    return { ...c, needs, incomplete };
  });
  return { ...doc, criteria, errors };
}

// ─── measurements ───────────────────────────────────────────────────

const EMAIL_RE = /[^\s@"]+@[^\s@"]+\.[A-Za-z]{2,}/;
const PII_KEY_RE = /user[_-]?(pseudo[_-]?)?id|pseudo[_-]?id|e-?mail|author|reviewer|nickname|username|device[_-]?id|advertising[_-]?id|idfa|gaid/i;
// GA4 user_pseudo_id is a digits.digits pair or a 32-hex / UUID app instance id.
const ID_VALUE_RE = /(?<!\d)\d{8,12}\.\d{8,12}(?!\d)|(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])|(?<![0-9a-f])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![0-9a-f])/i;
const SECRET_RES = [
  /-----BEGIN [A-Z ]+-----/, /Bearer\s+[A-Za-z0-9._-]{8,}/, /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, /"private_key"/,
  /AIza[0-9A-Za-z_-]{20,}/, /\b(?:sk|ghp|gho|ghs)[-_][A-Za-z0-9_-]{16,}/, /github_pat_[A-Za-z0-9_]{20,}/, /glpat-[A-Za-z0-9_-]{16,}/,
  /xox[a-z]-[A-Za-z0-9-]{10,}/, /AKIA[0-9A-Z]{16}/, /ya29\.[A-Za-z0-9_-]{10,}/, /1\/\/[0-9A-Za-z_-]{20,}/,
];

export function containsSecret(text) {
  return SECRET_RES.some((re) => re.test(text));
}

// Returns the reasons a raw result must not be recorded. SECURITY: neither a value nor a field
// name is echoed, because either can be the identifier itself.
export function piiProblems(raw) {
  const problems = new Set();
  const walk = (x, isTop) => {
    if (Array.isArray(x)) return x.forEach((v) => walk(v, false));
    if (isObj(x)) {
      for (const [k, v] of Object.entries(x)) {
        // query_sha is a hash of the SQL text; record checks it against the queries this run rendered.
        if (isTop && k === 'query_sha') continue;
        if (k.length > MAX_STRING) { problems.add('a field name is too long to check'); continue; }
        if (PII_KEY_RE.test(k) || EMAIL_RE.test(k) || ID_VALUE_RE.test(k)) problems.add('a field name looks like a user identifier');
        walk(v, false);
      }
      return;
    }
    if (typeof x === 'string') {
      // MAGIC: aggregates never need a long string, and the email pattern is slow on very long ones.
      if (x.length > MAX_STRING) { problems.add('a text value is too long; send aggregates only'); return; }
      if (EMAIL_RE.test(x)) problems.add('a value contains an email address');
      if (ID_VALUE_RE.test(x)) problems.add('a value looks like a user id');
      if (containsSecret(x)) problems.add('the result contains something that looks like a key or token');
    }
  };
  walk(raw, true);
  return [...problems];
}

const plainText = (value, what) => {
  if (typeof value !== 'string' || !PLAIN_TEXT_RE.test(value)) throw new Error(`${what} must be plain text of at most 120 characters (letters, digits, spaces and _ , . : ( ) / -)`);
  return value;
};

// `knownShas` is the list of query hashes this run rendered for this criterion; null skips that check (fixtures, tests).
export function buildMeasurement(criterion, raw, { now = new Date(), mode = 'live', knownShas = null } = {}) {
  if (!isObj(raw)) throw new Error('the result must be a JSON object');
  const problems = piiProblems(raw);
  if (problems.length) throw Object.assign(new Error(`refusing to record: ${problems.join('; ')}`), { pii: true });
  if (!SOURCES.includes(raw.source)) throw new Error(`source must be one of ${SOURCES.join(', ')}`);
  if (SOURCES.includes(criterion.source) && raw.source !== criterion.source && raw.source !== 'manual') throw new Error(`the criterion's source is ${criterion.source}; a result from another source can only be recorded as manual`);
  const retrieved_at = nowIso(now);
  const base = {
    kind: 'measurement', criterion: criterion.id, url: null, published: null, retrieved_at,
    source: raw.source, mode, topic: 'measurements', bears_on: Array.isArray(criterion.ties_to) ? criterion.ties_to : [],
    confidence: raw.source === 'manual' ? 'low' : 'high', founder_reported: raw.source === 'manual' && raw.unmeasured == null,
    ...(raw.window != null ? { window: plainText(raw.window, 'window') } : {}),
  };
  const statement = oneLine(criterion.statement);
  let rec;
  if (raw.unmeasured != null) {
    if (!UNMEASURED_REASONS.includes(raw.unmeasured)) throw new Error(`unmeasured must be one of ${UNMEASURED_REASONS.join(', ')}`);
    const note = raw.note != null ? plainText(raw.note, 'note') : null;
    rec = { ...base, unmeasured: raw.unmeasured, claim: `${criterion.id} could not be measured: ${raw.unmeasured}${note ? ` (${note})` : ''}`, quote: JSON.stringify({ unmeasured: raw.unmeasured }) };
  } else {
    if (raw.query_sha != null && !/^[0-9a-f]{32}$/.test(raw.query_sha)) throw new Error('query_sha must be the 32 hex characters the sql command printed');
    if (raw.source === 'bigquery') {
      if (raw.query_sha == null) throw new Error('a bigquery result needs the query_sha the sql command printed');
      if (knownShas !== null && !knownShas.includes(raw.query_sha)) throw new Error('query_sha is not one that `sql --dir D --criterion <this id>` printed for this run');
    }
    const row = Array.isArray(raw.rows) ? raw.rows[0] : null;
    if (!isObj(row)) throw new Error('rows must hold one aggregate row: {"numerator":N,"denominator":D} or {"value":V}');
    // SECURITY: only these three numbers of the first row are kept; any other field or row is dropped.
    const kept = {};
    for (const k of ['numerator', 'denominator', 'value']) {
      if (row[k] == null) continue;
      if (typeof row[k] !== 'number' || !Number.isFinite(row[k])) throw new Error(`${k} must be a number`);
      kept[k] = row[k];
    }
    if (kept.numerator == null && kept.value == null) throw new Error('the row needs numerator (and denominator) or value');
    if (criterion.unit === 'ratio') {
      const { numerator: k, denominator: n } = kept;
      if (!Number.isInteger(k) || !Number.isInteger(n) || k < 0 || n < 0 || k > n) throw new Error('a ratio needs whole numbers with 0 <= numerator <= denominator');
      // An event that was never sent also counts 0: a zero is only accepted once the census showed the event.
      if (k === 0 && raw.source === 'bigquery' && mode === 'live' && raw.numerator_event_seen !== true) throw new Error('a numerator of 0 from bigquery needs --event-seen (the event is in the census); if it is not, record unmeasured: event_not_instrumented');
    }
    if (criterion.unit === 'count' && !(Number.isInteger(kept.numerator) && kept.numerator >= 0)) throw new Error('a count needs a whole number of 0 or more as its numerator');
    for (const k of ['denominator', 'value']) if (kept[k] != null && kept[k] < 0) throw new Error(`${k} must not be negative`);
    const what = kept.numerator != null ? `${kept.numerator}${kept.denominator != null ? ` of ${kept.denominator}` : ''}` : `${kept.value}`;
    rec = { ...base, ...kept, quote: JSON.stringify([kept]), claim: `${statement}: ${what}${base.window ? ` over ${base.window}` : ''}`, ...(raw.query_sha != null ? { derived_from: [`query:${raw.query_sha}`] } : {}) };
  }
  const claim = rec.claim.slice(0, 400);
  return { ...rec, claim, id: claimId(`review:${criterion.id}:${retrieved_at}`, claim) };
}

// ─── store rating ───────────────────────────────────────────────────

// EXTERNAL: Apple's public iTunes Lookup API, the same endpoint and fields that nextc-aso's
// store-lookup.mjs reads. It is repeated here because an installed plugin holds only its own folder.
export const LOOKUP_URL = 'https://itunes.apple.com/lookup';
const LOOKUP_TIMEOUT_MS = 15_000;

// The average rating and the number of ratings behind it, as a raw result for buildMeasurement.
export async function storeRating(app, { country = 'us', fetchImpl = fetch } = {}) {
  const id = String(app ?? '');
  const isNumeric = /^\d{5,12}$/.test(id);
  if (!isNumeric && !/^[A-Za-z0-9][A-Za-z0-9.-]{2,154}$/.test(id)) throw usageError('--app must be a numeric App Store id or a bundle id');
  if (!/^[a-z]{2}$/.test(country)) throw usageError('--country must be a two-letter storefront code such as us');
  const url = `${LOOKUP_URL}?${isNumeric ? 'id' : 'bundleId'}=${encodeURIComponent(id)}&country=${country}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`the store lookup answered ${res.status}`);
  const body = await res.json();
  const hit = Array.isArray(body?.results) ? body.results[0] : null;
  if (!hit) throw new Error(`the store lookup found no app for that id in the ${country} storefront`);
  const window = `all ratings to date, ${country} App Store`;
  if (!Number.isFinite(hit.averageUserRating) || !Number.isInteger(hit.userRatingCount) || hit.userRatingCount === 0) {
    return { source: 'store_public', unmeasured: 'no_source', note: 'the listing shows no ratings yet', window };
  }
  return { source: 'store_public', rows: [{ value: hit.averageUserRating, denominator: hit.userRatingCount }], window };
}

// ─── files ──────────────────────────────────────────────────────────

const isLink = (p) => {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    // Nothing there: not a link.
    return false;
  }
};
// SECURITY: a run folder or run file that is a symbolic link (a repo can commit one) would send
// writes somewhere else, so it is refused.
function refuseLink(p) {
  if (isLink(p)) throw new Error(`${p} is a symbolic link; the run folder and its files must be real`);
}
const readJson = (file, fallback = null) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw new Error(`${file} is not valid JSON`);
  }
};
const writeJson = (file, value) => { refuseLink(file); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); };
// SECURITY: the parse error is not passed on, because it quotes the start of the file.
const parseResult = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('the result is not valid JSON');
  }
};

export function loadMeasurements(dir) {
  const file = path.join(dir, 'measurements.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
}

function appendMeasurement(dir, rec) {
  const file = path.join(dir, 'measurements.jsonl');
  refuseLink(file);
  fs.appendFileSync(file, JSON.stringify(rec) + '\n');
}

function loadCriteria(dir) {
  const doc = readJson(path.join(dir, 'criteria.json'));
  if (!doc || !Array.isArray(doc.criteria)) throw new Error(`${dir}/criteria.json not found; run parse first`);
  return doc;
}

function criterionById(doc, id) {
  if (typeof id !== 'string' || !ID_RE.test(id)) throw usageError('--criterion must look like E1 or K1');
  const c = doc.criteria.find((x) => isObj(x) && x.id === id);
  if (!c) throw new Error(`no criterion ${id}`);
  return c;
}

// The criteria a verdict may be computed from. The memo is the authority: when it has a criteria
// block, the stored copy must equal a fresh parse of it, whatever criteria.json says about itself.
// Only a memo without a block has drafts, and every one of them must still be marked as a draft.
export function trustedCriteria(dir) {
  const doc = loadCriteria(dir);
  // The memo path the run was started with wins over the one written in criteria.json.
  const memo = readJson(path.join(dir, 'state.json'), null)?.memo ?? doc.memo;
  let text;
  try {
    text = fs.readFileSync(memo, 'utf8');
  } catch {
    throw new Error(`cannot read the memo ${memo} to check criteria.json against it; run parse again`);
  }
  const fresh = parse(text);
  if (fresh.derived_from === 'block') {
    if (fresh.errors.length || doc.derived_from !== 'block' || JSON.stringify(fresh.criteria) !== JSON.stringify(doc.criteria)) throw new Error('criteria.json no longer matches the memo\'s criteria block; run parse again');
    return doc.criteria;
  }
  if (doc.derived_from !== 'prose' || doc.criteria.some((c) => !isObj(c) || c.derived_from !== 'prose')) throw new Error('criteria.json no longer reads as drafted from this memo; run parse again');
  const drafted = new Set(fresh.criteria.map((c) => c.id));
  if (doc.criteria.length !== drafted.size || doc.criteria.some((c) => !drafted.has(c.id))) throw new Error('criteria.json does not hold the criteria this memo\'s tables give; run parse again');
  const checked = revalidate(doc);
  if (checked.errors.length) throw new Error(`criteria.json has errors; run validate: ${checked.errors.join('; ')}`);
  return checked.criteria;
}

// A review looks back: a date after today would open every evaluate_after gate.
function reviewDate(value, now) {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) throw usageError('--as-of must be YYYY-MM-DD');
  if (value > nowIso(now).slice(0, 10)) throw usageError('--as-of must not be after today');
  return value;
}

export function computeVerdicts(dir, { asOf = null, now = new Date() } = {}) {
  const criteria = trustedCriteria(dir);
  const latest = new Map();
  for (const m of loadMeasurements(dir)) latest.set(m.criterion, m);
  const state = readJson(path.join(dir, 'state.json'), {}) ?? {};
  // With no date the evaluate_after gate would be off, so today is the default.
  const as = reviewDate(asOf ?? state.as_of ?? nowIso(now).slice(0, 10), now);
  return { criteria, verdicts: criteria.map((c) => verdict(c, latest.get(c.id) ?? null, { asOf: as })), as_of: as };
}

function touch(dir, event, extra = {}, now = new Date()) {
  const file = path.join(dir, 'state.json');
  const s = readJson(file, null);
  if (!s) return;
  writeJson(file, { ...s, ...extra, updated_at: nowIso(now), events: [...(s.events ?? []), { at: nowIso(now), event }] });
}

export function initRun(dir, { memo = null, asOf = null, maxBytesBilled = null, now = new Date() } = {}) {
  if (asOf != null) reviewDate(asOf, now);
  if (maxBytesBilled != null && !(Number.isSafeInteger(maxBytesBilled) && maxBytesBilled > 0)) throw usageError('--max-bytes-billed must be a positive whole number');
  refuseLink(dir);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'state.json');
  const existing = readJson(file, null);
  if (existing) {
    // The intake comes after the first init, so a later call may set the cap or move the date.
    const changes = { ...(maxBytesBilled != null ? { max_bytes_billed: maxBytesBilled } : {}), ...(asOf != null ? { as_of: asOf } : {}) };
    if (Object.keys(changes).length === 0) return { state: existing, resumed: true };
    const state = { ...existing, ...changes, updated_at: nowIso(now) };
    writeJson(file, state);
    return { state, resumed: true };
  }
  const state = { version: 1, created_at: nowIso(now), updated_at: nowIso(now), memo, as_of: asOf ?? nowIso(now).slice(0, 10), max_bytes_billed: maxBytesBilled, queries: [], events: [] };
  writeJson(file, state);
  return { state, resumed: false };
}

// ─── report: the table and the check ────────────────────────────────

const cell = (text, max = 200) => oneLine(text).replace(/\|/g, '/').slice(0, max);
export const TABLE_HEADER = ['| Id | Statement | Threshold | Measured (numerator/denominator, window) | 95% interval | Verdict | Evidence |', '|----|-----------|-----------|-------------------------------------------|--------------|---------|----------|'];

function verdictCell(v) {
  const flag = v.unconfirmed ? ' (threshold drafted from prose, not confirmed)' : '';
  if (v.verdict === 'unmeasured') return `unmeasured: ${v.reason}${flag}`;
  if (v.verdict === 'too early') return `too early: ${v.reason}${v.more_needed != null ? `; about ${v.more_needed} more users (${v.n_needed} in all) at this rate would settle it` : ''}${flag}`;
  return `${v.verdict}${flag}`;
}

// The criteria table as the report must carry it, one line per criterion.
export function tableRows(verdicts) {
  return verdicts.map((v) => {
    const measured = v.measured ? `${v.measured}${v.window ? `, ${v.window}` : ''}` : 'not measured';
    const evidence = v.measurement_id ? [v.measurement_id, v.source, v.founder_reported ? 'founder-reported' : null, v.mode === 'fixture' ? 'fixture' : null, v.retrieved].filter(Boolean).join(', ') : '-';
    return `| ${v.id} | ${cell(v.statement)} | ${v.threshold} | ${cell(measured)} | ${v.interval ?? '-'} | ${cell(verdictCell(v), 300)} | ${cell(evidence)} |`;
  });
}

// The lines of the one section with this heading, without blank lines; an error text when the
// report has none or more than one.
function sectionBody(lines, name) {
  const isHeading = (l) => new RegExp(String.raw`^#{1,6}\s+${name}\b`, 'i').test(l);
  const starts = lines.flatMap((l, i) => (isHeading(l) ? [i] : []));
  if (starts.length !== 1) return { error: `the report needs exactly one "## ${name}" section (found ${starts.length})` };
  const end = lines.findIndex((l, i) => i > starts[0] && /^#{1,6}\s/.test(l));
  return { body: lines.slice(starts[0] + 1, end < 0 ? undefined : end).filter((l) => l !== '') };
}

// The report passes only when its Conclusion section is the script's conclusion and nothing
// else, its Criteria section is the script's table and nothing else, and no other table line
// names a criterion.
export function reportCheck({ verdicts, conclusion, report }) {
  const errors = [];
  if (containsSecret(report)) errors.push('the report contains something that looks like a key or token');
  const lines = report.split(/\r?\n/).map((l) => l.trim());
  const concl = sectionBody(lines, 'Conclusion');
  if (concl.error) errors.push(concl.error);
  else if (concl.body.join(' ') !== conclusion.text) errors.push('the Conclusion section must hold the text the conclude command printed and nothing else');
  const expected = [...TABLE_HEADER, ...tableRows(verdicts)];
  const table = sectionBody(lines, 'Criteria');
  if (table.error) errors.push(table.error);
  else if (table.body.length !== expected.length || table.body.some((l, i) => l !== expected[i])) errors.push('the Criteria section must hold the table the table command printed and nothing else');
  const tableLines = new Set(expected);
  for (const line of lines) {
    if (line.includes('|') && !tableLines.has(line) && /(^|[^A-Za-z0-9])[EK]\d{1,3}(?![A-Za-z0-9])/.test(line)) errors.push('the report has a table line about a criterion that the table command did not print');
  }
  return { ok: !errors.length, errors };
}

// ─── SQL templates ──────────────────────────────────────────────────

const DATE_KEYS = /(^|_)(start|end)$/;
const INT_KEYS = new Map([['n', [1, 365]], ['within_days', [1, 365]]]);
// MAGIC: no template needs more than a cohort plus its observation window; a wider scan is a mistake or an attack on the bill.
const MAX_SPAN_DAYS = 400;
const DATE_ORDER = [['cohort_start', 'cohort_end'], ['cohort_end', 'observe_end'], ['start', 'end']];

export function validateParam(key, value) {
  const v = String(value);
  if (key === 'project') { if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(v)) throw new Error('project must be a Google Cloud project id'); return v; }
  if (key === 'dataset') { if (!/^analytics_\d{6,12}$/.test(v)) throw new Error('dataset must look like analytics_<property id>'); return v; }
  if (key === 'purchase_events') {
    const names = v.split(',');
    if (!names.length || names.length > 10 || !names.every((x) => EVENT_RE.test(x))) throw new Error('purchase_events must be 1-10 event names');
    return names.map((x) => `'${x}'`).join(', ');
  }
  if (/^[a-z]+_event$/.test(key)) { if (!EVENT_RE.test(v)) throw new Error(`${key} must match ${EVENT_RE}`); return v; }
  if (INT_KEYS.has(key)) {
    const [lo, hi] = INT_KEYS.get(key);
    if (!/^\d{1,3}$/.test(v) || Number(v) < lo || Number(v) > hi) throw new Error(`${key} must be an integer from ${lo} to ${hi}`);
    return v;
  }
  if (DATE_KEYS.test(key)) {
    if (!/^\d{8}$/.test(v)) throw new Error(`${key} must be YYYYMMDD`);
    const d = new Date(`${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10).replace(/-/g, '') !== v) throw new Error(`${key} is not a real date`);
    return v;
  }
  throw new Error(`unknown parameter "${key}"`);
}

export function loadTemplate(name, sqlFile) {
  if (typeof name !== 'string' || !/^[a-z_]{1,30}$/.test(name)) throw usageError('--template must be a template name such as retention');
  const text = fs.readFileSync(sqlFile, 'utf8');
  const m = text.match(new RegExp(`^##\\s+template:\\s*${name}\\s*$[\\s\\S]*?\`\`\`sql\\n([\\s\\S]*?)\`\`\``, 'm'));
  if (!m) throw new Error(`no template "${name}" in ${sqlFile}`);
  return m[1];
}

const dayOf = (yyyymmdd) => Date.UTC(Number(yyyymmdd.slice(0, 4)), Number(yyyymmdd.slice(4, 6)) - 1, Number(yyyymmdd.slice(6, 8))) / 86_400_000;

// EXTERNAL: GA4 daily export tables can change for up to 3 days (support.google.com/analytics/answer/7029846).
const SETTLE_DAYS = 3;

// `asOf` (YYYY-MM-DD) is the review date; with it, no date may be later than SETTLE_DAYS before it.
export function renderSql(template, params, { asOf = null } = {}) {
  const clean = new Map();
  for (const [k, v] of Object.entries(params)) clean.set(k, validateParam(k, v));
  const dated = [...clean].filter(([k]) => DATE_KEYS.test(k));
  const dates = dated.map(([, v]) => dayOf(v));
  if (asOf !== null) {
    const last = dayOf(asOf.replace(/-/g, '')) - SETTLE_DAYS;
    // A day with no data yet counts everyone as not returned, which reads as a missed kill.
    for (const [k, v] of dated) if (dayOf(v) > last) throw new Error(`${k} is later than ${SETTLE_DAYS} days before the review date ${asOf}; there is no settled data for it yet`);
  }
  if (dates.length && Math.max(...dates) - Math.min(...dates) > MAX_SPAN_DAYS) throw new Error(`the dates span more than ${MAX_SPAN_DAYS} days`);
  for (const [a, b] of DATE_ORDER) if (clean.has(a) && clean.has(b) && clean.get(a) > clean.get(b)) throw new Error(`${a} must not be after ${b}`);
  // A cohort that has not had its days yet counts everyone in it as not returned.
  const lag = clean.get('n') ?? clean.get('within_days');
  if (clean.has('cohort_end') && clean.has('observe_end') && lag != null && dayOf(clean.get('cohort_end')) + Number(lag) > dayOf(clean.get('observe_end'))) {
    throw new Error('the cohort has not had time to return: move cohort_end back so that cohort_end plus n (or within_days) is not after observe_end, or record unmeasured: window_not_closed');
  }
  const out = template.replace(/\{\{([a-z_]+)\}\}/g, (_, k) => {
    if (!clean.has(k)) throw new Error(`template needs --set ${k}=<value>`);
    return clean.get(k);
  });
  return { sql: out, sha: crypto.createHash('sha256').update(out).digest('hex').slice(0, 32) };
}

// ─── CLI ────────────────────────────────────────────────────────────

const USAGE = `review-check.mjs: criteria, measurements and verdicts for /product-review

  init   --dir D [--memo M] [--as-of YYYY-MM-DD] [--max-bytes-billed N]   create the run folder and state.json (a later call can set the cap or the date)
  parse  --memo M --dir D        read the memo's criteria block (or draft from its tables) into D/criteria.json
  validate --dir D               re-check a criteria.json after you completed and confirmed a prose draft with the founder
  sql    --template NAME --dir D [--criterion ID] --set key=value ...   render a template from references/sql.md with validated values (the criterion ties the query hash to it)
  check-bytes --dir D --bytes N  exit 1 when a dry run's bytes are over the run's cap
  record --dir D --criterion ID --source S (--numerator N [--denominator D] | --value V [--denominator D] | --unmeasured REASON [--note T])
         [--window T] [--query-sha H] [--event-seen]      append one measurement
  record --dir D --criterion ID (--file F | --data-dir X)  the same from a JSON file, or from X/<ID>.json (no fixture file: unmeasured no_source)
  rating --dir D --criterion ID --app <App Store id or bundle id> [--country us]   look up the public rating and record it
  verdict --dir D [--as-of DATE] compute verdicts from the recorded numbers (writes D/verdicts.json; --as-of is kept for the run)
  conclude --dir D               apply the memo's own if_missed / if_met rules (writes D/conclusion.json)
  table --dir D                  print the criteria table for the report
  report-check --dir D [--report F]   the report must carry the table rows and the conclusion exactly

Exit codes: 0 ok, 1 check failed, 2 usage error.`;

const FLAGS = new Set(['event-seen']);

function parseArgs(argv) {
  const args = { _: [], set: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { args._.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    const val = FLAGS.has(key) || next === undefined || next.startsWith('--') ? true : (i++, next);
    if (key === 'set') args.set.push(val); else args[key] = val;
  }
  return args;
}

const numberArg = (value, name) => {
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value)) throw usageError(`--${name} must be a number`);
  return Number(value);
};

// The raw result a `record` call describes, from flags, a file or a fixture folder.
function rawFromArgs(args, c, stdin) {
  if (typeof args['data-dir'] === 'string') {
    const f = path.join(args['data-dir'], `${c.id}.json`);
    return { mode: 'fixture', raw: fs.existsSync(f) ? parseResult(fs.readFileSync(f, 'utf8')) : { source: SOURCES.includes(c.source) ? c.source : 'manual', unmeasured: 'no_source', note: 'no fixture file' } };
  }
  if (typeof args.file === 'string') return { mode: 'live', raw: parseResult(fs.readFileSync(args.file, 'utf8')) };
  if (typeof args.source !== 'string') return { mode: 'live', raw: parseResult(stdin()) };
  const common = {
    source: args.source,
    ...(typeof args.window === 'string' ? { window: args.window } : {}),
    ...(typeof args['query-sha'] === 'string' ? { query_sha: args['query-sha'] } : {}),
    ...(args['event-seen'] === true ? { numerator_event_seen: true } : {}),
  };
  if (typeof args.unmeasured === 'string') return { mode: 'live', raw: { ...common, unmeasured: args.unmeasured, ...(typeof args.note === 'string' ? { note: args.note } : {}) } };
  const row = Object.fromEntries(['numerator', 'denominator', 'value'].filter((k) => args[k] !== undefined).map((k) => [k, numberArg(args[k], k)]));
  return { mode: 'live', raw: { ...common, rows: [row] } };
}

const print = (v) => process.stdout.write((typeof v === 'string' ? v : JSON.stringify(v, null, 2)) + '\n');
const SQL_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'product-review', 'references', 'sql.md');

export async function main(argv, { stdin = () => fs.readFileSync(0, 'utf8'), fetchImpl = fetch } = {}) {
  const args = parseArgs(argv);
  const [cmd] = args._;
  const need = (k) => { if (typeof args[k] !== 'string') throw usageError(`--${k} is required`); return args[k]; };
  const runDir = () => { const dir = need('dir'); refuseLink(dir); return dir; };
  switch (cmd) {
    case 'init': {
      const r = initRun(need('dir'), { memo: typeof args.memo === 'string' ? args.memo : null, asOf: typeof args['as-of'] === 'string' ? args['as-of'] : null, maxBytesBilled: args['max-bytes-billed'] !== undefined ? numberArg(args['max-bytes-billed'], 'max-bytes-billed') : null });
      print({ dir: args.dir, resumed: r.resumed, as_of: r.state.as_of, max_bytes_billed: r.state.max_bytes_billed });
      return 0;
    }
    case 'parse': {
      const dir = runDir();
      const memo = need('memo');
      const r = parse(fs.readFileSync(memo, 'utf8'));
      if (r.errors.length) { print({ ok: false, errors: r.errors }); return 1; }
      writeJson(path.join(dir, 'criteria.json'), { version: 1, memo, derived_from: r.derived_from, parsed_at: nowIso(), criteria: r.criteria });
      touch(dir, `parse:${r.derived_from}`);
      const drafts = r.criteria.filter((c) => c.derived_from === 'prose');
      print({ ok: true, derived_from: r.derived_from, criteria: r.criteria.length, drafts: drafts.map((c) => ({ id: c.id, computable: !c.incomplete, needs: c.needs })), note: drafts.length ? 'Drafted from the memo\'s tables. A draft with a readable threshold gets a verdict marked unconfirmed, and no conclusion is drawn until the founder confirms it (set "confirmed": true, complete its fields, run validate). A draft with no readable threshold is unmeasured: not_parseable.' : undefined });
      return 0;
    }
    case 'validate': {
      const dir = runDir();
      const r = revalidate(loadCriteria(dir));
      if (r.errors.length) { print({ ok: false, errors: r.errors }); return 1; }
      writeJson(path.join(dir, 'criteria.json'), Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'errors')));
      touch(dir, 'validate');
      print({ ok: true, unconfirmed: r.criteria.filter((c) => c.derived_from === 'prose' && c.confirmed !== true).map((c) => ({ id: c.id, computable: !c.incomplete, needs: c.needs })) });
      return 0;
    }
    case 'sql': {
      const dir = runDir();
      const params = Object.fromEntries(args.set.map((s) => {
        const i = typeof s === 'string' ? s.indexOf('=') : -1;
        if (i < 1) throw usageError('--set needs key=value');
        return [s.slice(0, i), s.slice(i + 1)];
      }));
      const state = readJson(path.join(dir, 'state.json'), null);
      if (!state) throw new Error(`${dir}/state.json not found; run init first`);
      const criterion = args.criterion !== undefined ? criterionById(loadCriteria(dir), args.criterion).id : null;
      const { sql, sha } = renderSql(loadTemplate(need('template'), SQL_FILE), params, { asOf: reviewDate(state.as_of, new Date()) });
      touch(dir, `sql:${args.template}`, { queries: [...(state.queries ?? []).filter((q) => !(q.sha === sha && q.criterion === criterion)), { sha, template: args.template, criterion }] });
      print(`-- query_sha: ${sha}\n${sql}`);
      return 0;
    }
    case 'check-bytes': {
      const dir = runDir();
      const bytes = numberArg(need('bytes'), 'bytes');
      const cap = readJson(path.join(dir, 'state.json'), {})?.max_bytes_billed ?? null;
      if (cap == null) { print({ ok: false, error: 'this run has no bytes cap; set one with init --max-bytes-billed before running a query' }); return 1; }
      const ok = bytes <= cap;
      touch(dir, `check-bytes:${ok ? 'ok' : 'over'}:${bytes}`);
      print({ ok, bytes, cap, ...(ok ? {} : { error: 'over the cap: do not run this query' }) });
      return ok ? 0 : 1;
    }
    case 'record': {
      const dir = runDir();
      const c = criterionById(loadCriteria(dir), need('criterion'));
      let rec;
      try {
        const { raw, mode } = rawFromArgs(args, c, stdin);
        // A live bigquery number needs a query rendered for this criterion in this run; with no state.json there is none.
        const queries = readJson(path.join(dir, 'state.json'), null)?.queries ?? [];
        rec = buildMeasurement(c, raw, { mode, knownShas: mode === 'live' ? queries.filter((q) => q.criterion === c.id).map((q) => q.sha) : null });
      } catch (e) {
        if (e.usage) throw e;
        print({ ok: false, error: e.message });
        return 1;
      }
      appendMeasurement(dir, rec);
      touch(dir, `record:${c.id}`);
      print({ ok: true, id: rec.id, criterion: c.id, mode: rec.mode, claim: rec.claim });
      return 0;
    }
    case 'rating': {
      const dir = runDir();
      const c = criterionById(loadCriteria(dir), need('criterion'));
      let rec;
      try {
        rec = buildMeasurement(c, await storeRating(need('app'), { country: typeof args.country === 'string' ? args.country : 'us', fetchImpl }));
      } catch (e) {
        if (e.usage) throw e;
        // The lookup failed: nothing is recorded, and the caller records the criterion as unmeasured.
        print({ ok: false, error: e.message });
        return 1;
      }
      appendMeasurement(dir, rec);
      touch(dir, `rating:${c.id}`);
      print({ ok: true, id: rec.id, criterion: c.id, mode: 'live', claim: rec.claim });
      return 0;
    }
    case 'verdict': {
      const dir = runDir();
      const asOf = typeof args['as-of'] === 'string' ? args['as-of'] : null;
      if (asOf !== null) reviewDate(asOf, new Date());
      // ORDER: the date is stored before computing, so conclude, table and report-check use the same one.
      if (asOf !== null) touch(dir, 'as-of', { as_of: asOf });
      const r = computeVerdicts(dir, { asOf });
      writeJson(path.join(dir, 'verdicts.json'), { as_of: r.as_of, verdicts: r.verdicts });
      touch(dir, 'verdict');
      print({ as_of: r.as_of, verdicts: r.verdicts });
      return 0;
    }
    case 'conclude': {
      const dir = runDir();
      const r = computeVerdicts(dir);
      const out = conclude(r.criteria, r.verdicts);
      writeJson(path.join(dir, 'conclusion.json'), out);
      touch(dir, 'conclude');
      print(out);
      return 0;
    }
    case 'table': {
      const r = computeVerdicts(runDir());
      print([...TABLE_HEADER, ...tableRows(r.verdicts)].join('\n'));
      return 0;
    }
    case 'report-check': {
      const dir = runDir();
      const r = computeVerdicts(dir);
      const file = typeof args.report === 'string' ? args.report : path.join(dir, 'report.md');
      const res = reportCheck({ verdicts: r.verdicts, conclusion: conclude(r.criteria, r.verdicts), report: fs.readFileSync(file, 'utf8') });
      print(res);
      return res.ok ? 0 : 1;
    }
    default:
      throw usageError(cmd ? `unknown command "${cmd}"` : 'no command given');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (err) => {
      process.stderr.write(`review-check: ${err.message}\n`);
      if (err.usage) process.stderr.write(`\n${USAGE}\n`);
      process.exitCode = err.usage ? 2 : 1;
    },
  );
}
