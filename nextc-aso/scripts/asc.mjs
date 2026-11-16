#!/usr/bin/env node
// App Store Connect API, read-only, for the user's own app. The key is supplied at run time and
// never printed, written or passed on a command line: give a file path or the NAME of an
// environment variable that holds the key text or its path.
//
//   asc.mjs app-info <appId|bundleId> --key-id <KEYID> (--issuer-id <ISSUER> | --individual) (--key-file <p8> | --key-env <VAR>)
//        → aso/data/asc-<locale>.json per locale (name, subtitle, keywords, promotionalText, description, whatsNew)
//   asc.mjs reviews <appId|bundleId> [--territory USA] [--max 500] ...auth flags
//        → aso/data/asc-reviews.json
//   asc.mjs token-check ...auth flags   builds a token and prints only its header and claims (no signature)
//
// Key id and issuer id may also come from ASC_KEY_ID and ASC_ISSUER_ID.
import crypto from 'node:crypto';
import path from 'node:path';
import { parseArgs, writeJson, isoNow, defaultFetcher, loadSecret, redact, isMain, die } from './lib/common.mjs';

export const API = 'https://api.appstoreconnect.apple.com';
// EXTERNAL: Apple rejects most requests whose token lifetime (exp - iat) exceeds 20 minutes
// (developer.apple.com/documentation/appstoreconnectapi/generating-tokens-for-api-requests).
export const MAX_LIFETIME_SEC = 1200;
export const DEFAULT_LIFETIME_SEC = 600;

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

