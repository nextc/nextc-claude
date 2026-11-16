#!/usr/bin/env node
// Confirms Flutter/Dart packages exist on pub.dev, are not discontinued, and are maintained.
// Usage: node pub-check.mjs <pkg>... [--file list.json] [--state <project>] [--stale-months 18] [--strict] [--json]
// Exit: 0 all usable, 1 a package is missing/discontinued (or unmaintained with --strict), 2 network/usage error.
import { readFileSync } from 'node:fs';
import { fetchJson, parseArgs, isMain } from './lib/util.mjs';

export const SDK_PACKAGES = new Set([
  'flutter', 'flutter_test', 'flutter_localizations', 'flutter_driver', 'integration_test', 'flutter_web_plugins',
]);
const MONTH_MS = 30.44 * 24 * 3600 * 1000;
const HINTS = {
  freezed_generator: 'there is no such package; the Freezed generator ships inside `freezed` (add `freezed` as a dev dependency)',
};

export async function checkPackage(name, { fetchJson: get = fetchJson, now = Date.now(), staleMonths = 18 } = {}) {
  const base = { name, status: 'error', latest: null, published: null, ageMonths: null, flags: [], replacedBy: null, message: '' };
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    return { ...base, message: `"${name}" is not a valid pub.dev package name` };
  }
  let res;
  try {
    res = await get(`https://pub.dev/api/packages/${name}`);
  } catch (e) {
    return { ...base, message: `network error reaching pub.dev: ${e.message}` };
  }
  if (res.status === 404) {
    return { ...base, status: 'missing', message: HINTS[name] || `"${name}" does not exist on pub.dev (check the spelling, or whether the feature ships inside another package)` };
  }
  if (res.status !== 200 || !res.json || !res.json.latest) {
    return { ...base, message: `pub.dev answered HTTP ${res.status} without package data` };
  }
  const { latest, isDiscontinued, replacedBy } = res.json;
  const published = latest.published || null;
  const ageMonths = published ? Math.round(((now - Date.parse(published)) / MONTH_MS) * 10) / 10 : null;
  const out = { ...base, status: 'ok', latest: latest.version, published, ageMonths, replacedBy: replacedBy || null };
  if (isDiscontinued) {
    return { ...out, status: 'discontinued', message: `"${name}" is discontinued${replacedBy ? `; pub.dev suggests "${replacedBy}"` : ''}` };
  }
  if (ageMonths !== null && ageMonths > staleMonths) {
    out.flags.push('unmaintained');
    out.message = `latest release ${latest.version} is ${ageMonths} months old (limit ${staleMonths})`;
  }
  return out;
}

export async function checkPackages(names, opts = {}) {
  const unique = [...new Set(names)].filter((n) => !SDK_PACKAGES.has(n));
  const results = [];
  for (const n of unique) results.push(await checkPackage(n, opts));
  const strict = !!opts.strict;
  const errors = results.filter((r) => ['missing', 'discontinued'].includes(r.status) || (strict && r.flags.includes('unmaintained')));
  const failures = results.filter((r) => r.status === 'error');
  return { results, ok: errors.length === 0 && failures.length === 0, errors, failures };
}

function format(r) {
  if (r.status === 'ok') {
    const w = r.flags.includes('unmaintained') ? `  WARNING unmaintained: ${r.message}` : '';
    return `OK ${r.name} ${r.latest} (published ${String(r.published).slice(0, 10)}, ${r.ageMonths} months ago)${w}`;
  }
  return `${r.status.toUpperCase()} ${r.name}: ${r.message}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2), { flags: ['strict', 'json'] });
  let names = [...args._];
  if (args.state) {
    const st = JSON.parse(readFileSync(`${args.state}/.kickoff/state.json`, 'utf8'));
    names.push(...(st.dependencies || []).map((d) => d.name));
  }
  if (args.file) {
    const data = JSON.parse(readFileSync(args.file, 'utf8'));
    names.push(...(Array.isArray(data) ? data : [...(data.dependencies || []), ...(data.dev_dependencies || [])]));
  }
  if (!names.length) {
    console.error('usage: pub-check.mjs <pkg>... [--file list.json] [--state <project>] [--stale-months N] [--strict] [--json]');
    process.exit(2);
  }
  const r = await checkPackages(names, { staleMonths: args['stale-months'] ? +args['stale-months'] : 18, strict: !!args.strict });
  if (args.json) console.log(JSON.stringify(r, null, 2));
  else r.results.forEach((x) => console.log(format(x)));
  if (r.failures.length) process.exit(2);
  process.exit(r.ok ? 0 : 1);
}

if (isMain(import.meta.url)) main();
