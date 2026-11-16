// Shared helpers for the nextc-aso scripts. No dependencies; Node 18+.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const isoNow = (now = Date.now()) => new Date(now).toISOString();

// Parses `cmd positional... --flag value --bool` into { _: [...], flag: value, bool: true }.
export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) { out[a.slice(2, eq)] = a.slice(eq + 1); continue; }
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else { out[key] = next; i++; }
    } else {
      out._.push(a);
    }
  }
  return out;
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
  return file;
}

export function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

export const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 24);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Code points, not UTF-16 units: an emoji or a supplementary CJK character counts once.
export const charCount = (s) => [...(s ?? '')].length;
export const byteCount = (s) => Buffer.byteLength(s ?? '', 'utf8');

export function normalizeText(s) {
  return (s ?? '').normalize('NFKC').toLowerCase();
}

// Splits on anything that is not a letter, mark or number, so "Habit-Tracker: Daily" → [habit, tracker, daily].
export function words(s) {
  return normalizeText(s).split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
}

export function die(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

// SECURITY: secrets (API keys, private keys, bearer tokens) must never reach stdout, stderr or a file.
// Everything the scripts print about a failed request goes through this filter first.
export function redact(text) {
  return String(text)
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, '[redacted key]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted]')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[redacted jwt]')
    .replace(/"private_key"\s*:\s*"[^"]*"/g, '"private_key":"[redacted]"');
}

// Loads a key either from a file path or from an environment variable that holds the key text
// or a path to it. Returns the key text; never logs it.
export function loadSecret({ keyFile, keyEnv, env = process.env, cwd = process.cwd(), warn = (m) => process.stderr.write(m + '\n') }) {
  let text;
  let file;
  if (keyFile) {
    file = path.resolve(cwd, keyFile);
  } else if (keyEnv) {
    const v = env[keyEnv];
    if (!v) throw new Error(`Environment variable ${keyEnv} is not set.`);
    if (/^\s*[{-]/.test(v)) text = v;
    else file = path.resolve(cwd, v);
  } else {
    throw new Error('No key given: pass --key-file <path> or --key-env <VARIABLE_NAME>.');
  }
  if (file) {
    if (!fs.existsSync(file)) throw new Error(`Key file not found: ${file}`);
    // SECURITY: a key inside the project tree is one `git add -A` away from being committed.
    const rel = path.relative(cwd, file);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
      warn(`Warning: the key file is inside the project (${rel}). Move it outside the repository, or make sure it is gitignored.`);
    }
    text = fs.readFileSync(file, 'utf8');
  }
  return text;
}

// Cross-process pacing: every network call waits until `minGapMs` after the previous one,
// so parallel workers sharing one data dir stay under the endpoint's rate limit together.
export async function pace(dir, minGapMs, { now = () => Date.now(), wait = sleep } = {}) {
  if (!minGapMs) return;
  fs.mkdirSync(dir, { recursive: true });
  const lock = path.join(dir, '.pace.lock');
  const stamp = path.join(dir, '.pace');
  // MAGIC: a lock older than 30 s belongs to a crashed process; take it over.
  const STALE_LOCK_MS = 30_000;
  for (;;) {
    try {
      fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
      break;
    } catch {
      try {
        if (now() - fs.statSync(lock).mtimeMs > STALE_LOCK_MS) fs.rmSync(lock, { force: true });
      } catch { /* lock vanished between calls: retry */ }
      await wait(150);
    }
  }
  try {
    let last = 0;
    try { last = Number(fs.readFileSync(stamp, 'utf8')) || 0; } catch { last = 0; }
    const gap = last + minGapMs - now();
    if (gap > 0) await wait(gap);
    fs.writeFileSync(stamp, String(now()));
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

// Wraps a fetcher with a file cache. Returns { body, retrievedAt, fromCache }.
export async function cachedGet(url, { cacheDir, ttlMs, fetcher, paceMs = 0, now = () => Date.now(), noCache = false }) {
  const file = path.join(cacheDir, `${sha(url)}.json`);
  if (!noCache && fs.existsSync(file)) {
    const hit = readJson(file);
    if (now() - Date.parse(hit.retrievedAt) < ttlMs) return { body: hit.body, retrievedAt: hit.retrievedAt, fromCache: true };
  }
  await pace(cacheDir, paceMs, { now });
  const res = await fetcher(url);
  if (res.status !== 200) {
    const err = new Error(`HTTP ${res.status} for ${url}`);
    err.status = res.status;
    throw err;
  }
  const retrievedAt = isoNow(now());
  writeJson(file, { url, retrievedAt, body: res.body });
  return { body: res.body, retrievedAt, fromCache: false };
}

export async function defaultFetcher(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { 'user-agent': 'nextc-aso/1 (+store research)', ...(init.headers || {}) } });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

export function toCsv(rows, columns) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(','), ...rows.map((r) => columns.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x !== ''));
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ''])));
}

// Runs main() only when the file is executed directly, so tests can import the module.
export function isMain(metaUrl) {
  return Boolean(process.argv[1]) && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(metaUrl));
}
