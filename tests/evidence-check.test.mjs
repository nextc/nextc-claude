// nextc-product's evidence-check script (records, state, memo checks). No installs, no network,
// no model calls: fixture runs are written to a temp dir and the page fetcher is injected.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCRIPT = fileURLToPath(new URL('../nextc-product/scripts/evidence-check.mjs', import.meta.url));
const ec = await import(SCRIPT);

const FIXED_NOW = () => new Date('2026-11-16T09:30:00.000Z');
const URL_A = 'https://example.com/a';
const URL_B = 'https://example.org/b';
const URL_C = 'https://down.example.net/c';
const URL_PDF = 'https://example.com/report.pdf';

let tmp;

const INTAKE = {
  idea: 'A photo export tool',
  decision: {
    question: 'Build the app now or test the mechanism first?',
    options: [{ id: 'O1', label: 'Build now' }, { id: 'O2', label: 'Test first' }],
    deadline: null,
  },
  assets: [{ id: 'F1', kind: 'users', description: 'existing users' }],
  kill_conditions: [{ id: 'K1', condition: 'nobody uses it' }],
  assumptions: [{ id: 'A1', statement: 'Users will pay', source: 'inferred' }],
};

function rec(over = {}) {
  return {
    claim: 'Example app supports platform crop presets',
    quote: 'Crop presets for every “platform” you post to',
    url: URL_A,
    retrieved_at: '2026-11-16',
    published: null,
    kind: 'fact',
    confidence: 'high',
    bears_on: ['O1'],
    topic: 'prior-art',
    ...over,
  };
}

function writeRun(name, files, { intake = INTAKE } = {}) {
  const dir = path.join(tmp, name);
  fs.mkdirSync(path.join(dir, 'evidence'), { recursive: true });
  if (intake) fs.writeFileSync(path.join(dir, 'intake.json'), JSON.stringify(intake));
  for (const [file, lines] of Object.entries(files)) {
    const body = lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n';
    fs.writeFileSync(path.join(dir, file), body);
  }
  return dir;
}

function fakeFetcher(calls = []) {
  return async (url) => {
    calls.push(url);
    if (url === URL_A) return { ok: true, status: 200, contentType: 'text/html', text: '<html><script>var x="no"</script><p>Crop presets for every &ldquo;platform&rdquo;\n  you post to</p><p>Second part of the page.</p></html>' };
    if (url === URL_B) return { ok: true, status: 200, contentType: 'text/html', text: '<p>Nothing relevant here.</p>' };
    if (url === URL_PDF) return { ok: true, status: 200, contentType: 'application/pdf', text: '', nonText: true };
    throw new Error('ECONNREFUSED');
  };
}

function readLines(file) {
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
}

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-check-'));
});

after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('claim ids are deterministic and ignore tracking params, fragments and case', () => {
  const a = ec.claimId('https://Example.com/a?utm_source=x#top', '  Example app supports platform crop presets. ');
  const b = ec.claimId('https://example.com/a', 'example app supports platform crop presets');
  assert.equal(a, b);
  assert.match(a, /^c_[0-9a-f]{10}$/);
  assert.notEqual(a, ec.claimId(URL_B, 'example app supports platform crop presets'));
});

test('a well-formed record passes and each broken field is named', () => {
  const ids = new Set(['O1', 'O2', 'A1', 'K1']);
  assert.deepEqual(ec.validateRecord(rec(), { topic: 'prior-art', intakeIds: ids }).errors, []);
  const bad = ec.validateRecord(rec({ url: 'not a url', kind: 'rumour', confidence: 'sure', quote: 'short', bears_on: ['O9', 'X1'] }), { topic: 'prior-art', intakeIds: ids }).errors.join('\n');
  assert.match(bad, /url must be/);
  assert.match(bad, /kind must be/);
  assert.match(bad, /confidence must be/);
  assert.match(bad, /quote must be/);
  assert.match(bad, /"O9" is not defined in intake/);
  assert.match(bad, /"X1" is not an option/);
  assert.match(ec.validateRecord(rec({ topic: 'demand' }), { topic: 'prior-art' }).errors.join(), /does not match file topic/);
  const missing = { ...rec() };
  delete missing.published;
  assert.match(ec.validateRecord(missing).errors.join(), /missing field "published"/);
});

