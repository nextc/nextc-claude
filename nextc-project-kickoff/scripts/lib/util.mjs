import { writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function parseSemver(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(v).trim());
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] || null };
}

export function isPrerelease(v) {
  const s = parseSemver(v);
  return s ? s.pre !== null : /-/.test(String(v));
}

function comparePre(a, b) {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const pa = a.split('.');
  const pb = b.split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === undefined) return -1;
    if (pb[i] === undefined) return 1;
    const na = /^\d+$/.test(pa[i]);
    const nb = /^\d+$/.test(pb[i]);
    if (na && nb) {
      if (+pa[i] !== +pb[i]) return +pa[i] < +pb[i] ? -1 : 1;
    } else if (na !== nb) {
      return na ? -1 : 1;
    } else if (pa[i] !== pb[i]) {
      return pa[i] < pb[i] ? -1 : 1;
    }
  }
  return 0;
}

export function compareSemver(a, b) {
  const x = parseSemver(a);
  const y = parseSemver(b);
  if (!x || !y) return String(a).localeCompare(String(b));
  for (const k of ['major', 'minor', 'patch']) {
    if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1;
  }
  return comparePre(x.pre, y.pre);
}

export function writeJsonAtomic(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  renameSync(tmp, path);
}

export function parseArgs(argv, { flags = [], multi = [] } = {}) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (flags.includes(key)) {
        out[key] = true;
      } else if (multi.includes(key)) {
        (out[key] ||= []).push(argv[++i]);
      } else {
        out[key] = argv[++i];
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

export async function fetchJson(url, { timeoutMs = 20000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json' } });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: res.status, json };
  } finally {
    clearTimeout(t);
  }
}

export function isMain(metaUrl) {
  return process.argv[1] && new URL(metaUrl).pathname === new URL(`file://${process.argv[1]}`).pathname;
}
