#!/usr/bin/env node
// Mechanical check of a proposed metadata file against limits.json and the live listing on disk.
//
//   limits-check.mjs aso/metadata/en-US.json [--out aso/metadata/en-US.check.md]
//   limits-check.mjs aso/metadata/en-US.json --embed aso/report.md   (writes the Current → Proposed table into the report)
//   limits-check.mjs aso/metadata/en-US.json --table                  (prints the table)
//   limits-check.mjs --field ios.name --text "Nestly: Care for Your People"   (one value, for naming)
//
// Exit codes: 0 pass (warnings allowed), 1 failures found, 2 usage error.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, readJson, writeText, charCount, byteCount, words, normalizeText, isoNow, isMain } from './lib/common.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LIMITS_FILE = path.join(HERE, 'limits.json');

export const FIELDS = {
  ios: ['name', 'subtitle', 'keywords', 'promotionalText', 'description', 'whatsNew'],
  android: ['title', 'shortDescription', 'fullDescription'],
};
const PLAY_POLICY = { source: 'https://support.google.com/googleplay/android-developer/answer/9898842', confirmed: true };
const BRAND_FAIL_FIELDS = new Set(['name', 'subtitle', 'keywords', 'promotionalText', 'title', 'shortDescription']);

export function measure(value, unit) {
  return unit === 'bytes' ? byteCount(value) : charCount(value);
}

export function keywordEntries(field) {
  return String(field ?? '').split(',');
}