test('estimates must say what they are derived from; founder records may have no url', () => {
  assert.match(ec.validateRecord(rec({ kind: 'estimate' })).errors.join(), /derived_from/);
  assert.deepEqual(ec.validateRecord(rec({ kind: 'estimate', derived_from: ['c_0123456789'] })).errors, []);
  assert.deepEqual(ec.validateRecord(rec({ kind: 'founder', url: null, retrieved_at: null, topic: 'founder' }), { topic: 'founder' }).errors, []);
  assert.match(ec.validateRecord(rec({ kind: 'fact', url: null })).errors.join(), /url must be/);
});

test('quotes match across entities, smart quotes, whitespace and elisions', () => {
  const page = ec.htmlToText('<p>Instagram&rsquo;s app  re-encodes\nevery photo before upload, then the server resizes it.</p>');
  assert.equal(ec.quoteAppears("Instagram's app re-encodes every photo", page), true);
  assert.equal(ec.quoteAppears('Instagram’s app ... then the server resizes it', page), true);
  assert.equal(ec.quoteAppears('then the server resizes it ... Instagram’s app', page), false);
  assert.equal(ec.quoteAppears('TikTok never re-encodes', page), false);
});

test('check validates, dedupes, rekeys, verifies sources and writes a real-time index', async () => {
  const good = rec();
  const dupe = rec({ claim: 'Example app supports platform crop presets.' });
  const rekey = rec({ id: 'c_ffffffffff', claim: 'Another app has no presets at all here', url: URL_B, quote: 'This quote is not on the page' });
  const unreachable = rec({ claim: 'A third app was shut down in 2023', url: URL_C, quote: 'we are shutting down the service' });
  const pdf = rec({ claim: 'A market report sizes the niche', url: URL_PDF, quote: 'the niche is worth a lot of money', kind: 'observation', confidence: 'low', bears_on: [] });
  const dir = writeRun('check-run', {
    'evidence/prior-art.jsonl': [good, dupe, '{not json', rekey, unreachable, pdf],
    'evidence/founder.jsonl': [rec({ kind: 'founder', url: null, retrieved_at: null, topic: 'founder', claim: 'Founder has existing users who are makeup artists', quote: 'i have some users who are makeup artists' })],
    'evidence/prior-art.meta.json': ['{"searched":["app store: crop presets"],"gaps":["no Play Store data"],"open_questions":["How many users?"]}'],
  });
  const calls = [];
  const { ok, index } = await ec.runCheck({ dir, require: ['prior-art', 'demand'], fetch: true, fetcher: fakeFetcher(calls), now: FIXED_NOW });

  assert.equal(ok, false, 'invalid JSON line and empty required topic must fail the check');
  assert.deepEqual(index.empty_required, ['demand']);
  assert.equal(index.failures.length, 1);
  assert.match(index.failures[0].errors[0], /invalid JSON/);
  assert.equal(index.duplicates.length, 1);
  assert.equal(index.rekeyed.length, 1);
  assert.equal(index.rekeyed[0].old, 'c_ffffffffff');
  assert.equal(index.generated_at, '2026-11-16T09:30:00Z');
  assert.equal(index.counts.total, 5);
  assert.equal(index.counts.by_topic['prior-art'].total, 4);
  assert.deepEqual(index.counts.verified_source, { true: 1, false: 1, unreachable: 2, unchecked: 0 });
  assert.deepEqual(index.meta['prior-art'].gaps, ['no Play Store data']);
  assert.equal(new Set(calls).size, calls.length, 'each URL is fetched once');

  const lines = readLines(path.join(dir, 'evidence', 'prior-art.jsonl'));
  assert.equal(lines.length, 5, 'duplicate dropped, invalid line kept for fixing');
  assert.ok(lines.includes('{not json'));
  const parsed = lines.filter((l) => l.startsWith('{"')).map((l) => JSON.parse(l));
  const byUrl = Object.fromEntries(parsed.map((r) => [r.url, r]));
  assert.equal(byUrl[URL_A].verified_source, true);
  assert.equal(byUrl[URL_B].verified_source, false);
  assert.equal(byUrl[URL_C].verified_source, 'unreachable');
  assert.match(byUrl[URL_C].fetch_note, /ECONNREFUSED/);
  assert.equal(byUrl[URL_PDF].verified_source, 'unreachable');
  assert.equal(byUrl[URL_B].id, ec.claimId(URL_B, rekey.claim));
  assert.ok(parsed.every((r) => r.checked_at === '2026-11-16T09:30:00Z'));
  assert.ok(fs.existsSync(path.join(dir, 'evidence', '_index.json')));

  fs.writeFileSync(path.join(dir, 'evidence', 'prior-art.jsonl'), lines.filter((l) => l !== '{not json').join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'evidence', 'demand.jsonl'), JSON.stringify(rec({ topic: 'demand', claim: 'People complain the platform softens photos', url: URL_B, quote: 'nothing relevant here', kind: 'observation' })) + '\n');
  const second = await ec.runCheck({ dir, require: ['prior-art', 'demand'], fetch: false, now: FIXED_NOW });
  assert.equal(second.ok, true, JSON.stringify(second.index.failures));
  assert.equal(second.index.counts.verified_source.unchecked, 1, 'without --fetch a new record stays unchecked');
});

