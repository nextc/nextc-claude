#!/usr/bin/env node
// Derives the identifiers a kickoff needs from a product name and organization, so no skill invents them.
// Usage: node identity.mjs --name "My Cool App" --org mgvlabs [--kind flutter|unity]
import { parseArgs, isMain } from './lib/util.mjs';

const RESERVED_DART = new Set(['flutter', 'test', 'dart', 'async', 'core', 'math', 'io', 'ui', 'class', 'new', 'null', 'true', 'false', 'var', 'void', 'in', 'is', 'as']);

export function normalizeOrg(org) {
  const raw = String(org || '').trim().toLowerCase();
  if (!raw) throw new Error('organization is required (for example "mgvlabs" or "com.mgvlabs")');
  const full = raw.includes('.') ? raw : `com.${raw}`;
  const segs = full.split('.');
  if (segs.some((s) => !/^[a-z][a-z0-9]*$/.test(s))) {
    throw new Error(`organization "${org}" must be reverse-domain segments of lowercase letters and digits (Apple bundle ids forbid "_" and "-")`);
  }
  return full;
}

export function deriveIdentity({ name, org, kind = 'flutter' }) {
  const words = String(name || '').match(/[A-Za-z0-9]+/g);
  if (!words) throw new Error(`product name "${name}" has no letters or digits`);
  const orgId = normalizeOrg(org);
  const alnum = words.join('').toLowerCase();
  let pkg = words.join('_').toLowerCase();
  if (/^\d/.test(pkg)) pkg = `app_${pkg}`;
  if (RESERVED_DART.has(pkg)) pkg = `${pkg}_app`;
  const pascal = words.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  const appId = `${orgId}.${/^\d/.test(alnum) ? `app${alnum}` : alnum}`;
  return kind === 'unity'
    ? { product_name: String(name).trim(), slug: pascal, org: orgId, app_id: appId, company_name: orgId.split('.').slice(1).join('.') || orgId }
    : { product_name: String(name).trim(), slug: pkg, org: orgId, app_id: appId };
}

if (isMain(import.meta.url)) {
  const a = parseArgs(process.argv.slice(2));
  try {
    console.log(JSON.stringify(deriveIdentity({ name: a.name, org: a.org, kind: a.kind }), null, 2));
  } catch (e) {
    console.error(`identity: ${e.message}`);
    process.exit(2);
  }
}
