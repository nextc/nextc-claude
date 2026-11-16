#!/usr/bin/env node
// App Store observations from Apple's public iTunes Search and Lookup API.
// Every result carries its provenance: endpoint, exact request URL, country, retrieval time.
//
//   listing <id|bundleId> --country us            live listing → aso/data/listing-ios-<country>.json
//   search "<term>" --country us [--limit 10]     ranked results (JSON on stdout)
//   rank <id|bundleId> "<term>" --country us [--depth 50]
//   observe --terms "a,b" | --terms-file f --country us [--app <id>] [--depth 50]
//                                                 → aso/data/observations-ios-<country>.json
//   keywords-csv [--out aso/keywords.csv]         builds the keyword table from observations files
//   collide "<brand>"... --country us[,gb] [--limit 10]
//                                                 brand collision table → aso/data/collisions-<date>.json
//   manual --platform ios|android --locale en-US [--country us] --in <file.json>
//                                                 records user-provided current metadata with a timestamp
//
// Common flags: --data-dir aso/data  --no-cache  --ttl-hours 24
import fs from 'node:fs';
import path from 'node:path';
import {
  parseArgs, readJson, writeJson, writeText, cachedGet, defaultFetcher, isoNow, words, normalizeText,
  toCsv, isMain, die,
} from './lib/common.mjs';

export const SEARCH_URL = 'https://itunes.apple.com/search';
export const LOOKUP_URL = 'https://itunes.apple.com/lookup';
// EXTERNAL: Apple documents "approximately 20 calls per minute (subject to change)" for this API
// (performance-partners.apple.com/search-api). 3.1 s between calls keeps every worker together under it.
export const MIN_GAP_MS = 3100;
// MAGIC: Apple's own responses carry cache-control max-age=86400, so a day-old answer is what a
// fresh request would often get from Apple's CDN anyway.
export const DEFAULT_TTL_HOURS = 24;
export const TOP_N = 10;

// MAGIC: tier cut-offs are heuristics, not Apple data. 5 of 10 titles containing the term means the
// term is a category label incumbents already own; 10,000 ratings is roughly where a listing has
// years of accumulated reviews. Change them here only, and say so in the report.
export const TIER_RULES = {
  contestedTitleMatches: 5,
  contestedMedianRatings: 10_000,
  openTitleMatches: 2,
  openMedianRatings: 1_000,
};

export function searchUrl(term, { country = 'us', limit = TOP_N } = {}) {
  const q = new URLSearchParams({ term, country: country.toLowerCase(), entity: 'software', limit: String(limit) });
  return `${SEARCH_URL}?${q}`;
}

export function lookupUrl(idOrBundle, { country = 'us' } = {}) {
  const key = /^\d+$/.test(String(idOrBundle)) ? 'id' : 'bundleId';
  const q = new URLSearchParams({ [key]: String(idOrBundle), country: country.toLowerCase() });
  return `${LOOKUP_URL}?${q}`;
}

export function normalizeApp(r) {
  return {
    trackId: r.trackId,
    bundleId: r.bundleId,
    name: r.trackName,
    seller: r.sellerName,
    developer: r.artistName,
    url: r.trackViewUrl,
    primaryGenre: r.primaryGenreName,
    genres: r.genres || [],
    rating: r.averageUserRating ?? null,
    ratingCount: r.userRatingCount ?? 0,
    ratingCurrentVersion: r.averageUserRatingForCurrentVersion ?? null,
    ratingCountCurrentVersion: r.userRatingCountForCurrentVersion ?? null,
    version: r.version,
    currentVersionReleaseDate: r.currentVersionReleaseDate,
    releaseDate: r.releaseDate,
    releaseNotes: r.releaseNotes ?? null,
    description: r.description ?? '',
    price: r.price ?? null,
    formattedPrice: r.formattedPrice ?? null,
    currency: r.currency ?? null,
    contentRating: r.trackContentRating ?? r.contentAdvisoryRating ?? null,
    minimumOsVersion: r.minimumOsVersion ?? null,
    languages: r.languageCodesISO2A || [],
    screenshotUrls: r.screenshotUrls || [],
    ipadScreenshotUrls: r.ipadScreenshotUrls || [],
    screenshotCount: (r.screenshotUrls || []).length,
    ipadScreenshotCount: (r.ipadScreenshotUrls || []).length,
  };
}

function provenance(endpoint, url, country, hit) {
  return { source: 'itunes-search-api', endpoint, request: url, country: country.toLowerCase(), retrievedAt: hit.retrievedAt, fromCache: hit.fromCache };
}

