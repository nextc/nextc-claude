#!/usr/bin/env node
// Google Play data. Google publishes no public search API, so this script covers only:
//  - your OWN listing and reviews through the official Google Play Developer API, with a
//    service-account key supplied at run time (file path or the NAME of an env var holding the JSON or its path);
//  - competitor / search observations the user exported from a third-party tool, imported as-is with a date.
//
//   play.mjs listing <package> (--key-file <sa.json> | --key-env <VAR>)   → aso/data/play-<language>.json
//   play.mjs reviews <package> (--key-file … | --key-env …)               → aso/data/play-reviews.json (last 7 days, with text)
//   play.mjs import-search --term "<term>" --country us --file export.csv --tool "<tool name>"
//        CSV columns: rank,title[,developer][,ratings] → aso/data/observations-android-<country>.json
//
// For a pasted current Play listing without API access use: store-lookup.mjs manual --platform android.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, readJson, writeJson, isoNow, defaultFetcher, loadSecret, redact, parseCsv, isMain, die } from './lib/common.mjs';
import { median, titleMatch, tierFor, TOP_N } from './store-lookup.mjs';

export const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
export const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

// EXTERNAL: Google's service-account flow (developers.google.com/identity/protocols/oauth2/service-account):
// RS256 assertion, aud = token endpoint, exp at most one hour after iat.
export function buildAssertion(sa, { now = () => Date.now(), lifetimeSec = 600 } = {}) {
  if (!sa.client_email || !sa.private_key) throw new Error('The key file is not a service-account JSON (client_email / private_key missing).');
  const iat = Math.floor(now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = { iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + lifetimeSec };
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const sig = crypto.sign('sha256', Buffer.from(input), sa.private_key);
  return `${input}.${b64url(sig)}`;
}

export async function accessToken(sa, { fetcher = defaultFetcher, now } = {}) {
  const body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: buildAssertion(sa, { now }) });
  const res = await fetcher(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString() });
  if (res.status !== 200 || !res.body?.access_token) throw new Error(`Token exchange failed with HTTP ${res.status}${res.body?.error ? ` (${res.body.error})` : ''}.`);
  return res.body.access_token;
}

function api(token, fetcher, requests) {
  return async (method, url) => {
    requests.push(`${method} ${url.replace(API, '')}`);
    // SECURITY: the token is only ever placed in this header; error messages never include it.
    const res = await fetcher(url, { method, headers: { authorization: `Bearer ${token}` } });
    if (res.status < 200 || res.status >= 300) {
      const msg = res.body?.error?.message ? ` (${res.body.error.message})` : '';
      throw new Error(redact(`Google Play API returned HTTP ${res.status} for ${method} ${url.replace(API, '')}${msg}`));
    }
    return res.body;
  };
}

export async function listing(pkg, { token, fetcher = defaultFetcher, now = () => Date.now() }) {
  const requests = [];
  const call = api(token, fetcher, requests);
  const edit = await call('POST', `${API}/${encodeURIComponent(pkg)}/edits`);
  try {
    const body = await call('GET', `${API}/${encodeURIComponent(pkg)}/edits/${edit.id}/listings`);
    const retrievedAt = isoNow(now());
    return (body.listings || []).map((l) => ({
      kind: 'listing',
      platform: 'android',
      locale: l.language,
      country: null,
      provenance: { source: 'google-play-developer-api', retrievedAt, package: pkg, requests: [...requests], note: 'Read through a temporary edit, which starts from the Play Console state and can include changes not yet published.' },
      fields: { title: l.title ?? null, shortDescription: l.shortDescription ?? null, fullDescription: l.fullDescription ?? null },
      video: l.video ?? null,
    }));
  } finally {
    // ORDER: always discard the temporary edit, or it lingers as an open draft in Play Console.
    await call('DELETE', `${API}/${encodeURIComponent(pkg)}/edits/${edit.id}`).catch(() => {});
  }
}