// Crude English plural folding; only applied to Latin-script words.
export function singular(w) {
  if (!/^[a-z]+$/.test(w) || w.length < 4) return w;
  if (w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (/(ches|shes|sses|xes|zes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) return w.slice(0, -1);
  return w;
}

function brandHits(text, brands) {
  const t = ` ${normalizeText(text).replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  return brands.filter((b) => {
    const nb = normalizeText(b).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    return nb && t.includes(` ${nb} `);
  });
}

function keywordChecks(platformFields, meta, limits, add) {
  const kw = platformFields.keywords?.proposed;
  if (kw === null || kw === undefined) return;
  const rules = limits.rules;
  const entries = keywordEntries(kw);
  if (/^\s|\s$/.test(kw)) add('fail', 'ios.keywords', 'Leading or trailing whitespace spends bytes.');
  if (/,\s/.test(kw)) add('fail', 'ios.keywords', 'Space after a comma spends a byte each and adds nothing; separate with commas only.');
  if (/\s,/.test(kw)) add('fail', 'ios.keywords', 'Space before a comma spends bytes.');
  if (entries.some((e) => e.trim() === '')) add('fail', 'ios.keywords', 'Empty entry (doubled, leading or trailing comma).');
  const minChars = rules['ios.keywords.minWordChars'].value;
  for (const e of entries.map((x) => x.trim()).filter(Boolean)) {
    if (charCount(e) < minChars) add('fail', 'ios.keywords', `"${e}" is ${charCount(e)} characters; Apple requires each keyword to be greater than two characters.`, rules['ios.keywords.minWordChars']);
  }
  const seen = new Map();
  for (const e of entries.map((x) => normalizeText(x.trim())).filter(Boolean)) {
    if (seen.has(e)) add('fail', 'ios.keywords', `"${e}" appears twice in the keyword field.`);
    seen.set(e, true);
  }
  const kwWords = entries.flatMap((e) => words(e));
  const nameWords = new Set(words(platformFields.name?.proposed ?? platformFields.name?.current ?? ''));
  const subWords = new Set(words(platformFields.subtitle?.proposed ?? platformFields.subtitle?.current ?? ''));
  const sellerWords = new Set(words(meta.sellerName || ''));
  const dupWords = new Map();
  for (const w of kwWords) dupWords.set(w, (dupWords.get(w) || 0) + 1);
  for (const [w, n] of dupWords) {
    if (n > 1) add('warn', 'ios.keywords', `Word "${w}" is used ${n} times across keyword entries; if Apple indexes single words (undocumented), the repeats spend bytes.`);
  }
  for (const w of new Set(kwWords)) {
    if (nameWords.has(w)) add('fail', 'ios.keywords', `"${w}" is already in the app name.`, rules['ios.keywords.noNameOrCompany']);
    else if (subWords.has(w)) add('fail', 'ios.keywords', `"${w}" is already in the subtitle; repeating it spends bytes.`);
    if (sellerWords.has(w)) add('fail', 'ios.keywords', `"${w}" is part of the company name.`, rules['ios.keywords.noNameOrCompany']);
  }
  const all = [...nameWords, ...subWords, ...new Set(kwWords)];
  const bySingular = new Map();
  for (const w of new Set(all)) {
    const s = singular(w);
    if (!bySingular.has(s)) bySingular.set(s, new Set());
    bySingular.get(s).add(w);
  }
  for (const forms of bySingular.values()) {
    if (forms.size > 1) add('warn', 'ios.keywords', `Singular/plural pair across name, subtitle and keywords: ${[...forms].join(' / ')}. Apple does not document plural matching; keep both only with rank evidence.`);
  }
}

export function resolveCurrent(platform, field, sources) {
  for (const s of sources) {
    if (s.data.platform !== platform) continue;
    if (s.data.fields && Object.prototype.hasOwnProperty.call(s.data.fields, field) && s.data.fields[field] !== undefined) {
      return { value: s.data.fields[field], file: s.file, provenance: s.data.provenance };
    }
  }
  return null;
}

const norm = (v) => String(v ?? '').replace(/\r\n/g, '\n').trim();

export function checkMetadata(meta, { limits, sources = [], brands = [] } = {}) {
  const findings = [];
  const unconfirmed = new Set();
  const add = (level, where, message, ref) => {
    findings.push({ level, where, message, source: ref?.source });
    if (ref && ref.confirmed === false) unconfirmed.add(where);
  };
  const competitorBrands = [...new Set([...(meta.competitorBrands || []), ...brands])];

  let any = false;
  for (const platform of ['ios', 'android']) {
    const pf = meta[platform];
    if (!pf) continue;
    any = true;
    for (const [field, entry] of Object.entries(pf)) {
      const key = `${platform}.${field}`;
      if (!FIELDS[platform].includes(field)) { add('fail', key, `Unknown field "${field}" for ${platform}.`); continue; }
      if (!entry || typeof entry !== 'object') { add('fail', key, 'Field must be an object with "current" and "proposed".'); continue; }
      const limit = limits.limits[key];
      const proposed = entry.proposed;
      if (proposed !== null && proposed !== undefined) {
        if (typeof proposed !== 'string') { add('fail', key, 'Proposed value must be a string or null.'); continue; }
        if (limit) {
          const n = measure(proposed, limit.unit);
          const level = limit.confirmed ? 'fail' : 'warn';
          if (limit.max !== undefined && n > limit.max) add(level, key, `${n} ${limit.unit} exceeds the ${limit.max}-${limit.unit} limit${limit.confirmed ? '' : ' (limit unconfirmed)'}.`, limit);
          if (limit.min !== undefined && n < limit.min) add(level, key, `${n} ${limit.unit} is below the ${limit.min}-${limit.unit} minimum.`, limit);
          if (!limit.confirmed) unconfirmed.add(key);
        }
        for (const p of limits.policyPatterns) {
          if (!p.platforms.includes(platform) || !p.fields.includes(field)) continue;
          const rx = new RegExp(p.pattern, p.flags);
          const m = proposed.match(rx);
          if (m) add(p.confirmed ? p.severity : 'warn', key, `Policy ${p.id}: "${m[0]}" — ${p.quote}`, p);
        }
        if (platform === 'android' && field === 'title') {
          const own = new Set((meta.brandTerms || []).map((b) => normalizeText(b)));
          for (const w of proposed.split(/\s+/)) {
            const letters = w.replace(/[^\p{L}]/gu, '');
            if (letters.length >= 4 && letters === letters.toUpperCase() && letters !== letters.toLowerCase() && !own.has(normalizeText(w))) {
              add('warn', key, `"${w}" is in ALL CAPS; Google allows that only when it is part of the brand (add it to brandTerms if so).`, PLAY_POLICY);
            }
          }
        }
        const hits = brandHits(field === 'keywords' ? proposed.replace(/,/g, ' ') : proposed, competitorBrands);
        for (const h of hits) {
          add(BRAND_FAIL_FIELDS.has(field) ? 'fail' : 'warn', key, `Competitor brand "${h}" in ${field}.`, limits.rules['ios.keywords.noOtherAppNames']);
        }
      }
      // "current" must be exactly what the store (or the user, recorded with a date) says.
      const cur = resolveCurrent(platform, field, sources);
      if (entry.current !== null && entry.current !== undefined) {
        if (!cur) add('fail', key, 'Has a "current" value but no listing file on disk provides this field (run store-lookup listing, asc.mjs app-info, play.mjs listing or store-lookup manual).');
        else if (norm(cur.value) !== norm(entry.current)) add('fail', key, `"current" does not match ${cur.file} (${cur.provenance?.retrievedAt || cur.provenance?.recordedAt || 'undated'}).`);
      } else if (cur && norm(cur.value) !== '') {
        add('fail', key, `"current" is empty but ${cur.file} has a value; copy it from the file.`);
      }
    }
    if (platform === 'ios') keywordChecks(pf, meta, limits, add);
  }
  if (!any) add('fail', 'file', 'No "ios" or "android" section.');
  return {
    pass: !findings.some((f) => f.level === 'fail'),
    findings,
    unconfirmed: [...unconfirmed],
  };
}

export function loadSources(meta, baseDir) {
  return (meta.currentSources || []).map((f) => {
    const file = path.resolve(baseDir, f);
    if (!fs.existsSync(file)) return { file: f, data: { platform: null, fields: {} }, missing: true };
    return { file: f, data: readJson(file) };
  });
}

const clip = (s, n = 70) => {
  if (s === null || s === undefined) return '';
  const one = String(s).replace(/\s*\n\s*/g, ' ⏎ ').replace(/\|/g, '\\|');
  return charCount(one) > n ? `${[...one].slice(0, n).join('')}…` : one;
};

export function renderTable(meta, { limits, sources = [] }) {
  const lines = [
    `Locale ${meta.locale}${meta.country ? ` (storefront ${meta.country.toUpperCase()})` : ''}. Lengths are exact counts in the unit the store uses.`,
    '',
    '| Platform | Field | Current | Proposed | Proposed length | Current from |',
    '|---|---|---|---|---|---|',
  ];
  for (const platform of ['ios', 'android']) {
    const pf = meta[platform];
    if (!pf) continue;
    for (const field of FIELDS[platform]) {
      const e = pf[field];
      if (!e) continue;
      const limit = limits.limits[`${platform}.${field}`];
      const shown = e.proposed ?? e.current;
      const len = shown === null || shown === undefined ? '' : `${measure(shown, limit?.unit)}/${limit?.max ?? '?'} ${limit?.unit ?? ''}${limit && !limit.confirmed ? ' (limit unconfirmed)' : ''}`;
      const cur = resolveCurrent(platform, field, sources);
      const from = cur ? `${cur.file} (${(cur.provenance?.retrievedAt || cur.provenance?.recordedAt || '').slice(0, 10)})` : 'not public / unknown';
      const proposed = e.proposed === null || e.proposed === undefined ? 'no change' : clip(e.proposed);
      const current = e.current === null || e.current === undefined ? '—' : clip(e.current);
      lines.push(`| ${platform === 'ios' ? 'App Store' : 'Google Play'} | ${field} | ${current} | ${proposed} | ${len} | ${from} |`);
    }
  }
  return lines.join('\n') + '\n';
}

export function renderReport(file, result, { limits, now = Date.now() }) {
  const fails = result.findings.filter((f) => f.level === 'fail');
  const warns = result.findings.filter((f) => f.level === 'warn');
  const out = [
    `# limits-check: ${file}`,
    '',
    `Result: ${result.pass ? 'PASS' : 'FAIL'} (${fails.length} failures, ${warns.length} warnings). Checked ${isoNow(now)} against limits.json (sources read ${limits.checkedAt}).`,
    '',
  ];
  const list = (title, items) => {
    if (!items.length) return;
    out.push(`## ${title}`, '');
    for (const f of items) out.push(`- [${f.where}] ${f.message}${f.source ? ` (${f.source})` : ''}`);
    out.push('');
  };
  list('Failures', fails);
  list('Warnings', warns);
  if (result.unconfirmed.length) {
    out.push('## Unconfirmed limits used', '', ...result.unconfirmed.map((u) => `- ${u}: not found on an official page when limits.json was written; label it unconfirmed.`), '');
  }
  return out.join('\n');
}

export function embed(reportText, locale, table) {
  const open = `<!-- current-proposed:${locale} -->`;
  const close = `<!-- /current-proposed:${locale} -->`;
  const block = `${open}\n${table}${close}`;
  const i = reportText.indexOf(open);
  const j = reportText.indexOf(close);
  if (i !== -1 && j > i) return reportText.slice(0, i) + block + reportText.slice(j + close.length);
  return `${reportText.trimEnd()}\n\n${block}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const limits = readJson(args.limits || LIMITS_FILE);

  if (args.field) {
    const limit = limits.limits[args.field];
    if (!limit) { process.stderr.write(`Unknown field ${args.field}\n`); process.exit(2); }
    const text = String(args.text ?? '');
    const n = measure(text, limit.unit);
    const ok = (limit.max === undefined || n <= limit.max) && (limit.min === undefined || n >= limit.min);
    process.stdout.write(`${args.field}: ${n}/${limit.max} ${limit.unit} — ${ok ? 'fits' : 'TOO LONG'}${limit.confirmed ? '' : ' (limit unconfirmed)'} — "${text}"\n`);
    process.exit(ok ? 0 : 1);
  }

  const file = args._[0];
  if (!file) { process.stderr.write('usage: limits-check.mjs <metadata.json> [--out f] [--embed report.md] [--table] [--brands file]\n'); process.exit(2); }
  const meta = readJson(file);
  const baseDir = path.resolve(args.root || '.');
  const sources = loadSources(meta, baseDir);
  const brands = args.brands ? fs.readFileSync(args.brands, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : [];
  const result = checkMetadata(meta, { limits, sources, brands });
  for (const s of sources.filter((x) => x.missing)) result.findings.push({ level: 'fail', where: 'currentSources', message: `Listed source ${s.file} does not exist.` });
  result.pass = !result.findings.some((f) => f.level === 'fail');

  const out = args.out || file.replace(/\.json$/, '.check.md');
  writeText(out, renderReport(file, result, { limits }));
  const table = renderTable(meta, { limits, sources });
  if (args.table) process.stdout.write(table);
  if (args.embed) {
    if (!result.pass) {
      process.stderr.write(`Not embedding: ${file} fails limits-check (see ${out}).\n`);
    } else {
      const reportFile = args.embed;
      const text = fs.existsSync(reportFile) ? fs.readFileSync(reportFile, 'utf8') : '';
      writeText(reportFile, embed(text, meta.locale, table));
    }
  }
  const fails = result.findings.filter((f) => f.level === 'fail').length;
  const warns = result.findings.length - fails;
  process.stdout.write(`${result.pass ? 'PASS' : 'FAIL'} ${file}: ${fails} failures, ${warns} warnings → ${out}\n`);
  process.exit(result.pass ? 0 : 1);
}

if (isMain(import.meta.url)) main();
