#!/usr/bin/env node
// Cross-file consistency check, run before the independent reviewer reads the outputs.
//
//   consistency.mjs [--root aso] [--out aso/data/consistency.md]
//
// Fails when: a metadata file has no passing limits-check newer than itself; the Current → Proposed
// table embedded in report.md is stale; report.md approximates a length with "~" or calls data
// ESTIMATED; keywords.csv says a term is placed in a field that the proposed metadata does not contain.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, readJson, writeText, parseCsv, words, isMain } from './lib/common.mjs';
import { LIMITS_FILE, loadSources, renderTable } from './limits-check.mjs';

const PLACED_FIELDS = { title: ['name', 'title'], name: ['name', 'title'], subtitle: ['subtitle'], keywords: ['keywords'], short_description: ['shortDescription'], shortDescription: ['shortDescription'] };

export function checkReportText(text) {
  const issues = [];
  const approx = text.match(/~\s?[\d,]+\s*(\/\s*[\d,]+|chars?\b|characters\b|bytes\b)/i);
  if (approx) issues.push({ level: 'fail', message: `report.md approximates a length ("${approx[0]}"); use the exact count from limits-check.` });
  for (const line of text.split('\n')) {
    if (/ESTIMATED/.test(line) && !/unavailable/i.test(line)) issues.push({ level: 'fail', message: `report.md labels data ESTIMATED: "${line.trim().slice(0, 100)}". Report observed data with its source, or say the figure is unavailable.` });
  }
  if (!/\b20\d\d-\d\d-\d\d\b/.test(text)) issues.push({ level: 'fail', message: 'report.md has no dated source (YYYY-MM-DD); every fact needs its retrieval date.' });
  return issues;
}

export function run(root, { limits = readJson(LIMITS_FILE), projectRoot = path.dirname(root) } = {}) {
  const issues = [];
  const metaDir = path.join(root, 'metadata');
  const metaFiles = fs.existsSync(metaDir) ? fs.readdirSync(metaDir).filter((f) => /^[^.]+\.json$/.test(f)).sort() : [];
  const reportFile = path.join(root, 'report.md');
  const report = fs.existsSync(reportFile) ? fs.readFileSync(reportFile, 'utf8') : null;
  if (report === null) issues.push({ level: 'fail', message: 'aso/report.md is missing.' });
  else issues.push(...checkReportText(report));

  const metas = [];
  for (const f of metaFiles) {
    const file = path.join(metaDir, f);
    const check = file.replace(/\.json$/, '.check.md');
    if (!fs.existsSync(check)) { issues.push({ level: 'fail', message: `${f}: no limits-check report; run limits-check.mjs on it.` }); continue; }
    if (fs.statSync(check).mtimeMs < fs.statSync(file).mtimeMs) issues.push({ level: 'fail', message: `${f} changed after its last limits-check; re-run it.` });
    if (!/^Result: PASS/m.test(fs.readFileSync(check, 'utf8'))) issues.push({ level: 'fail', message: `${f} does not pass limits-check.` });
    const meta = readJson(file);
    metas.push(meta);
    if (report !== null) {
      const open = `<!-- current-proposed:${meta.locale} -->`;
      const close = `<!-- /current-proposed:${meta.locale} -->`;
      const i = report.indexOf(open);
      const j = report.indexOf(close);
      if (i === -1 || j < i) issues.push({ level: 'fail', message: `report.md has no Current → Proposed table for ${meta.locale}; run limits-check.mjs ${path.relative(projectRoot, file)} --embed aso/report.md.` });
      else {
        const embedded = report.slice(i + open.length + 1, j);
        const fresh = renderTable(meta, { limits, sources: loadSources(meta, projectRoot) });
        if (embedded !== fresh) issues.push({ level: 'fail', message: `The ${meta.locale} table in report.md is stale; re-run limits-check with --embed.` });
      }
    }
  }

  const csvFile = path.join(root, 'keywords.csv');
  if (fs.existsSync(csvFile)) {
    const rows = parseCsv(fs.readFileSync(csvFile, 'utf8'));
    const observed = new Set(rows.map((r) => `${r.country}|${r.term.toLowerCase()}`));
    for (const r of rows) {
      const fields = PLACED_FIELDS[r.placement];
      if (!fields) continue;
      const platform = r.platform === 'android' ? 'android' : 'ios';
      const candidates = metas.filter((m) => !m.country || m.country === r.country);
      const hit = candidates.some((m) => fields.some((fld) => {
        const v = m[platform]?.[fld]?.proposed ?? m[platform]?.[fld]?.current ?? '';
        const have = new Set(words(v));
        return words(r.term).every((w) => have.has(w));
      }));
      if (candidates.length && !hit) issues.push({ level: 'fail', message: `keywords.csv places "${r.term}" (${r.country.toUpperCase()}) in ${r.placement}, but no proposed ${platform} metadata for that storefront contains it.` });
    }
    for (const m of metas) {
      const kw = m.ios?.keywords?.proposed;
      if (!kw) continue;
      for (const e of kw.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)) {
        if (m.country && !observed.has(`${m.country}|${e}`)) issues.push({ level: 'warn', message: `${m.locale}: keyword "${e}" has no observation in keywords.csv; its value is unsupported by store data.` });
      }
    }
  } else if (metas.length) {
    issues.push({ level: 'fail', message: 'aso/keywords.csv is missing; metadata must be backed by observed terms.' });
  }
  return { pass: !issues.some((i) => i.level === 'fail'), issues };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root || 'aso');
  const res = run(root);
  const out = args.out || path.join(root, 'data', 'consistency.md');
  const lines = [`# Consistency check`, '', `Result: ${res.pass ? 'PASS' : 'FAIL'}`, '', ...res.issues.map((i) => `- ${i.level.toUpperCase()}: ${i.message}`), ''];
  writeText(out, lines.join('\n'));
  process.stdout.write(`${res.pass ? 'PASS' : 'FAIL'} consistency: ${res.issues.filter((i) => i.level === 'fail').length} failures, ${res.issues.filter((i) => i.level === 'warn').length} warnings → ${out}\n`);
  process.exit(res.pass ? 0 : 1);
}

if (isMain(import.meta.url)) main();