function ctxFrom(opts = {}) {
  const dataDir = opts.dataDir || path.resolve('aso/data');
  return {
    dataDir,
    cacheDir: path.join(dataDir, 'cache'),
    fetcher: opts.fetcher || defaultFetcher,
    now: opts.now || (() => Date.now()),
    ttlMs: (opts.ttlHours ?? DEFAULT_TTL_HOURS) * 3_600_000,
    paceMs: opts.paceMs ?? MIN_GAP_MS,
    noCache: Boolean(opts.noCache),
  };
}

export async function lookup(idOrBundle, { country = 'us', ...opts } = {}) {
  const ctx = ctxFrom(opts);
  const url = lookupUrl(idOrBundle, { country });
  const hit = await cachedGet(url, ctx);
  const r = (hit.body.results || []).find((x) => x.wrapperType === 'software' || x.kind === 'software') || (hit.body.results || [])[0];
  return { provenance: provenance('lookup', url, country, hit), app: r ? normalizeApp(r) : null };
}

export async function search(term, { country = 'us', limit = TOP_N, ...opts } = {}) {
  const ctx = ctxFrom(opts);
  const url = searchUrl(term, { country, limit });
  const hit = await cachedGet(url, ctx);
  const results = (hit.body.results || []).map((r, i) => ({ rank: i + 1, ...normalizeApp(r) }));
  return { provenance: provenance('search', url, country, hit), term, results };
}

export function matchesApp(app, idOrBundle) {
  const k = String(idOrBundle);
  return String(app.trackId) === k || app.bundleId === k;
}

export function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export function titleMatch(term, name) {
  const tw = words(term);
  const nw = new Set(words(name));
  return { allWords: tw.length > 0 && tw.every((w) => nw.has(w)), phrase: normalizeText(name).includes(normalizeText(term)) };
}

export function tierFor(stats) {
  if (stats.resultsReturned < TOP_N) return 'thin';
  const { top10TitleMatches: m, top10MedianRatings: med } = stats;
  if (m >= TIER_RULES.contestedTitleMatches || med >= TIER_RULES.contestedMedianRatings) return 'contested';
  if (m <= TIER_RULES.openTitleMatches && med < TIER_RULES.openMedianRatings) return 'open';
  return 'mixed';
}

export function observeFromSearch(res, { appId = null, depth } = {}) {
  const top = res.results.slice(0, TOP_N);
  const counts = top.map((a) => a.ratingCount || 0);
  const rankHit = appId ? res.results.find((a) => matchesApp(a, appId)) : null;
  const stats = {
    resultsReturned: res.results.length,
    top10TitleMatches: top.filter((a) => titleMatch(res.term, a.name).allWords).length,
    top10TitlePhrase: top.filter((a) => titleMatch(res.term, a.name).phrase).length,
    top10MedianRatings: median(counts),
    top10MaxRatings: counts.length ? Math.max(...counts) : null,
    appRank: appId ? (rankHit ? rankHit.rank : null) : undefined,
    rankDepth: depth,
  };
  stats.observedCompetition = tierFor(stats);
  return {
    provenance: res.provenance,
    stats,
    top10: top.map((a) => ({ rank: a.rank, trackId: a.trackId, name: a.name, seller: a.seller, ratingCount: a.ratingCount, rating: a.rating, titleMatch: titleMatch(res.term, a.name).allWords })),
  };
}

export async function observe(terms, { country = 'us', appId = null, depth = 50, ...opts } = {}) {
  const ctx = ctxFrom(opts);
  const file = path.join(ctx.dataDir, `observations-ios-${country.toLowerCase()}.json`);
  const existing = fs.existsSync(file) ? readJson(file) : { kind: 'observations', platform: 'ios', country: country.toLowerCase(), terms: {} };
  existing.appId = appId ?? existing.appId ?? null;
  existing.depth = depth;
  const failures = [];
  for (const raw of terms) {
    const term = raw.trim();
    if (!term) continue;
    try {
      const res = await search(term, { country, limit: Math.max(depth, TOP_N), ...opts });
      existing.terms[term] = observeFromSearch(res, { appId, depth });
    } catch (e) {
      failures.push({ term, error: e.message });
    }
  }
  existing.updatedAt = isoNow(ctx.now());
  writeJson(file, existing);
  return { file, observed: Object.keys(existing.terms).length, failures };
}

export const KEYWORD_COLUMNS = [
  'platform', 'country', 'term', 'observed_competition', 'top10_title_matches', 'top10_median_ratings',
  'top10_max_ratings', 'results_returned', 'app_rank', 'top3', 'search_volume', 'volume_source',
  'relevance', 'placement', 'note', 'retrieved_at', 'source_file',
];

