#!/usr/bin/env node
// Hooks for an autopilot run. autopilot-run.mjs registers them through --settings, so they
// exist only inside that run, never in a normal session.
//   node autopilot-hooks.mjs guard  PreToolUse, every tool: kill switch + file-tool scope
//   node autopilot-hooks.mjs stop   Stop: keep working while steps remain
// EXTERNAL: AUTOPILOT_RUN_DIR, AUTOPILOT_ROOT and AUTOPILOT_STATE_DIR are set by autopilot-run.mjs.
// Errors go to stderr unconditionally: these hooks run in the user's own terminal session, so
// there is no release build to strip them from.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const RUN_DIR = process.env.AUTOPILOT_RUN_DIR;
const ROOT = process.env.AUTOPILOT_ROOT;
const STATE_DIR = process.env.AUTOPILOT_STATE_DIR;
const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const READ_TOOLS = new Set(['Read', 'Glob', 'Grep']);
const TERMINAL = new Set(['done', 'blocked', 'hard-stop', 'skipped']);
// Files that configure Claude Code itself. Writing them would let the run widen its own sandbox,
// add hooks or MCP servers, or rewrite git's hooks.
const PROTECTED = [/(^|\/)\.claude(\/|$)/, /(^|\/)\.mcp\.json$/, /(^|\/)\.git(\/|$)/];

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`[autopilot-hooks readJson] could not parse ${p}: ${err.stack || err}`);
    return null;
  }
}

const deny = (reason) => {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
  }));
};

// The real location a write to `abs` lands on: every symlink resolved, including the last
// component and links that don't resolve yet. Returns null for a dangling link.
function realTarget(abs) {
  const tail = [];
  let p = abs;
  for (;;) {
    let st = null;
    try { st = fs.lstatSync(p); } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    if (st) {
      if (st.isSymbolicLink() && !fs.existsSync(p)) return null;
      return path.join(fs.realpathSync(p), ...tail);
    }
    if (p === path.dirname(p)) return path.join(p, ...tail);
    tail.unshift(path.basename(p));
    p = path.dirname(p);
  }
}

// Returns a reason to deny, or null when the path is inside the clone and writable.
function checkFilePath(raw, root) {
  // SECURITY: only absolute paths with no `..` segments, so `~` expansion or a `..` the tool
  // normalizes differently from path.resolve can't move the write out of the clone.
  if (!raw || !path.isAbsolute(raw)) return `Autopilot: file paths must be absolute (got "${raw}").`;
  if (raw.split(/[\\/]/).includes('..')) return `Autopilot: file paths must not contain ".." (got "${raw}").`;
  const target = realTarget(raw);
  if (!target) return `Autopilot: ${raw} is a symlink that doesn't resolve.`;
  if (target !== root && !target.startsWith(root + path.sep)) return `Autopilot: ${target} is outside the run's clone ${root}. Autopilot may only change files inside it.`;
  const rel = path.relative(root, target);
  if (PROTECTED.some((re) => re.test(rel))) return `Autopilot: ${rel} configures Claude Code or git, and the run may not change it.`;
  return null;
}

function guard(input) {
  const root = fs.realpathSync(ROOT);
  const raw = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (fs.existsSync(path.join(STATE_DIR, 'STOP'))) {
    // SECURITY: after STOP only reading and writing the run's own records is allowed, so the
    // run can log the stop and write its report but start nothing new.
    if (READ_TOOLS.has(input.tool_name)) return;
    const runDir = fs.realpathSync(RUN_DIR);
    if (FILE_TOOLS.has(input.tool_name) && !checkFilePath(raw, root) && realTarget(raw).startsWith(runDir + path.sep)) return;
    deny('Autopilot was stopped by the user (STOP file). Do not start new work: log the stop in ledger.md, write report.md (it stays uncommitted), and end.');
    return;
  }
  if (!FILE_TOOLS.has(input.tool_name)) return;
  // SECURITY: file tools run outside the OS sandbox, so this check is what keeps edits inside
  // the clone. Shell commands are confined by the sandbox itself.
  const reason = checkFilePath(raw, root);
  if (reason) deny(reason);
}

function stop(input) {
  if (fs.existsSync(path.join(STATE_DIR, 'STOP'))) return;
  const statePath = path.join(RUN_DIR, 'state.json');
  const state = readJson(statePath);
  const open = state?.steps?.filter((s) => !TERMINAL.has(s.status)) ?? null;
  if (open && open.length === 0 && fs.existsSync(path.join(RUN_DIR, 'report.md'))) return;

  // ORDER: compare against the fingerprint taken at the previous block. With no change to the
  // ledger or the step states since then, the run is stuck, and blocking again would loop.
  const ledger = path.join(RUN_DIR, 'ledger.md');
  const fingerprint = crypto.createHash('sha256')
    .update(fs.existsSync(ledger) ? fs.readFileSync(ledger) : '')
    .update(fs.existsSync(statePath) ? fs.readFileSync(statePath) : '')
    .digest('hex');
  const markFile = path.join(STATE_DIR, 'stop-hook.json');
  if (input.stop_hook_active && readJson(markFile)?.fingerprint === fingerprint) return;
  fs.writeFileSync(markFile, JSON.stringify({ fingerprint }));

  const next = !open ? 'state.json is missing or not valid JSON: repair it from the ledger before anything else.'
    : open.length ? `Steps not finished: ${open.map((s) => `${s.id} (${s.status})`).join(', ')}.`
      : 'All steps are finished but report.md is missing.';
  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason: `Autopilot run is not done. ${next} Nobody is watching this session: do not ask the user or wait for an answer. Continue with the autopilot skill's run mode (route open questions to autopilot-decider, log each one in ledger.md). If you cannot continue a step, mark it blocked in state.json with the reason and a ledger entry, then go on.`,
  }));
}

try {
  if (!RUN_DIR || !ROOT || !STATE_DIR) throw new Error('AUTOPILOT_RUN_DIR / AUTOPILOT_ROOT / AUTOPILOT_STATE_DIR not set');
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  if (process.argv[2] === 'stop') stop(input); else guard(input);
} catch (err) {
  console.error(`[autopilot-hooks ${process.argv[2]}] ${err.stack || err}`);
  // SECURITY: the guard fails closed. A crash must not let a file tool write outside the clone.
  if (process.argv[2] !== 'stop') deny(`Autopilot guard hook failed (${err.message}); the action was blocked to stay safe.`);
}
