// nextc-project-kickoff/scripts/pub-check.mjs with an injected fetcher (no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPackage, checkPackages } from '../nextc-project-kickoff/scripts/pub-check.mjs';

const NOW = Date.parse('2026-11-16T00:00:00Z');
const pkg = (version, published, extra = {}) => ({ status: 200, json: { name: 'x', latest: { version, published }, ...extra } });
const registry = {
  freezed: pkg('4.0.3', '2026-10-17T17:34:42Z'),
  go_router: pkg('18.1.4', '2026-11-09T20:11:07Z'),
  isar: pkg('3.1.0+1', '2023-04-25T08:06:51Z'),
  flutter_markdown: pkg('0.7.7+1', '2025-05-06T16:37:40Z', { isDiscontinued: true, replacedBy: 'flutter_markdown_plus' }),
  freezed_generator: { status: 404, json: null },
};
const get = async (url) => registry[url.split('/').pop()] || { status: 404, json: null };
const opts = { fetchJson: get, now: NOW };

test('existing, recent package is ok with version and publish date', async () => {
  const r = await checkPackage('freezed', opts);
  assert.equal(r.status, 'ok');
  assert.equal(r.latest, '4.0.3');
  assert.deepEqual(r.flags, []);
  assert.ok(r.ageMonths < 2);
});

test('a package that does not exist (freezed_generator) is missing and hints at the real package', async () => {
  const r = await checkPackage('freezed_generator', opts);
  assert.equal(r.status, 'missing');
  assert.match(r.message, /ships inside `freezed`/);
});

test('a discontinued package is an error and names its replacement', async () => {
  const r = await checkPackage('flutter_markdown', opts);
  assert.equal(r.status, 'discontinued');
  assert.equal(r.replacedBy, 'flutter_markdown_plus');
});

test('a package with no release for years is flagged unmaintained but still usable', async () => {
  const r = await checkPackage('isar', opts);
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.flags, ['unmaintained']);
});

test('checkPackages fails on missing/discontinued, passes on warnings, fails on warnings with strict', async () => {
  assert.equal((await checkPackages(['freezed', 'freezed_generator'], opts)).ok, false);
  assert.equal((await checkPackages(['flutter_markdown'], opts)).ok, false);
  assert.equal((await checkPackages(['freezed', 'isar', 'go_router'], opts)).ok, true);
  assert.equal((await checkPackages(['isar'], { ...opts, strict: true })).ok, false);
});

test('SDK packages are skipped and duplicates are checked once', async () => {
  let calls = 0;
  const counting = async (u) => { calls++; return get(u); };
  const r = await checkPackages(['flutter', 'flutter_test', 'freezed', 'freezed'], { ...opts, fetchJson: counting });
  assert.equal(calls, 1);
  assert.equal(r.results.length, 1);
});

test('network failures and bad names are reported as errors, not as missing packages', async () => {
  const boom = async () => { throw new Error('ENOTFOUND'); };
  const r = await checkPackages(['freezed'], { fetchJson: boom, now: NOW });
  assert.equal(r.failures.length, 1);
  assert.equal(r.ok, false);
  assert.equal((await checkPackage('../etc/passwd', opts)).status, 'error');
  assert.equal((await checkPackage('freezed', { fetchJson: async () => ({ status: 503, json: null }), now: NOW })).status, 'error');
});
