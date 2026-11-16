// Tests for nextc-aso/scripts/store-lookup.mjs using recorded iTunes Search API responses (no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  search, lookup, observe, observeFromSearch, tierFor, keywordRows, collisionVerdict, leadingBrand,
  listingRecord, manualRecord, searchUrl, lookupUrl,
} from '../nextc-aso/scripts/store-lookup.mjs';
import { pace, cachedGet } from '../nextc-aso/scripts/lib/common.mjs';

const FIX = fileURLToPath(new URL('../nextc-aso/scripts/__fixtures__/', import.meta.url));
const fixture = (f) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'aso-sl-'));
const FIXED = Date.parse('2026-11-16T02:00:00.000Z');

function fakeFetcher(map) {
  const calls = [];
  const fetcher = async (url) => {
    calls.push(url);
    for (const [needle, body] of Object.entries(map)) if (url.includes(needle)) return { status: 200, body };
    return { status: 404, body: '' };
  };
  return { fetcher, calls };
}

const opts = (dataDir, fetcher) => ({ dataDir, fetcher, paceMs: 0, now: () => FIXED });

test('request URLs use entity=software, the country, the limit, and id vs bundleId', () => {
  assert.equal(searchUrl('habit tracker', { country: 'GB', limit: 10 }), 'https://itunes.apple.com/search?term=habit+tracker&country=gb&entity=software&limit=10');
  assert.equal(lookupUrl('1044867788', { country: 'us' }), 'https://itunes.apple.com/lookup?id=1044867788&country=us');
  assert.equal(lookupUrl('com.bloombuilt.dayone-ios'), 'https://itunes.apple.com/lookup?bundleId=com.bloombuilt.dayone-ios&country=us');
});

test('search parses the recorded response into ranked apps with provenance', async () => {
  const { fetcher } = fakeFetcher({ 'term=habit+tracker': fixture('search-habit-tracker-us.json') });
  const res = await search('habit tracker', { country: 'us', ...opts(tmp(), fetcher) });
  assert.equal(res.provenance.source, 'itunes-search-api');
  assert.equal(res.provenance.country, 'us');
  assert.equal(res.provenance.retrievedAt, '2026-11-16T02:00:00.000Z');
  assert.match(res.provenance.request, /term=habit\+tracker/);
  assert.equal(res.results[0].rank, 1);
  assert.equal(res.results[0].name, 'Habit Tracker');
  assert.equal(typeof res.results[0].ratingCount, 'number');
  assert.ok(!('subtitle' in res.results[0]), 'the public API has no subtitle field');
});

test('lookup returns the live listing; an unknown bundle id returns null', async () => {
  const { fetcher } = fakeFetcher({ 'id=1044867788': fixture('lookup-1044867788-us.json'), 'bundleId=': fixture('lookup-empty-us.json') });
  const dir = tmp();
  const res = await lookup('1044867788', { country: 'us', ...opts(dir, fetcher) });
  assert.equal(res.app.name, 'Day One: Daily Journal & Diary');
  const rec = listingRecord(res, 'us');
  assert.deepEqual(rec.notPublic, ['subtitle', 'keywords', 'promotionalText']);
  assert.equal(rec.fields.name, res.app.name);
  const none = await lookup('com.example.nothing', { country: 'us', ...opts(dir, fetcher) });
  assert.equal(none.app, null);
});

test('cache: a second identical request is served from disk', async () => {
  const { fetcher, calls } = fakeFetcher({ 'term=habit+tracker': fixture('search-habit-tracker-us.json') });
  const dir = tmp();
  const a = await search('habit tracker', { country: 'us', ...opts(dir, fetcher) });
  const b = await search('habit tracker', { country: 'us', ...opts(dir, fetcher) });
  assert.equal(calls.length, 1);
  assert.equal(a.provenance.fromCache, false);
  assert.equal(b.provenance.fromCache, true);
  assert.equal(b.provenance.retrievedAt, a.provenance.retrievedAt, 'cached answers keep their original retrieval time');
});

test('cache: non-200 responses throw and are not cached', async () => {
  const dir = tmp();
  await assert.rejects(cachedGet('https://itunes.apple.com/search?x', { cacheDir: dir, ttlMs: 1e9, fetcher: async () => ({ status: 400, body: '' }) }), /HTTP 400/);
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith('.json')), []);
});