export async function reviews(pkg, { token, fetcher = defaultFetcher, now = () => Date.now(), max = 1000 }) {
  const requests = [];
  const call = api(token, fetcher, requests);
  const out = [];
  let next = `${API}/${encodeURIComponent(pkg)}/reviews?maxResults=100`;
  while (next && out.length < max) {
    const body = await call('GET', next);
    for (const r of body.reviews || []) {
      const u = (r.comments || []).find((c) => c.userComment)?.userComment || {};
      out.push({ id: r.reviewId, rating: u.starRating ?? null, text: u.text ?? '', language: u.reviewerLanguage ?? null, appVersion: u.appVersionName ?? null, lastModified: u.lastModified?.seconds ? new Date(Number(u.lastModified.seconds) * 1000).toISOString() : null });
    }
    const t = body.tokenPagination?.nextPageToken;
    next = t ? `${API}/${encodeURIComponent(pkg)}/reviews?maxResults=100&token=${encodeURIComponent(t)}` : null;
  }
  return {
    kind: 'reviews',
    platform: 'android',
    provenance: { source: 'google-play-developer-api', retrievedAt: isoNow(now()), package: pkg, requests, note: 'The API returns only production reviews that have text and were created or edited in the last 7 days.' },
    reviews: out,
  };
}

export function importSearch(csvText, { term, country, tool, file, now = () => Date.now() }) {
  const rows = parseCsv(csvText)
    .map((r) => ({ rank: Number(r.rank), name: r.title || r.name, seller: r.developer || null, ratingCount: r.ratings === undefined || r.ratings === '' ? null : Number(String(r.ratings).replace(/[, ]/g, '')) }))
    .filter((r) => r.rank && r.name)
    .sort((a, b) => a.rank - b.rank);
  const top = rows.slice(0, TOP_N);
  const counts = top.map((r) => r.ratingCount).filter((n) => Number.isFinite(n));
  const stats = {
    resultsReturned: rows.length,
    top10TitleMatches: top.filter((r) => titleMatch(term, r.name).allWords).length,
    top10TitlePhrase: top.filter((r) => titleMatch(term, r.name).phrase).length,
    top10MedianRatings: median(counts),
    top10MaxRatings: counts.length ? Math.max(...counts) : null,
    rankDepth: rows.length,
  };
  stats.observedCompetition = counts.length === top.length ? tierFor(stats) : 'unrated';
  return {
    provenance: { source: `user-export:${tool || 'unknown tool'}`, file, importedAt: isoNow(now()), country, retrievedAt: isoNow(now()), note: 'Imported from a file the user supplied; the export date is whatever the tool recorded.' },
    stats,
    top10: top.map((r) => ({ ...r, titleMatch: titleMatch(term, r.name).allWords })),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [cmd, pkg] = args._;
  const dataDir = path.resolve(args['data-dir'] || 'aso/data');
  if (cmd === 'import-search') {
    if (!args.term || !args.file) die('usage: play.mjs import-search --term "<term>" --country us --file export.csv --tool "<name>"', 2);
    const country = String(args.country || 'us').toLowerCase();
    const file = path.join(dataDir, `observations-android-${country}.json`);
    const obs = fs.existsSync(file) ? readJson(file) : { kind: 'observations', platform: 'android', country, terms: {} };
    obs.terms[args.term] = importSearch(fs.readFileSync(args.file, 'utf8'), { term: args.term, country, tool: args.tool, file: args.file });
    obs.updatedAt = isoNow();
    writeJson(file, obs);
    process.stdout.write(JSON.stringify({ file, term: args.term, stats: obs.terms[args.term].stats }, null, 2) + '\n');
    return;
  }
  if (!pkg || !['listing', 'reviews'].includes(cmd)) die('usage: play.mjs listing|reviews <package> (--key-file <sa.json> | --key-env <VAR>)', 2);
  const sa = JSON.parse(loadSecret({ keyFile: args['key-file'], keyEnv: args['key-env'] }));
  const token = await accessToken(sa);
  if (cmd === 'listing') {
    const recs = await listing(pkg, { token });
    const files = recs.map((r) => writeJson(path.join(dataDir, `play-${r.locale}.json`), r));
    process.stdout.write(JSON.stringify({ files, locales: recs.map((r) => r.locale) }, null, 2) + '\n');
  } else {
    const out = await reviews(pkg, { token, max: Number(args.max || 1000) });
    const file = writeJson(path.join(dataDir, 'play-reviews.json'), out);
    process.stdout.write(JSON.stringify({ file, count: out.reviews.length, note: out.provenance.note }, null, 2) + '\n');
  }
}

if (isMain(import.meta.url)) {
  main().catch((e) => die(`play: ${redact(e.message)}`));
}