test('intake errors and unknown bears_on ids fail the check', async () => {
  const dir = writeRun('bad-intake', { 'evidence/prior-art.jsonl': [rec({ bears_on: ['A7'] })] }, { intake: { decision: {}, assumptions: [{ id: 'X1', statement: 's' }] } });
  const { ok, index } = await ec.runCheck({ dir, now: FIXED_NOW });
  assert.equal(ok, false);
  assert.ok(index.intake.errors.some((e) => /decision.question/.test(e)));
  assert.ok(index.intake.errors.some((e) => /assumptions\[0\].id/.test(e)));
});

test('verification lines are validated; refuted and weakened need a counter source', async () => {
  const r1 = rec();
  const r2 = rec({ claim: 'Second claim about the market size', url: URL_B, quote: 'nothing relevant here' });
  const id1 = ec.claimId(r1.url, r1.claim);
  const id2 = ec.claimId(r2.url, r2.claim);
  const dir = writeRun('verify-run', {
    'evidence/prior-art.jsonl': [r1, r2],
    'verification.jsonl': [
      { claim_id: id1, verdict: 'upheld', counter_url: null, note: 'Found on the vendor page' },
      { claim_id: id2, verdict: 'refuted', counter_url: null, note: 'Contradicted' },
      { claim_id: 'c_0000000000', verdict: 'upheld', counter_url: null, note: 'x' },
    ],
  });
  const first = await ec.runCheck({ dir, now: FIXED_NOW });
  assert.equal(first.ok, false);
  assert.equal(first.index.verification.failures.length, 2);
  fs.writeFileSync(path.join(dir, 'verification.jsonl'), [
    JSON.stringify({ claim_id: id1, verdict: 'upheld', counter_url: null, note: 'Found on the vendor page' }),
    JSON.stringify({ claim_id: id2, verdict: 'refuted', counter_url: 'https://example.net/counter', note: 'The vendor says otherwise' }),
  ].join('\n') + '\n');
  const second = await ec.runCheck({ dir, now: FIXED_NOW });
  assert.equal(second.ok, true);
  assert.deepEqual(second.index.verification.refuted_ids, [id2]);
  assert.equal(second.index.verification.upheld, 1);
});