// term-notes.json: { "<country>": { "<term>": { relevance, placement, note, volume, volume_source } } }
// term-notes-<cc>.json (written by observers): { "<term>": { relevance, note } }
export function keywordRows(dataDir) {
  const files = fs.readdirSync(dataDir).filter((f) => /^observations-(ios|android)-[a-z]{2}\.json$/.test(f)).sort();
  const notesFile = path.join(dataDir, 'term-notes.json');
  const notes = fs.existsSync(notesFile) ? readJson(notesFile) : {};
  const rows = [];
  for (const f of files) {
    const obs = readJson(path.join(dataDir, f));
    for (const [term, o] of Object.entries(obs.terms || {})) {
      const perCountryFile = path.join(dataDir, `term-notes-${obs.country}.json`);
      const perCountry = fs.existsSync(perCountryFile) ? readJson(perCountryFile) : {};
      // ORDER: the main session's term-notes.json wins over an observer's per-country proposal.
      const n = { ...(perCountry[term] || {}), ...((notes[obs.country] || {})[term] || {}) };
      const s = o.stats;
      rows.push({
        platform: obs.platform,
        country: obs.country,
        term,
        observed_competition: s.observedCompetition,
        top10_title_matches: s.top10TitleMatches,
        top10_median_ratings: s.top10MedianRatings,
        top10_max_ratings: s.top10MaxRatings,
        results_returned: s.resultsReturned,
        app_rank: s.appRank === undefined ? 'no app' : s.appRank === null ? `not in top ${s.rankDepth}` : s.appRank,
        top3: (o.top10 || []).slice(0, 3).map((a) => a.name).join(' | '),
        search_volume: n.volume ?? 'unavailable',
        volume_source: n.volume_source ?? '',
        relevance: n.relevance ?? '',
        placement: n.placement ?? '',
        note: n.note ?? '',
        retrieved_at: o.provenance?.retrievedAt ?? '',
        source_file: path.posix.join('aso/data', f),
      });
    }
  }
  return rows;
}

export function leadingBrand(name) {
  return normalizeText(String(name).split(/\s[-–—:|·]\s|[:|·–—]/)[0]).trim();
}

export function editDistance(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[m][n];
}

export function collisionVerdict(brand, appName) {
  const b = normalizeText(brand).replace(/[^\p{L}\p{N}]/gu, '');
  const lead = leadingBrand(appName).replace(/[^\p{L}\p{N}]/gu, '');
  if (!b) return 'clear';
  if (lead === b) return 'exact';
  // MAGIC: two edits catches "Nestlr"/"Nestly" and "Calmly"/"Calm" without flagging unrelated short words.
  if (editDistance(lead, b) <= 2 && Math.min(lead.length, b.length) >= 3) return 'near';
  if (lead.includes(b) || words(appName).includes(normalizeText(brand))) return 'contains';
  return 'clear';
}

export async function collide(brands, { countries = ['us'], limit = TOP_N, ...opts } = {}) {
  const rows = [];
  for (const country of countries) {
    for (const brand of brands) {
      const res = await search(brand, { country, limit, ...opts });
      const hits = res.results.map((a) => ({ rank: a.rank, name: a.name, seller: a.seller, ratingCount: a.ratingCount, verdict: collisionVerdict(brand, a.name) }));
      const worst = hits.find((h) => h.verdict === 'exact') || hits.find((h) => h.verdict === 'near') || hits.find((h) => h.verdict === 'contains');
      rows.push({ brand, country, verdict: worst ? worst.verdict : 'clear', closest: worst || null, hits, provenance: res.provenance });
    }
  }
  return rows;
}

export function collisionTable(rows) {
  const lines = ['| Brand | Country | Verdict | Closest match (rank, ratings) | Retrieved (UTC) |', '|---|---|---|---|---|'];
  for (const r of rows) {
    const c = r.closest ? `${r.closest.name} (#${r.closest.rank}, ${r.closest.ratingCount} ratings)` : 'none in top results';
    lines.push(`| ${r.brand} | ${r.country.toUpperCase()} | ${r.verdict} | ${c} | ${r.provenance.retrievedAt} |`);
  }
  return lines.join('\n') + '\n';
}

export function listingRecord(res, country) {
  const a = res.app;
  return {
    kind: 'listing',
    platform: 'ios',
    country: country.toLowerCase(),
    locale: null,
    provenance: res.provenance,
    // EXTERNAL: the public API exposes the app name and description but not the subtitle, the
    // keyword field or promotional text. Those come from App Store Connect or from the user.
    fields: { name: a.name, description: a.description, whatsNew: a.releaseNotes },
    notPublic: ['subtitle', 'keywords', 'promotionalText'],
    app: a,
  };
}

