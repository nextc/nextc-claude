#!/usr/bin/env node
/**
 * Fact-Forcing Guard
 *
 * PreToolUse hook. Instead of asking "are you sure?" (LLMs always say yes), it
 * DENIES a risky action once and demands concrete facts first — the act of
 * investigating creates awareness that self-confidence does not. The denied
 * action is recorded per session, so the immediate retry (after facts are
 * stated) is allowed.
 *
 * Two gates:
 *   - Destructive Bash (DEFAULT ON): rm -rf, git reset --hard / clean -f /
 *     push --force / checkout -- / commit --amend / switch --force, and
 *     drop/truncate/delete-from/dd. Demands: targets + one-line rollback +
 *     the user's verbatim instruction.
 *   - First-touch Edit/Write (DEFAULT OFF — set FACT_FORCE_EDITS=1): demands
 *     importers, affected API, and data-schema facts before the first edit of a
 *     file. Off by default because the harness already requires a Read before
 *     an Edit, so a blanket edit gate is high-friction for most sessions.
 *
 * Block contract matches config-protection.js: exit 2 + stderr message.
 * Disable entirely with FACT_FORCE_GUARD=off.
 *
 * Source: destructive-command detection + fact-forcing idea from affaan-m/ecc
 * scripts/hooks/gateguard-fact-force.js (MIT), reimplemented compactly (no
 * subshell-BFS lib). Limitation: destructive commands hidden inside nested
 * $(...) / backtick substitutions may not be detected — by design, kept simple.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const MAX_STDIN = 1024 * 1024;

function isOff() {
  return /^(0|false|no|off|disabled)$/i.test(String(process.env.FACT_FORCE_GUARD || '').trim());
}
function editsGateOn() {
  return /^(1|true|yes|on|enabled)$/i.test(String(process.env.FACT_FORCE_EDITS || '').trim());
}

function statePath(sessionId) {
  return path.join(os.tmpdir(), `claude-factforce-${sessionId}.json`);
}
function loadChecked(sessionId) {
  try {
    const s = JSON.parse(fs.readFileSync(statePath(sessionId), 'utf8'));
    return Array.isArray(s.checked) ? s.checked : [];
  } catch {
    return [];
  }
}
function markChecked(sessionId, key) {
  const checked = loadChecked(sessionId);
  if (checked.includes(key)) return;
  checked.push(key);
  const target = statePath(sessionId);
  const tmp = `${target}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify({ checked: checked.slice(-500) }), 'utf8');
    fs.renameSync(tmp, target);
  } catch {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

// --- destructive command detection (quote-strip + segment split) -----------

const SQL_DD = /\b(drop\s+table|delete\s+from|truncate|dd\s+if=)\b/i;

function stripQuotes(s) {
  return s.replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');
}
function segments(cmd) {
  return stripQuotes(String(cmd || '')).split(/[;|&\n]+/).map((x) => x.trim()).filter(Boolean);
}
function tokens(seg) {
  return seg.split(/\s+/).filter(Boolean);
}
function base(tok) {
  return String(tok || '').replace(/^.*[\\/]/, '').replace(/\.exe$/i, '').toLowerCase();
}
function destructiveRm(t) {
  if (base(t[0]) !== 'rm') return false;
  let r = false, f = false;
  for (const a of t.slice(1)) {
    if (a === '--recursive') r = true;
    else if (a === '--force') f = true;
    else if (a.startsWith('-') && !a.startsWith('--')) { if (/[rR]/.test(a)) r = true; if (/f/.test(a)) f = true; }
  }
  return r && f;
}
function destructiveGit(t) {
  if (base(t[0]) !== 'git') return false;
  const sub = (t.slice(1).find((x) => !x.startsWith('-')) || '').toLowerCase();
  if (!sub) return false;
  const args = t.slice(t.indexOf(sub) + 1);
  if (sub === 'reset') return args.includes('--hard');
  if (sub === 'clean') return args.some((a) => a === '--force' || (a.startsWith('-') && !a.startsWith('--') && a.includes('f')));
  if (sub === 'checkout') return args.some((a) => a === '--' || a === '.' || a === '--force' || (a.startsWith('-') && !a.startsWith('--') && a.includes('f')));
  if (sub === 'switch') return args.some((a) => a === '--discard-changes' || a === '--force' || (a.startsWith('-') && !a.startsWith('--') && /[fC]/.test(a)));
  if (sub === 'commit') return args.includes('--amend');
  if (sub === 'push') {
    const lease = args.some((a) => a === '--force-with-lease' || a.startsWith('--force-with-lease='));
    const force = args.some((a) => a === '--force' || (a.startsWith('-') && !a.startsWith('--') && a.includes('f')));
    return force && !lease;
  }
  return false;
}
function isDestructive(cmd) {
  const flat = stripQuotes(String(cmd || ''));
  if (SQL_DD.test(flat)) return true;
  for (const seg of segments(cmd)) {
    const t = tokens(seg);
    if (destructiveRm(t) || destructiveGit(t)) return true;
  }
  return false;
}

// --- messages --------------------------------------------------------------

function destructiveMsg() {
  return [
    '[Fact-Forcing Gate] Destructive command detected. Before running it, state:',
    '  1. Exactly which files/data/refs it will modify or delete',
    '  2. A one-line rollback procedure',
    "  3. The user's current instruction, verbatim",
    'Then retry the same command. (Disable: FACT_FORCE_GUARD=off)',
  ].join('\n');
}
function editMsg(fp) {
  return [
    `[Fact-Forcing Gate] Before the first edit of ${fp}, state:`,
    '  1. Which files import/require it (Grep)',
    '  2. The public functions/classes this change affects',
    '  3. If it reads/writes data, the field names/structure (synthetic values, not production data)',
    'Then retry. (This gate is opt-in: unset FACT_FORCE_EDITS to disable.)',
  ].join('\n');
}

function evaluate(rawInput) {
  let input;
  try {
    input = rawInput.trim() ? JSON.parse(rawInput) : {};
  } catch {
    return { exitCode: 0 };
  }
  const sessionId =
    String(input.session_id || process.env.CLAUDE_SESSION_ID || 'default').replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
  const toolName = input.tool_name || '';
  const ti = input.tool_input || {};

  if (toolName === 'Bash') {
    const cmd = ti.command || '';
    if (!isDestructive(cmd)) return { exitCode: 0 };
    const key = 'destructive:' + crypto.createHash('sha256').update(cmd).digest('hex').slice(0, 16);
    if (loadChecked(sessionId).includes(key)) return { exitCode: 0 }; // retry allowed
    markChecked(sessionId, key);
    return { exitCode: 2, stderr: destructiveMsg() };
  }

  if ((toolName === 'Edit' || toolName === 'Write') && editsGateOn()) {
    const fp = ti.file_path || '';
    if (!fp) return { exitCode: 0 };
    const key = 'file:' + fp;
    if (loadChecked(sessionId).includes(key)) return { exitCode: 0 };
    markChecked(sessionId, key);
    return { exitCode: 2, stderr: editMsg(fp) };
  }

  return { exitCode: 0 };
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { if (raw.length < MAX_STDIN) raw += c.substring(0, MAX_STDIN - raw.length); });
process.stdin.on('end', () => {
  let result = { exitCode: 0 };
  try {
    if (!isOff()) result = evaluate(raw);
  } catch (err) {
    console.error('[FactForceGuard] Error:', err && err.message);
  }
  if (result.stderr) process.stderr.write(result.stderr + '\n');
  if (result.exitCode === 2) process.exit(2);
  process.stdout.write(raw);
  process.exit(0);
});

module.exports = { evaluate, isDestructive };