test('pace waits for the remaining gap after the previous call', async () => {
  const dir = tmp();
  let t = 1_000_000;
  const waits = [];
  const clock = { now: () => t, wait: async (ms) => { waits.push(ms); t += ms; } };
  await pace(dir, 3100, clock);
  t += 1000;
  await pace(dir, 3100, clock);
  assert.deepEqual(waits, [2100]);
});

test('observe: top-10 stats, app rank, and tier come from observations', async () => {
  const body = fixture('search-habit-tracker-us.json');
  const { fetcher } = fakeFetcher({ 'term=habit+tracker': body });
  const dir = tmp();
  const r = await observe(['habit tracker'], { country: 'us', appId: '1528595748', ...opts(dir, fetcher) });
  assert.equal(r.failures.length, 0);
  const obs = JSON.parse(fs.readFileSync(r.file, 'utf8'));
  const o = obs.terms['habit tracker'];
  assert.equal(o.stats.resultsReturned, body.results.length);
  assert.equal(o.stats.appRank, 3);
  assert.equal(o.stats.observedCompetition, 'thin', 'fewer than 10 results is reported as thin, not as low competition');
  assert.equal(o.provenance.retrievedAt, '2026-11-16T02:00:00.000Z');
});

test('tiers follow the documented rules', () => {
  const s = (m, med, n = 50) => ({ resultsReturned: n, top10TitleMatches: m, top10MedianRatings: med });
  assert.equal(tierFor(s(6, 50)), 'contested');
  assert.equal(tierFor(s(1, 20_000)), 'contested');
  assert.equal(tierFor(s(2, 900)), 'open');
  assert.equal(tierFor(s(3, 900)), 'mixed');
  assert.equal(tierFor(s(0, 0, 4)), 'thin');
});

test('rank is "not in top N" when the app is absent', () => {
  const res = { term: 'diary', provenance: {}, results: [{ rank: 1, trackId: 1, name: 'Diary', ratingCount: 10 }] };
  const o = observeFromSearch(res, { appId: '999', depth: 50 });
  assert.equal(o.stats.appRank, null);
  assert.equal(o.stats.top10TitleMatches, 1);
});

test('keywords.csv rows carry observed columns, "unavailable" volume and the source file', async () => {
  const { fetcher } = fakeFetcher({ 'term=habit+tracker': fixture('search-habit-tracker-us.json') });
  const dir = tmp();
  await observe(['habit tracker'], { country: 'us', appId: '1', ...opts(dir, fetcher) });
  fs.writeFileSync(path.join(dir, 'term-notes.json'), JSON.stringify({ us: { 'habit tracker': { relevance: 'core', placement: 'subtitle' } } }));
  const [row] = keywordRows(dir);
  assert.equal(row.search_volume, 'unavailable');
  assert.equal(row.app_rank, 'not in top 50');
  assert.equal(row.placement, 'subtitle');
  assert.equal(row.source_file, 'aso/data/observations-ios-us.json');
  assert.match(row.retrieved_at, /^2026-11-16T/);
});

test('collision verdicts: exact, near, contains, clear', () => {
  assert.equal(leadingBrand('Day One: Daily Journal & Diary'), 'day one');
  assert.equal(collisionVerdict('Dayone', 'Day One: Daily Journal & Diary'), 'exact');
  assert.equal(collisionVerdict('Lumora', 'Lumera - Diary, Journal'), 'near');
  assert.equal(collisionVerdict('Nestly', 'Nestly Garden Planner'), 'contains');
  assert.equal(collisionVerdict('Habitday', 'Habitica: Gamified Taskmanager'), 'clear');
});

test('manual records are stamped with a recorded time and user-provided source', () => {
  const rec = manualRecord({ fields: { subtitle: 'E2E Encrypted, Anon Journal' } }, { platform: 'ios', locale: 'en-US', country: 'US', now: () => FIXED });
  assert.equal(rec.provenance.source, 'user-provided');
  assert.equal(rec.provenance.recordedAt, '2026-11-16T02:00:00.000Z');
  assert.equal(rec.country, 'us');
  assert.throws(() => manualRecord({}, { platform: 'ios', locale: 'en-US' }), /fields/);
});