export function buildJwt({ keyPem, keyId, issuerId, individual = false, scope, now = () => Date.now(), lifetimeSec = DEFAULT_LIFETIME_SEC }) {
  if (!keyId) throw new Error('Missing key id (--key-id or ASC_KEY_ID).');
  if (!individual && !issuerId) throw new Error('Missing issuer id (--issuer-id or ASC_ISSUER_ID), or pass --individual for an individual key.');
  if (lifetimeSec > MAX_LIFETIME_SEC) throw new Error(`Token lifetime ${lifetimeSec}s exceeds Apple's 20-minute maximum.`);
  const iat = Math.floor(now() / 1000);
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const payload = individual
    ? { sub: 'user', iat, exp: iat + lifetimeSec, aud: 'appstoreconnect-v1' }
    : { iss: issuerId, iat, exp: iat + lifetimeSec, aud: 'appstoreconnect-v1' };
  if (scope) payload.scope = scope;
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  // JWS ES256 needs the raw 64-byte r||s signature, not Node's default DER encoding.
  const sig = crypto.sign('sha256', Buffer.from(signingInput), { key: keyPem, dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${b64url(sig)}`;
}

export function decodeJwt(token) {
  const [h, p] = token.split('.');
  const dec = (s) => JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  return { header: dec(h), payload: dec(p) };
}

export function client({ token, fetcher = defaultFetcher }) {
  const requests = [];
  async function get(pathOrUrl) {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${API}${pathOrUrl}`;
    requests.push(url.replace(API, ''));
    // SECURITY: the bearer token goes only into this header; errors below never include headers.
    const res = await fetcher(url, { headers: { authorization: `Bearer ${token}` } });
    if (res.status !== 200) {
      const detail = Array.isArray(res.body?.errors) ? res.body.errors.map((e) => `${e.code}: ${e.title}`).join('; ') : '';
      throw new Error(redact(`App Store Connect returned HTTP ${res.status} for ${url.replace(API, '')}${detail ? ` (${detail})` : ''}`));
    }
    return res.body;
  }
  async function getAll(pathOrUrl, max = Infinity) {
    const out = [];
    let next = pathOrUrl;
    while (next && out.length < max) {
      const body = await get(next);
      out.push(...(body.data || []));
      next = body.links?.next || null;
    }
    return out.slice(0, max);
  }
  return { get, getAll, requests };
}

export async function resolveAppId(c, idOrBundle) {
  if (/^\d+$/.test(String(idOrBundle))) return String(idOrBundle);
  const body = await c.get(`/v1/apps?filter[bundleId]=${encodeURIComponent(idOrBundle)}&fields[apps]=name,bundleId,primaryLocale`);
  const app = (body.data || [])[0];
  if (!app) throw new Error(`No app with bundle id ${idOrBundle} is visible to this key.`);
  return app.id;
}

const isLiveInfo = (i) => i.attributes?.state === 'READY_FOR_DISTRIBUTION' || i.attributes?.appStoreState === 'READY_FOR_SALE';
const isLiveVersion = (v) => v.attributes?.appVersionState === 'READY_FOR_DISTRIBUTION' || v.attributes?.appStoreState === 'READY_FOR_SALE';

export async function appInfo(c, idOrBundle, { now = () => Date.now() } = {}) {
  const appId = await resolveAppId(c, idOrBundle);
  const infos = await c.getAll(`/v1/apps/${appId}/appInfos`);
  const info = infos.find(isLiveInfo) || infos[0];
  if (!info) throw new Error('The app has no appInfos.');
  const infoLocs = await c.getAll(`/v1/appInfos/${info.id}/appInfoLocalizations`);
  const versions = await c.getAll(`/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&limit=10`);
  const version = versions.find(isLiveVersion) || versions[0] || null;
  const verLocs = version ? await c.getAll(`/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`) : [];
  const retrievedAt = isoNow(now());
  const byLocale = new Map();
  for (const l of infoLocs) byLocale.set(l.attributes.locale, { name: l.attributes.name ?? null, subtitle: l.attributes.subtitle ?? null });
  for (const l of verLocs) {
    const a = l.attributes;
    byLocale.set(a.locale, { ...(byLocale.get(a.locale) || {}), keywords: a.keywords ?? null, promotionalText: a.promotionalText ?? null, description: a.description ?? null, whatsNew: a.whatsNew ?? null });
  }
  return [...byLocale.entries()].map(([locale, fields]) => ({
    kind: 'listing',
    platform: 'ios',
    locale,
    country: null,
    provenance: {
      source: 'app-store-connect-api',
      retrievedAt,
      appId,
      appInfoState: info.attributes?.state ?? info.attributes?.appStoreState ?? null,
      version: version ? { id: version.id, versionString: version.attributes?.versionString, state: version.attributes?.appVersionState ?? version.attributes?.appStoreState } : null,
      requests: [...c.requests],
      note: isLiveInfo(info) && (!version || isLiveVersion(version)) ? 'live version' : 'no live version found; values are from the most recent version, which may be unreleased',
    },
    fields,
  }));
}

export async function reviews(c, idOrBundle, { territory, max = 500, now = () => Date.now() } = {}) {
  const appId = await resolveAppId(c, idOrBundle);
  const q = new URLSearchParams({ sort: '-createdDate', limit: '200' });
  if (territory) q.set('filter[territory]', territory);
  const data = await c.getAll(`/v1/apps/${appId}/customerReviews?${q}`, max);
  return {
    kind: 'reviews',
    platform: 'ios',
    provenance: { source: 'app-store-connect-api', retrievedAt: isoNow(now()), appId, territory: territory || 'all', requests: [...c.requests] },
    reviews: data.map((r) => ({ id: r.id, rating: r.attributes.rating, title: r.attributes.title, body: r.attributes.body, territory: r.attributes.territory, createdDate: r.attributes.createdDate })),
  };
}

export function authFromArgs(args, env = process.env) {
  const keyPem = loadSecret({ keyFile: args['key-file'], keyEnv: args['key-env'], env });
  return {
    keyPem,
    keyId: args['key-id'] || env.ASC_KEY_ID,
    issuerId: args['issuer-id'] || env.ASC_ISSUER_ID,
    individual: Boolean(args.individual),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [cmd, target] = args._;
  const dataDir = path.resolve(args['data-dir'] || 'aso/data');
  const token = buildJwt(authFromArgs(args));
  if (cmd === 'token-check') {
    process.stdout.write(JSON.stringify(decodeJwt(token), null, 2) + '\n');
    return;
  }
  if (!target) die('usage: asc.mjs app-info|reviews <appId|bundleId> --key-id … (--issuer-id … | --individual) (--key-file … | --key-env …)', 2);
  const c = client({ token });
  if (cmd === 'app-info') {
    const records = await appInfo(c, target);
    const files = records.map((r) => writeJson(path.join(dataDir, `asc-${r.locale}.json`), r));
    process.stdout.write(JSON.stringify({ files, locales: records.map((r) => r.locale), version: records[0]?.provenance.version, note: records[0]?.provenance.note }, null, 2) + '\n');
  } else if (cmd === 'reviews') {
    const out = await reviews(c, target, { territory: args.territory, max: Number(args.max || 500) });
    const file = writeJson(path.join(dataDir, 'asc-reviews.json'), out);
    process.stdout.write(JSON.stringify({ file, count: out.reviews.length }, null, 2) + '\n');
  } else {
    die('commands: app-info | reviews | token-check', 2);
  }
}

if (isMain(import.meta.url)) {
  main().catch((e) => die(`asc: ${redact(e.message)}`));
}