test('select picks decision-bearing, unverified, non-founder claims in batches', () => {
  const records = [];
  for (let i = 0; i < 12; i++) records.push(rec({ claim: `Decision-bearing claim number ${i}`, url: `https://example.com/p${i}` }));
  records.push(rec({ claim: 'Founder says users exist today', kind: 'founder', url: null, retrieved_at: null }));
  records.push(rec({ claim: 'Background claim with no decision link', bears_on: [] }));
  const dir = writeRun('select-run', { 'evidence/prior-art.jsonl': records });
  const done = records[0];
  fs.writeFileSync(path.join(dir, 'verification.jsonl'), JSON.stringify({ claim_id: ec.claimId(done.url, done.claim), verdict: 'upheld', counter_url: null, note: 'ok' }) + '\n');
  const r = ec.selectClaims(dir, { max: 10, per: 4 });
  assert.equal(r.selected, 10);
  assert.equal(r.not_selected, 1);
  assert.deepEqual(r.batches.map((b) => b.length), [4, 4, 2]);
  const ids = r.batches.flat().map((c) => c.id);
  assert.ok(!ids.includes(ec.claimId(done.url, done.claim)), 'already verified claims are skipped');
  assert.ok(r.batches.flat().every((c) => c.kind !== 'founder' && c.bears_on.length));
});

function memoRun() {
  const r1 = rec();
  const r2 = rec({ claim: 'Rival app was refuted on price', url: URL_B, quote: 'nothing relevant here' });
  const id1 = ec.claimId(r1.url, r1.claim);
  const id2 = ec.claimId(r2.url, r2.claim);
  const dir = writeRun('memo-run', {
    'evidence/prior-art.jsonl': [r1, r2],
    'verification.jsonl': [{ claim_id: id2, verdict: 'refuted', counter_url: 'https://example.net/x', note: 'Price is higher' }],
  });
  fs.writeFileSync(path.join(dir, 'appendix.md'), '# Evidence appendix\n');
  return { dir, id1, id2 };
}

function goodMemo(id1) {
  return [
    '# Photo tool: decision memo',
    '',
    '## Recommendation: VALIDATE FIRST',
    '',
    `Three rivals already ship crop presets [${id1}]. We test the mechanism before building.`,
    '',
    '## Experiments',
    '',
    '| # | Test | Threshold | Denominator |',
    '|---|------|-----------|-------------|',
    '| 1 | Blind comparison | 8 of 15 pairs [assumption] | 15 pairs from 3 artists [A1] |',
    '',
    '## What we do not know',
    '',
    '- Whether users pay. Decided on 2026-11-16 by O2.',
    '',
    'Evidence: [appendix](appendix.md).',
    '',
  ].join('\n');
}

