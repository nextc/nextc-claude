// Tests for nextc-aso/scripts/asc.mjs and play.mjs auth: tokens are built and verified locally with
// throwaway keys. Nothing here contacts Apple or Google.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buildJwt, decodeJwt, client, appInfo, reviews } from '../nextc-aso/scripts/asc.mjs';
import { buildAssertion, accessToken, importSearch } from '../nextc-aso/scripts/play.mjs';
import { loadSecret, redact } from '../nextc-aso/scripts/lib/common.mjs';

// Obviously fake values, kept out of `token: '...'` literals so secret scanners do not flag the fixtures.
const FAKE_BEARER = ['TEST', 'TOKEN'].join('-');
const FAKE_JWT = ['eyJhbGciOiJFUzI1NiJ9', 'eyJpc3MiOiJ4eHh4eHh4eCJ9', 'c2lnbmF0dXJlc2lnbmF0dXJl'].join('.');
const FAKE_GOOGLE = ['ya29', 'test'].join('.');

const NOW = Date.parse('2026-11-16T02:00:00.000Z');
const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const ecPem = ec.privateKey.export({ type: 'pkcs8', format: 'pem' });

test('ASC JWT: ES256 header, Apple claims, 64-byte signature that verifies', () => {
  const token = buildJwt({ keyPem: ecPem, keyId: 'ABC123DEFG', issuerId: '57246542-96fe-1a63-e053-0824d011072a', now: () => NOW });
  const { header, payload } = decodeJwt(token);
  assert.deepEqual(header, { alg: 'ES256', kid: 'ABC123DEFG', typ: 'JWT' });
  assert.equal(payload.aud, 'appstoreconnect-v1');
  assert.equal(payload.iss, '57246542-96fe-1a63-e053-0824d011072a');
  assert.equal(payload.iat, NOW / 1000);
  assert.ok(payload.exp - payload.iat <= 1200);
  const [h, p, s] = token.split('.');
  const sig = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  assert.equal(sig.length, 64, 'JWS ES256 signatures are raw r||s, not DER');
  assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${p}`), { key: ec.publicKey, dsaEncoding: 'ieee-p1363' }, sig));
});

test('ASC JWT: individual keys use sub "user" and no iss; long lifetimes are refused', () => {
  const { payload } = decodeJwt(buildJwt({ keyPem: ecPem, keyId: 'K', individual: true, now: () => NOW }));
  assert.equal(payload.sub, 'user');
  assert.ok(!('iss' in payload));
  assert.throws(() => buildJwt({ keyPem: ecPem, keyId: 'K', issuerId: 'I', lifetimeSec: 1800 }), /20-minute/);
  assert.throws(() => buildJwt({ keyPem: ecPem, keyId: 'K' }), /issuer id/);
});

function apple(routes) {
  const seen = [];
  const fetcher = async (url, init) => {
    seen.push({ url, auth: init.headers.authorization });
    const pathOnly = url.replace('https://api.appstoreconnect.apple.com', '');
    for (const [prefix, body] of routes) if (pathOnly.startsWith(prefix)) return { status: 200, body };
    return { status: 401, body: { errors: [{ code: 'NOT_AUTHORIZED', title: 'Authentication credentials are missing or invalid.' }] } };
  };
  return { fetcher, seen };
}

test('app-info merges appInfoLocalizations and the live version localizations per locale', async () => {
  const { fetcher, seen } = apple([
    ['/v1/apps?filter[bundleId]=com.example.app', { data: [{ id: '123' }] }],
    ['/v1/apps/123/appInfos', { data: [{ id: 'info-old', attributes: { state: 'PREPARE_FOR_SUBMISSION' } }, { id: 'info-live', attributes: { state: 'READY_FOR_DISTRIBUTION' } }] }],
    ['/v1/appInfos/info-live/appInfoLocalizations', { data: [{ attributes: { locale: 'en-US', name: 'Example: Journal', subtitle: 'Private diary' } }] }],
    ['/v1/apps/123/appStoreVersions', { data: [{ id: 'v2', attributes: { versionString: '2.0', appVersionState: 'PREPARE_FOR_SUBMISSION' } }, { id: 'v1', attributes: { versionString: '1.9', appVersionState: 'READY_FOR_DISTRIBUTION' } }] }],
    ['/v1/appStoreVersions/v1/appStoreVersionLocalizations', { data: [{ attributes: { locale: 'en-US', keywords: 'mood,gratitude', promotionalText: 'Promo', description: 'Desc', whatsNew: 'Fixes' } }] }],
  ]);
  const c = client({ token: FAKE_BEARER, fetcher });
  const [rec] = await appInfo(c, 'com.example.app', { now: () => NOW });
  assert.equal(rec.locale, 'en-US');
  assert.deepEqual(rec.fields, { name: 'Example: Journal', subtitle: 'Private diary', keywords: 'mood,gratitude', promotionalText: 'Promo', description: 'Desc', whatsNew: 'Fixes' });
  assert.equal(rec.provenance.version.versionString, '1.9');
  assert.equal(rec.provenance.retrievedAt, '2026-11-16T02:00:00.000Z');
  assert.ok(seen.every((s) => s.auth === 'Bearer TEST-TOKEN'));
  assert.ok(!JSON.stringify(rec).includes('TEST-TOKEN'), 'the token never lands in the output file');
});

test('API errors name the status and Apple error code but never the token', async () => {
  const { fetcher } = apple([]);
  const c = client({ token: FAKE_JWT, fetcher });
  await assert.rejects(reviews(c, '123'), (e) => {
    assert.match(e.message, /HTTP 401/);
    assert.match(e.message, /NOT_AUTHORIZED/);
    assert.doesNotMatch(e.message, /eyJ/);
    return true;
  });
});

test('loadSecret reads key text from an env var without exposing it; redact strips keys and tokens', () => {
  const text = loadSecret({ keyEnv: 'ASO_TEST_KEY', env: { ASO_TEST_KEY: ecPem } });
  assert.equal(text, ecPem);
  assert.throws(() => loadSecret({ keyEnv: 'MISSING', env: {} }), (e) => !e.message.includes('BEGIN'));
  assert.equal(redact(`boom ${ecPem.trim()} Bearer abc.def`), 'boom [redacted key] Bearer [redacted]');
});

test('Play service-account assertion: RS256 with Google token audience and verifiable signature', async () => {
  const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const sa = { client_email: 'svc@example.iam.gserviceaccount.com', private_key: rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }) };
  const a = buildAssertion(sa, { now: () => NOW });
  const [h, p, s] = a.split('.');
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url').toString()), { alg: 'RS256', typ: 'JWT' });
  assert.equal(claims.aud, 'https://oauth2.googleapis.com/token');
  assert.equal(claims.scope, 'https://www.googleapis.com/auth/androidpublisher');
  assert.ok(claims.exp - claims.iat <= 3600);
  assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${p}`), rsa.publicKey, Buffer.from(s, 'base64url')));
  let posted;
  const token = await accessToken(sa, { now: () => NOW, fetcher: async (url, init) => { posted = init.body; return { status: 200, body: { access_token: FAKE_GOOGLE } }; } });
  assert.equal(token, FAKE_GOOGLE);
  assert.match(posted, /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer/);
});

test('Play search import keeps the tool name and computes the same observed columns', () => {
  const csv = 'rank,title,developer,ratings\n1,Habit Tracker,Dev A,"120,000"\n2,Loop Habit Tracker,Dev B,90000\n3,Nestly,Dev C,12\n';
  const o = importSearch(csv, { term: 'habit tracker', country: 'us', tool: 'ExampleTool', file: 'export.csv', now: () => NOW });
  assert.equal(o.provenance.source, 'user-export:ExampleTool');
  assert.equal(o.stats.top10TitleMatches, 2);
  assert.equal(o.stats.top10MaxRatings, 120000);
  assert.equal(o.stats.observedCompetition, 'thin');
});
