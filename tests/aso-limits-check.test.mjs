// Tests for nextc-aso/scripts/limits-check.mjs and consistency.mjs (no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkMetadata, renderTable, embed, measure, singular, LIMITS_FILE } from '../nextc-aso/scripts/limits-check.mjs';
import { checkReportText, run as consistency } from '../nextc-aso/scripts/consistency.mjs';

const limits = JSON.parse(fs.readFileSync(LIMITS_FILE, 'utf8'));
const listing = (fields, platform = 'ios') => ({ file: 'aso/data/listing.json', data: { platform, fields, provenance: { retrievedAt: '2026-11-16T00:00:00.000Z' } } });
const meta = (ios, extra = {}) => ({ locale: 'en-US', country: 'us', ios, ...extra });
const fails = (r) => r.findings.filter((f) => f.level === 'fail').map((f) => `${f.where}: ${f.message}`);
const warns = (r) => r.findings.filter((f) => f.level === 'warn').map((f) => `${f.where}: ${f.message}`);

test('limits.json: every entry has a source and a checked date, and unconfirmed ones say so', () => {
  for (const [k, v] of Object.entries({ ...limits.limits, ...limits.rules })) {
    assert.match(v.source, /^https:\/\//, k);
    assert.match(v.checked, /^\d{4}-\d{2}-\d{2}$/, k);
    assert.equal(typeof v.confirmed, 'boolean', k);
  }
  assert.equal(limits.limits['ios.keywords'].unit, 'bytes');
  assert.equal(limits.limits['android.title'].max, 30);
});

test('ASCII keyword field at exactly 100 bytes passes; 101 fails', () => {
  const kw100 = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet', 'kilo', 'lima', 'mike', 'november', 'oscar', 'papaaaa'].join(',');
  assert.equal(Buffer.byteLength(kw100), 100);
  assert.deepEqual(fails(checkMetadata(meta({ keywords: { current: null, proposed: kw100 } }), { limits })), []);
  const r = checkMetadata(meta({ keywords: { current: null, proposed: `${kw100}x` } }), { limits });
  assert.ok(fails(r).some((m) => /101 bytes exceeds the 100-bytes limit/.test(m)), fails(r).join('\n'));
});

test('multi-byte keyword field is measured in bytes, not characters', () => {
  // 34 Japanese characters = 102 bytes in UTF-8, though only 34 characters.
  const kw = '日記帳,ジャーナル,日誌,毎日の記録,感謝日記,気分記録,振り返り,メモ帳,思い出';
  assert.ok([...kw].length < 100);
  assert.ok(Buffer.byteLength(kw) > 100);
  const r = checkMetadata(meta({ keywords: { current: null, proposed: kw } }), { limits });
  assert.ok(fails(r).some((m) => /bytes exceeds the 100-bytes limit/.test(m)), fails(r).join('\n'));
});

test('subtitle is measured in characters: 30 CJK characters pass although they are 90 bytes', () => {
  const sub = '日'.repeat(30);
  assert.equal(measure(sub, 'characters'), 30);
  assert.equal(measure(sub, 'bytes'), 90);
  assert.deepEqual(fails(checkMetadata(meta({ subtitle: { current: null, proposed: sub } }), { limits })), []);
  assert.ok(fails(checkMetadata(meta({ subtitle: { current: null, proposed: `${sub}日` } }), { limits })).length);
});

test('emoji counts as one character', () => {
  assert.equal(measure('Calm 🌙', 'characters'), 6);
});

test('keyword formatting: space after comma, empty entries, short words, duplicate entries', () => {
  const r = checkMetadata(meta({ keywords: { current: null, proposed: 'mood, diary,,ok,diary' } }), { limits });
  const f = fails(r).join('\n');
  assert.match(f, /Space after a comma/);
  assert.match(f, /Empty entry/);
  assert.match(f, /"ok" is 2 characters/);
  assert.match(f, /"diary" appears twice/);
});

test('duplicates across name, subtitle and keywords fail; company name words fail', () => {
  const r = checkMetadata(meta({
    name: { current: null, proposed: 'Nestly: Friendship Journal' },
    subtitle: { current: null, proposed: 'Care for your people' },
    keywords: { current: null, proposed: 'journal,people,bloom,habit' },
  }, { sellerName: 'Bloom Labs' }), { limits });
  const f = fails(r).join('\n');
  assert.match(f, /"journal" is already in the app name/);
  assert.match(f, /"people" is already in the subtitle/);
  assert.match(f, /"bloom" is part of the company name/);
});

test('singular/plural pairs are reported as warnings', () => {
  assert.equal(singular('stories'), 'story');
  assert.equal(singular('habits'), 'habit');
  assert.equal(singular('focus'), 'focus');
  const r = checkMetadata(meta({ name: { current: null, proposed: 'Habit Garden' }, keywords: { current: null, proposed: 'habits,streak' } }), { limits });
  assert.ok(warns(r).some((m) => /habit \/ habits|habits \/ habit/.test(m)), warns(r).join('\n'));
});

test('competitor brand names fail in keywords and name, warn in description', () => {
  const r = checkMetadata(meta({
    name: { current: null, proposed: 'Journal like Day One' },
    keywords: { current: null, proposed: 'diarium,mood' },
    description: { current: null, proposed: 'Import entries from Day One.' },
  }, { competitorBrands: ['Day One', 'Diarium'] }), { limits });
  assert.ok(fails(r).some((m) => /ios.name: Competitor brand "Day One"/.test(m)));
  assert.ok(fails(r).some((m) => /ios.keywords: Competitor brand "Diarium"/.test(m)));
  assert.ok(warns(r).some((m) => /ios.description: Competitor brand "Day One"/.test(m)));
});

test('Current must equal the listing on disk', () => {
  const sources = [listing({ name: 'Day One: Daily Journal & Diary', description: 'Live text' })];
  const ok = checkMetadata(meta({ name: { current: 'Day One: Daily Journal & Diary', proposed: 'Day One: Private Journal' } }), { limits, sources });
  assert.deepEqual(fails(ok), []);
  const stale = checkMetadata(meta({ name: { current: 'Day One Journal', proposed: 'Day One: Private Journal' } }), { limits, sources });
  assert.ok(fails(stale).some((m) => /does not match aso\/data\/listing.json/.test(m)));
  const unsourced = checkMetadata(meta({ subtitle: { current: 'Private diary', proposed: 'Private diary app' } }), { limits, sources });
  assert.ok(fails(unsourced).some((m) => /no listing file on disk provides this field/.test(m)));
  const missing = checkMetadata(meta({ description: { current: null, proposed: 'New text' } }), { limits, sources });
  assert.ok(fails(missing).some((m) => /"current" is empty but/.test(m)));
});

test('Google Play title policy: ranking claims and emoji fail, ALL CAPS warns unless brand', () => {
  const r = checkMetadata({ locale: 'en-US', android: { title: { current: null, proposed: '#1 Habit Tracker 🔥 FAST' } } }, { limits });
  const f = fails(r).join('\n');
  assert.match(f, /android-ranking-claim/);
  assert.match(f, /android-emoji/);
  assert.ok(warns(r).some((m) => /"FAST" is in ALL CAPS/.test(m)));
  const brand = checkMetadata({ locale: 'en-US', brandTerms: ['FAST'], android: { title: { current: null, proposed: 'FAST Habit Tracker' } } }, { limits });
  assert.deepEqual(warns(brand), []);
});

test('an unconfirmed limit produces a warning, never a failure', () => {
  const custom = structuredClone(limits);
  custom.limits['ios.subtitle'] = { ...custom.limits['ios.subtitle'], confirmed: false };
  const r = checkMetadata(meta({ subtitle: { current: null, proposed: 'x'.repeat(31) } }), { limits: custom });
  assert.deepEqual(fails(r), []);
  assert.ok(warns(r).some((m) => /limit unconfirmed/.test(m)));
  assert.ok(r.unconfirmed.includes('ios.subtitle'));
});

test('table shows exact lengths and the source of Current; embed is idempotent', () => {
  const m = meta({ name: { current: 'Old Name', proposed: 'New Name: Journal' } }, { currentSources: ['aso/data/listing.json'] });
  const t = renderTable(m, { limits, sources: [listing({ name: 'Old Name' })] });
  assert.match(t, /\| App Store \| name \| Old Name \| New Name: Journal \| 17\/30 characters \| aso\/data\/listing.json \(2026-11-16\) \|/);
  assert.doesNotMatch(t, /~/);
  const once = embed('# Report\n', 'en-US', t);
  assert.equal(embed(once, 'en-US', t), once);
});

test('report text: approximated lengths, ESTIMATED labels and undated reports fail', () => {
  assert.ok(checkReportText('Description is ~2,850/4,000 used. 2026-11-16').some((i) => /approximates/.test(i.message)));
  assert.ok(checkReportText('Data quality: ESTIMATED 2026-11-16').some((i) => /ESTIMATED/.test(i.message)));
  assert.deepEqual(checkReportText('Search volume: ESTIMATED figures unavailable (no provider). Retrieved 2026-11-16.'), []);
  assert.ok(checkReportText('No dates here').some((i) => /no dated source/.test(i.message)));
});

test('consistency: a term placed in the subtitle must appear in the proposed subtitle', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aso-cons-'));
  const root = path.join(dir, 'aso');
  fs.mkdirSync(path.join(root, 'metadata'), { recursive: true });
  const m = meta({ subtitle: { current: null, proposed: 'Private diary' } });
  fs.writeFileSync(path.join(root, 'metadata', 'en-US.json'), JSON.stringify(m));
  fs.writeFileSync(path.join(root, 'metadata', 'en-US.check.md'), 'Result: PASS\n');
  const table = renderTable(m, { limits, sources: [] });
  fs.writeFileSync(path.join(root, 'report.md'), embed('# R\nRetrieved 2026-11-16\n', 'en-US', table));
  fs.writeFileSync(path.join(root, 'keywords.csv'), 'platform,country,term,placement\nios,us,private diary,subtitle\nios,us,mood journal,subtitle\n');
  const res = consistency(root, { limits, projectRoot: dir });
  assert.equal(res.pass, false);
  const msgs = res.issues.map((i) => i.message).join('\n');
  assert.match(msgs, /"mood journal" \(US\) in subtitle/);
  assert.doesNotMatch(msgs, /"private diary"/);
});