test('memo-check passes a grounded memo and writes the citation spot-check', () => {
  const { dir, id1 } = memoRun();
  const memo = path.join(dir, 'memo.md');
  fs.writeFileSync(memo, goodMemo(id1));
  const sample = path.join(dir, 'citation-check.md');
  const r = ec.memoCheck({ dir, memo, words: 1500, sampleOut: sample });
  assert.deepEqual(r.errors, []);
  assert.equal(r.cited, 1);
  const text = fs.readFileSync(sample, 'utf8');
  assert.match(text, new RegExp(id1));
  assert.match(text, /quote: "Crop presets/);
});

test('memo-check fails on budget, unmarked numbers, bad citations, missing links, label and what-changed', () => {
  const { dir, id1, id2 } = memoRun();
  const memo = path.join(dir, 'bad.md');
  fs.writeFileSync(memo, [
    '# Memo',
    '',
    '## Summary',
    '',
    'The market is worth 40 million dollars.',
    `A rival charges more [${id2}]. Another fact [c_abcdefabcd]. Unknown assumption [A9].`,
    'See [the notes](missing/notes.md) and [web](https://example.com).',
    '',
    '## Recommendation',
    '',
    'BUILD it.',
  ].join('\n'));
  const r = ec.memoCheck({ dir, memo, words: 10, previous: path.join(dir, 'old.md'), sampleOut: path.join(dir, 'cc.md') });
  const all = r.errors.join('\n');
  assert.equal(r.ok, false);
  assert.match(all, /budget is 10/);
  assert.match(all, /number\(s\) 40/);
  assert.match(all, new RegExp(`${id2}, which a refuter refuted`));
  assert.match(all, /c_abcdefabcd, which is not a valid evidence record/);
  assert.match(all, /\[A9\]/);
  assert.match(all, /missing\/notes.md/);
  assert.doesNotMatch(all, /example\.com/);
  assert.match(all, /no recommendation label/);
  assert.match(all, /What changed/);
  assert.ok(!all.includes(id1));
});

test('appendix lists refuted claims apart and marks cited ones', () => {
  const { dir, id1, id2 } = memoRun();
  const memo = path.join(dir, 'memo.md');
  fs.writeFileSync(memo, goodMemo(id1));
  const text = ec.buildAppendix(dir, { memo, now: FIXED_NOW });
  const refutedSection = text.split('## Refuted claims')[1].split('## Weakened claims')[0];
  assert.match(refutedSection, new RegExp(id2));
  assert.doesNotMatch(refutedSection, new RegExp(id1));
  assert.match(text, new RegExp(`${id1}\\*\\* \\(cited\\)`));
  assert.match(text, /Generated 2026-11-16T09:30:00Z/);
});

test('state timestamps come from the clock, not the caller', () => {
  const dir = path.join(tmp, 'state-run');
  ec.initRun(dir, { mode: 'fast', now: FIXED_NOW });
  ec.updateState(dir, 'start', 'prior-art', { now: FIXED_NOW });
  let state = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'));
  assert.equal(state.stages['prior-art'].status, 'running');
  assert.equal(state.stages['prior-art'].started_at, '2026-11-16T09:30:00Z');
  const reopened = ec.initRun(dir, { mode: 'fast', now: FIXED_NOW });
  assert.deepEqual(reopened.incomplete, ['prior-art']);
  ec.updateState(dir, 'done', 'prior-art', { note: '14 records', now: () => new Date('2026-11-16T09:41:00Z') });
  state = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'));
  assert.equal(state.stages['prior-art'].finished_at, '2026-11-16T09:41:00Z');
  assert.equal(state.stages['prior-art'].note, '14 records');
  assert.throws(() => ec.updateState(dir, 'pause', 'prior-art'), /unknown state event/);
  assert.throws(() => ec.updateState(dir, 'start', 'Prior Art'), /kebab-case/);
});

test('memo-diff reports label, section and citation changes', () => {
  const d = ec.memoDiff('# A\n\n## Recommendation\n\nVALIDATE FIRST. x [c_aaaaaaaaaa]\n\n## Risks\n', '# A\n\n## Recommendation\n\nDO NOT BUILD. y [c_bbbbbbbbbb]\n\n## What changed\n');
  assert.deepEqual(d.label, { old: 'VALIDATE FIRST', new: 'DO NOT BUILD' });
  assert.deepEqual(d.ids_added, ['c_bbbbbbbbbb']);
  assert.deepEqual(d.ids_removed, ['c_aaaaaaaaaa']);
  assert.deepEqual(d.headings_added, ['What changed']);
  assert.deepEqual(d.headings_removed, ['Risks']);
});

test('import copies records from another run with bears_on cleared', () => {
  const from = writeRun('import-from', { 'evidence/prior-art.jsonl': [rec()] });
  const to = path.join(tmp, 'import-to');
  const r = ec.importEvidence(from, to);
  const [line] = readLines(r.file);
  const copied = JSON.parse(line);
  assert.deepEqual(copied.bears_on, []);
  assert.equal(copied.original_topic, 'prior-art');
  assert.equal(copied.topic, path.basename(r.file, '.jsonl'));
  assert.deepEqual(ec.validateRecord(copied, { topic: copied.topic }).errors, []);
});

test('CLI: id matches the library, check exits 1 on an empty required topic, usage exits 2', () => {
  const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  const id = run('id', '--url', URL_A, '--claim', 'Example app supports platform crop presets');
  assert.equal(id.status, 0);
  assert.equal(id.stdout.trim(), ec.claimId(URL_A, 'Example app supports platform crop presets'));
  const dir = writeRun('cli-run', { 'evidence/demand.jsonl': [rec({ topic: 'demand' })] });
  const check = run('check', '--dir', dir);
  assert.equal(check.status, 1);
  assert.deepEqual(JSON.parse(check.stdout).empty_required, ['prior-art']);
  assert.equal(run('bogus').status, 2);
  assert.equal(run('lint', '--file', path.join(dir, 'evidence', 'demand.jsonl')).status, 0);
});