export function manualRecord(input, { platform, locale, country = null, now = () => Date.now() }) {
  if (!['ios', 'android'].includes(platform)) throw new Error('--platform must be ios or android');
  if (!input.fields || typeof input.fields !== 'object') throw new Error('input needs a "fields" object');
  return {
    kind: 'listing',
    platform,
    country: country ? country.toLowerCase() : null,
    locale,
    provenance: { source: 'user-provided', recordedAt: isoNow(now()), note: input.note || '' },
    fields: input.fields,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [cmd, ...pos] = args._;
  const opts = {
    dataDir: path.resolve(args['data-dir'] || 'aso/data'),
    noCache: Boolean(args['no-cache']),
    ttlHours: args['ttl-hours'] ? Number(args['ttl-hours']) : undefined,
  };
  const country = String(args.country || 'us');
  const print = (x) => process.stdout.write(JSON.stringify(x, null, 2) + '\n');

  switch (cmd) {
    case 'listing': {
      if (!pos[0]) die('usage: listing <id|bundleId> --country us');
      const res = await lookup(pos[0], { country, ...opts });
      if (!res.app) die(`Not found in the ${country.toUpperCase()} storefront: ${pos[0]} (request: ${res.provenance.request})`, 3);
      const out = args.out || path.join(opts.dataDir, `listing-ios-${country.toLowerCase()}.json`);
      writeJson(out, listingRecord(res, country));
      const a = res.app;
      print({ file: out, provenance: res.provenance, name: a.name, seller: a.seller, rating: a.rating, ratingCount: a.ratingCount, version: a.version, screenshots: a.screenshotCount, descriptionChars: [...a.description].length });
      break;
    }
    case 'search': {
      if (!pos[0]) die('usage: search "<term>" --country us [--limit 10]');
      const res = await search(pos[0], { country, limit: Number(args.limit || TOP_N), ...opts });
      print({ provenance: res.provenance, term: res.term, results: res.results.map(({ description, screenshotUrls, ipadScreenshotUrls, releaseNotes, languages, ...rest }) => rest) });
      break;
    }
    case 'rank': {
      if (pos.length < 2) die('usage: rank <id|bundleId> "<term>" --country us [--depth 50]');
      const depth = Number(args.depth || 50);
      const res = await search(pos[1], { country, limit: depth, ...opts });
      const hit = res.results.find((a) => matchesApp(a, pos[0]));
      print({ provenance: res.provenance, term: pos[1], app: pos[0], rank: hit ? hit.rank : `not in top ${depth}`, note: 'Position in iTunes Search API results; the App Store app can order results differently by device and user.' });
      break;
    }
    case 'observe': {
      let terms = [];
      if (args.terms) terms = String(args.terms).split(',');
      if (args['terms-file']) terms = terms.concat(fs.readFileSync(args['terms-file'], 'utf8').split(/\r?\n/));
      terms = [...new Set(terms.map((t) => t.trim()).filter((t) => t && !t.startsWith('#')))];
      if (!terms.length) die('usage: observe --terms "a,b" | --terms-file f --country us [--app <id>]');
      const r = await observe(terms, { country, appId: args.app || null, depth: Number(args.depth || 50), ...opts });
      print(r);
      if (r.failures.length) process.exitCode = 2;
      break;
    }
    case 'keywords-csv': {
      const rows = keywordRows(opts.dataDir);
      const out = args.out || path.resolve('aso/keywords.csv');
      writeText(out, toCsv(rows, KEYWORD_COLUMNS));
      print({ file: out, rows: rows.length });
      break;
    }
    case 'collide': {
      if (!pos.length) die('usage: collide "<brand>" ["<brand>"...] --country us[,gb]');
      const countries = country.split(',').map((c) => c.trim()).filter(Boolean);
      const rows = await collide(pos, { countries, limit: Number(args.limit || TOP_N), ...opts });
      const stamp = isoNow().slice(0, 10);
      const out = args.out || path.join(opts.dataDir, `collisions-${stamp}.json`);
      writeJson(out, { kind: 'collisions', createdAt: isoNow(), rows });
      process.stdout.write(`Saved: ${out}\n\n${collisionTable(rows)}`);
      break;
    }
    case 'manual': {
      if (!args.in || !args.platform || !args.locale) die('usage: manual --platform ios|android --locale en-US [--country us] --in <file.json>');
      const rec = manualRecord(readJson(args.in), { platform: args.platform, locale: args.locale, country: args.country || null });
      const out = args.out || path.join(opts.dataDir, `listing-${args.platform}-${args.locale}-user.json`);
      writeJson(out, rec);
      print({ file: out, provenance: rec.provenance, fields: Object.keys(rec.fields) });
      break;
    }
    default:
      die('commands: listing | search | rank | observe | keywords-csv | collide | manual');
  }
}

if (isMain(import.meta.url)) {
  main().catch((e) => die(`store-lookup: ${e.message}`));
}
