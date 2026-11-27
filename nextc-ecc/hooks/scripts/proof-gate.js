#!/usr/bin/env node
/**
 * Proof Gate Hook
 *
 * Sends Claude back once to run the checks that cover its code edits, when it ends a turn (Stop)
 * or marks a task completed (TaskCompleted) with code changed and no passing check since.
 * It never runs a check itself.
 *
 *   record  PostToolUse / PostToolUseFailure: notes code edits and check runs in a per-session
 *           ledger. Never blocks; always exits 0.
 *   stop    Stop: prints additionalContext (non-error feedback) once per edit set.
 *   task    TaskCompleted: exit 2 with a reason on stderr once per edit set, then allows.
 *
 * Off switch: PROOF_GATE=off. Stands down inside /autopilot runs (AUTOPILOT_RUN_DIR).
 * Every error fails open. Debug output: PROOF_GATE_DEBUG=1.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_STDIN = 1024 * 1024;
// MAGIC: the message needs a count and a few names; a refactor's file list stops here.
const CHANGED_MAX = 100;
const CHECKS_MAX = 12;
const LISTED_MAX = 8;
const COMMAND_MAX = 4000;
// MAGIC: a project check pattern is a word or two; a longer one is a mistake or a slow pattern.
const EXTRA_MAX = 200;
const LEDGER_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// EXTERNAL: the patterns below mirror nextc-hud/hooks/lib/proof.ts (CHECKS, NOT_A_RUN, VISUAL_RENDER,
// WRAPPERS, SEPARATORS, SHELL_EDIT, NO_EDIT, NOT_CODE). Plugins cannot share modules; tests/proof-gate.test.mjs fails when they drift.
const END = '(?![\\w:-])';
const CHECKS = [
  [new RegExp(`^flutter[ \\t]+(analyze|test)${END}`), (m) => `flutter ${m[1]}`],
  [new RegExp(`^dart[ \\t]+(analyze|test)${END}`), (m) => `dart ${m[1]}`],
  [new RegExp(`^tsc${END}`), () => 'tsc'],
  [new RegExp(`^(npm|pnpm|yarn|bun)[ \\t]+(?:run[ \\t]+)?(test|lint|typecheck|type-check|check|analyze)${END}`), (m) => `${m[1]} ${m[2]}`],
  [new RegExp(`^(vitest|jest|eslint|pytest|mypy|pyright)${END}`), (m) => m[1]],
  [new RegExp(`^biome[ \\t]+(check|lint)${END}`), (m) => `biome ${m[1]}`],
  [/^prettier[ \t]+(?:\S+[ \t]+)*--check(?![\w-])/, () => 'prettier --check'],
  [new RegExp(`^go[ \\t]+(vet|test)${END}`), (m) => `go ${m[1]}`],
  [new RegExp(`^cargo[ \\t]+(check|test|clippy)${END}`), (m) => `cargo ${m[1]}`],
  [new RegExp(`^ruff[ \\t]+check${END}`), () => 'ruff check'],
  [/^node[ \t]+--test(?![\w-])/, () => 'node --test'],
  [new RegExp(`^(swift|dotnet)[ \\t]+test${END}`), (m) => `${m[1]} test`],
  [new RegExp(`^(?:\\.\\/)?gradlew(?:[ \\t]+\\S+)*?[ \\t]+(?:[\\w-]*:)*(test|lint|check)\\w*${END}`), (m) => `gradlew ${m[1]}`],
  [new RegExp(`^claude[ \\t]+plugin[ \\t]+(test|validate)${END}`), (m) => `claude plugin ${m[1]}`],
  [new RegExp(`^make[ \\t]+(test|lint|check)${END}`), (m) => `make ${m[1]}`],
];
const NOT_A_RUN = /(^|[ \t])(--help|--version|--watch|--fix|--write|-x[ \t]+\w*(test|check|lint)\w*)(?=[ \t=]|$)/;
const VISUAL_RENDER = /^flutter[ \t]+test[ \t]+(?:\S+[ \t]+)*?\S*tool\/visual\//;
const WRAPPERS = /^(?:(?:\w+=\S*|fvm|time|env|npx|bunx|command|bundle[ \t]+exec)[ \t]+)+/;
const SHELL_EDIT = /(^|\|\||&&|;|\||\n)[ \t]*(?:\w+=\S*[ \t]+)*(sed[ \t]+(?:-\w+[ \t]+)*-i|git[ \t]+(?:checkout(?![ \t]+-[bB](?![\w-]))|stash(?![ \t]+(?:list|show)(?![\w-]))|restore|apply|merge|rebase|pull|reset|revert|cherry-pick)(?![\w-])|dart[ \t]+(?:format|fix[ \t]+--apply)|\S+(?:[ \t]+\S+)*[ \t]+(?:--fix|--write)(?![\w-]))/;
const SEPARATORS = /(\|\||&&|(?<![>&])&(?![&>])|;|\||\n)/;
const NO_EDIT = /(^|[ \t])(--check|--dry-run)(?=[ \t=]|$)/;
const NOT_CODE = /\.(md|mdx|txt|rst|png|jpe?g|gif|svg|webp|ico|pdf|lock|csv|arb|wav|mp3)$|(^|\/)(CHANGELOG|LICENSE|README)[^/]*$/i;
const SHELL_EDIT_NAME = '(files changed by a shell command)';

function debug(message, error) {
  if (process.env.PROOF_GATE_DEBUG) console.error(`[ProofGate] ${message}${error ? `: ${error.stack || error}` : ''}`);
}

const unquote = (command) => command.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '""');

/** The checks a command runs. isTrusted: the command's own exit status is the check's. */
function checksOf(command, extra = null) {
  if (typeof command !== 'string' || command.length > COMMAND_MAX) return [];
  const plain = unquote(command);
  const parts = plain.split(SEPARATORS);
  const out = [];
  for (let i = 0; i < parts.length; i += 2) {
    const seg = parts[i].trim().replace(/^[({][ \t]*/, '').replace(WRAPPERS, '');
    if (seg === '' || NOT_A_RUN.test(seg) || VISUAL_RENDER.test(seg)) continue;
    const hit = CHECKS.map(([re, label]) => ({ m: re.exec(seg), label })).find((c) => c.m !== null);
    if (hit === undefined) continue;
    const label = hit.label(hit.m);
    if (label === 'tsc' && /[ \t](-w|--watch)(?=[ \t]|$)/.test(seg)) continue;
    const before = parts.filter((_, k) => k % 2 === 1 && k < i);
    const after = parts.filter((_, k) => k % 2 === 1 && k > i);
    const isTrusted = before.every((op) => op === '&&' || op === ';' || op === '\n') && after.every((op) => op === '&&');
    if (!out.some((c) => c.label === label)) out.push({ label, isTrusted });
  }
  if (out.length === 0 && extra !== null && extra.test(plain)) out.push({ label: 'project check', isTrusted: !/[|;]/.test(plain) });
  return out;
}

const isShellEdit = (command) =>
  typeof command === 'string' && command.length <= COMMAND_MAX && unquote(command).split(SEPARATORS).some((seg, i) => i % 2 === 0 && SHELL_EDIT.test(seg) && !NO_EDIT.test(seg));
const isProse = (file) => NOT_CODE.test(file);

function extraPattern(env) {
  const source = env.PROOF_GATE_EXTRA_CHECKS;
  if (typeof source !== 'string' || source.trim() === '') return null;
  if (source.length > EXTRA_MAX) {
    debug(`PROOF_GATE_EXTRA_CHECKS is longer than ${EXTRA_MAX} characters; ignored`);
    return null;
  }
  try {
    return new RegExp(source.trim());
  } catch (error) {
    debug('PROOF_GATE_EXTRA_CHECKS is not a valid pattern; ignored', error);
    return null;
  }
}

const emptyLedger = () => ({ v: 2, edits: [], checks: [], unseen: [], nudged: null, blocked: {} });

const AGENT_ID = /^[\w.-]{1,128}$/;
const agentOf = (input) => (typeof input.agent_id === 'string' && AGENT_ID.test(input.agent_id) ? input.agent_id : '');

// With an agent, only the edits that agent made; without one, every edit.
const editsOf = (ledger, agent) => (agent === undefined ? ledger.edits : ledger.edits.filter((e) => e.a === agent));

function stateOf(ledger, agent) {
  if (editsOf(ledger, agent).length === 0) return 'none';
  if (ledger.checks.some((c) => !c.ok)) return 'failed';
  return ledger.checks.length > 0 ? 'verified' : 'unverified';
}

function noteEdit(ledger, name, agent) {
  // A passing check covered every earlier edit, so the next edit starts a new list.
  const kept = stateOf(ledger) === 'verified' ? [] : ledger.edits.filter((e) => !(e.f === name && e.a === agent));
  return { ...emptyLedger(), edits: [...kept, { f: name, a: agent }].slice(-CHANGED_MAX) };
}

function noteCheck(ledger, label, ok) {
  const checks = [...ledger.checks.filter((c) => c.label !== label), { label, ok }].slice(-CHECKS_MAX);
  return { ...ledger, checks };
}

function noteUnseen(ledger, label) {
  return ledger.unseen.includes(label) ? ledger : { ...ledger, unseen: [...ledger.unseen, label].slice(-CHECKS_MAX) };
}

function ledgerDir(env = process.env) {
  // EXTERNAL: nextc-hud reads this folder (gateLedgerPath in hooks/lib/proof.ts) to stand its own proof follow-up
  // down, and a mod cannot see environment variables, so it is always under ~/.claude and CLAUDE_CONFIG_DIR is ignored.
  // CLAUDE_PLUGIN_DATA is not used because the HUD cannot find it.
  return path.join(env.HOME || os.homedir(), '.claude', 'nextc-proof-gate');
}

// SECURITY: the session id names a file, so only plain id characters are accepted.
const SESSION_ID = /^[\w.-]{1,128}$/;
function ledgerPath(sessionId, env = process.env) {
  return typeof sessionId === 'string' && SESSION_ID.test(sessionId) && !/^\.+$/.test(sessionId) ? path.join(ledgerDir(env), `${sessionId}.json`) : null;
}

// The raw path is kept so the gate can tell files apart and see a deleted one; only control characters are refused.
const STORABLE_NAME = /^[^\u0000-\u001f\u007f]{1,1024}$/;
// SECURITY: a name quoted to Claude may hold letters, digits and the punctuation real project paths use (spaces,
// brackets and parentheses of route folders, `~`, `$`, `#`), but no backtick, quote, angle bracket, shell operator
// or newline, so a file name cannot carry an instruction.
const SHOWN_NAME = /^[\p{L}\p{N}_@.+/ ()[\]~$#,=-]{1,300}$/u;
const PLAIN_LABEL = /^[\w .:@/+-]{1,60}$/;
const UNUSUAL_NAME = '(file with an unusual name)';

// SECURITY: the ledger text reaches Claude as an instruction, so labels outside plain characters are dropped and
// names with control characters replaced when it is read, whatever wrote the file; names are filtered again when shown.
function readLedger(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!raw || raw.v !== 2 || !Array.isArray(raw.edits) || !Array.isArray(raw.checks) || !Array.isArray(raw.unseen)) return null;
    const blocked = raw.blocked && typeof raw.blocked === 'object' && !Array.isArray(raw.blocked) ? raw.blocked : {};
    return {
      v: 2,
      edits: raw.edits
        .filter((e) => e && typeof e.f === 'string')
        .map((e) => ({ f: STORABLE_NAME.test(e.f) ? e.f : UNUSUAL_NAME, a: typeof e.a === 'string' && AGENT_ID.test(e.a) ? e.a : '' })),
      checks: raw.checks.filter((c) => c && typeof c.label === 'string' && PLAIN_LABEL.test(c.label)).map((c) => ({ label: c.label, ok: c.ok === true })),
      unseen: raw.unseen.filter((l) => typeof l === 'string' && PLAIN_LABEL.test(l)),
      nudged: raw.nudged === 'unverified' || raw.nudged === 'failed' ? raw.nudged : null,
      blocked: Object.fromEntries(Object.entries(blocked).filter(([k, v]) => (k === '' || AGENT_ID.test(k)) && (v === 'unverified' || v === 'failed'))),
    };
  } catch (error) {
    if (error && error.code !== 'ENOENT') debug(`cannot read ${file}`, error);
    return null;
  }
}

function pruneOld(dir, now) {
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    try {
      if (now - fs.statSync(file).mtimeMs > LEDGER_TTL_MS) fs.unlinkSync(file);
    } catch (error) {
      debug(`cannot prune ${file}`, error);
    }
  }
}

function writeLedger(file, ledger, now = Date.now()) {
  const dir = path.dirname(file);
  const isNewLedger = !fs.existsSync(file);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(ledger), { mode: 0o600 });
  fs.renameSync(tmp, file);
  if (isNewLedger) pruneOld(dir, now);
}

function parseInput(raw) {
  if (typeof raw !== 'string') return raw && typeof raw === 'object' ? raw : {};
  try {
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (error) {
    debug('bad stdin JSON', error);
    return {};
  }
}

const isStandingDown = (env) => env.PROOF_GATE === 'off' || Boolean(env.AUTOPILOT_RUN_DIR);

// The real path of `p`, resolving links through its nearest existing ancestor, so `/tmp/x` and `/private/tmp/x`
// (macOS) or a linked folder compare equal even before the file exists.
function realPath(p) {
  const tail = [];
  let current = path.resolve(p);
  for (;;) {
    try {
      return path.join(fs.realpathSync(current), ...tail);
    } catch {
      // Not there yet: resolve the parent and keep this part as written.
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(p);
      tail.unshift(path.basename(current));
      current = parent;
    }
  }
}

// The session's scratchpad holds throwaway scripts and notes, not the project's code.
function isScratch(file, input) {
  const dir = input.scratchpad_dir;
  return typeof dir === 'string' && dir !== '' && realPath(file).startsWith(`${realPath(dir)}${path.sep}`);
}

/** Applies one PostToolUse / PostToolUseFailure payload to a ledger. Returns the new ledger, or null for no change. */
function applyToolEvent(ledger, input, extra = null) {
  const tool = input.tool_name;
  const toolInput = input.tool_input || {};
  if (tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit' || tool === 'NotebookEdit') {
    if (input.hook_event_name === 'PostToolUseFailure') return null;
    const file = toolInput.file_path || toolInput.notebook_path;
    return typeof file === 'string' && file !== '' && !isProse(file) && !isScratch(file, input) ? noteEdit(ledger, file, agentOf(input)) : null;
  }
  if (tool !== 'Bash') return null;
  const command = toolInput.command;
  const isFailure = input.hook_event_name === 'PostToolUseFailure';
  // ASSUMPTION: PostToolUse fires only for a command that succeeded and PostToolUseFailure for one that exited
  // non-zero, with the error starting "Exit code N" (code.claude.com/docs/en/hooks, 2026-11-18). Anything else,
  // an interrupt, a background run or a payload of another shape, counts as a check that ran but was not seen.
  const response = input.tool_response;
  const isInterrupted = input.is_interrupt === true || Boolean(response && typeof response === 'object' && response.interrupted === true);
  const isSeen = !isInterrupted && toolInput.run_in_background !== true && (isFailure ? typeof input.error === 'string' && /^Exit code \d+/.test(input.error) : true);
  let next = ledger;
  let isChanged = false;
  for (const check of checksOf(command, extra)) {
    isChanged = true;
    next = isSeen && check.isTrusted ? noteCheck(next, check.label, !isFailure) : noteUnseen(next, check.label);
  }
  // ORDER: a shell edit is noted after the checks of the same command, so a check in that command does not count.
  if (!isFailure && isShellEdit(command)) {
    next = noteEdit(next, SHELL_EDIT_NAME, agentOf(input));
    isChanged = true;
  }
  return isChanged ? next : null;
}

function record(inputOrRaw, options = {}) {
  const env = options.env || process.env;
  try {
    if (isStandingDown(env)) return { exitCode: 0 };
    const input = parseInput(inputOrRaw);
    const file = ledgerPath(input.session_id, env);
    if (!file) return { exitCode: 0 };
    const current = readLedger(file) || emptyLedger();
    // ASSUMPTION: parallel tool calls can race this read-modify-write; a lost update can drop an edit or let one extra nudge
    // through, and never blocks anything.
    const next = applyToolEvent(current, input, extraPattern(env));
    if (next) writeLedger(file, next, options.now);
  } catch (error) {
    debug('record failed, failing open', error);
  }
  return { exitCode: 0 };
}

// A turn that ends by asking the user something is waiting on them, not finished.
function endsWithQuestion(message) {
  return typeof message === 'string' && /\?[\s"'`)\]*_]*$/.test(message.trim());
}

const codeFiles = (n) => `${n} code file${n === 1 ? '' : 's'}`;
const checkList = (ledger) => ledger.checks.map((c) => `${c.label} ${c.ok ? 'passed' : 'FAILED'}`).join(', ');

// SECURITY: file names are text Claude chose and this message is one Claude acts on, so only names made of
// ordinary path characters (SHOWN_NAME) are quoted; the rest are counted.
function describe(edits, cwd) {
  const names = [...new Set(edits.map((e) => e.f).reverse())];
  const base = typeof cwd === 'string' ? cwd.replace(/[/\\]+$/, '') : '';
  const shown = names
    .map((p) => (base && p.startsWith(`${base}${path.sep}`) ? p.slice(base.length + 1) : p))
    .filter((p) => SHOWN_NAME.test(p))
    .slice(0, LISTED_MAX);
  const rest = names.length - shown.length;
  const quoted = shown.map((p) => `\`${p}\``).join(', ');
  const more = rest > 0 ? `${quoted === '' ? '' : ' and '}${rest} ${quoted === '' ? '' : 'more '}file${rest === 1 ? '' : 's'}` : '';
  return `${quoted}${more}` || 'the code';
}

function reason(ledger, edits, state, cwd) {
  const lead =
    state === 'failed'
      ? `A check failed and was not re-run after changes to ${describe(edits, cwd)} (${checkList(ledger)}).`
      : `${codeFiles(new Set(edits.map((e) => e.f)).size)} changed (${describe(edits, cwd)}, newest first) and no check passed since the last edit.`;
  const seen = ledger.unseen.length === 0 ? '' : ' Run each check as its own command, not piped, chained with ";" or in the background, so its result can be seen.';
  return `${lead}${seen} Run the analyzer or type check and the tests that cover what changed (no product builds, simulators or full suites unless the user asked), then report each command with its result, or say why no check applies.`;
}

function gate(kind, inputOrRaw, options = {}) {
  const env = options.env || process.env;
  const exists = options.exists || fs.existsSync;
  try {
    if (isStandingDown(env)) return { exitCode: 0 };
    const input = parseInput(inputOrRaw);
    if (kind === 'stop') {
      if (input.stop_hook_active === true) return { exitCode: 0 };
      // A subagent or teammate that is still running may be editing, so the turn is not over. A background shell
      // command (a dev server, a watcher) does not count: it can run all session and would silence the gate for good.
      const running = Array.isArray(input.background_tasks) && input.background_tasks.some((t) => t && t.status === 'running' && t.type !== 'shell');
      if (running || endsWithQuestion(input.last_assistant_message)) return { exitCode: 0 };
    }
    const file = ledgerPath(input.session_id, env);
    if (!file) return { exitCode: 0 };
    const recorded = readLedger(file);
    if (!recorded) return { exitCode: 0 };
    // A file edited and then deleted needs no check; the shell-edit marker names no file.
    const ledger = { ...recorded, edits: recorded.edits.filter((e) => e.f === SHELL_EDIT_NAME || e.f === UNUSUAL_NAME || exists(e.f)) };
    // Stop ends the main session's turn, so it counts every edit; a task counts only the completing agent's own.
    const agent = kind === 'task' ? agentOf(input) : undefined;
    const state = stateOf(ledger, agent);
    if (state !== 'unverified' && state !== 'failed') return { exitCode: 0 };
    if ((kind === 'stop' ? ledger.nudged : ledger.blocked[agent]) === state) return { exitCode: 0 };
    const marked = kind === 'stop' ? { ...ledger, nudged: state } : { ...ledger, blocked: { ...Object.fromEntries(Object.entries(ledger.blocked).slice(-19)), [agent]: state } };
    writeLedger(file, marked, options.now);
    const text = reason(ledger, editsOf(ledger, agent), state, input.cwd);
    if (kind === 'stop') return { exitCode: 0, stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: 'Stop', additionalContext: text } }) };
    return { exitCode: 2, stderr: `Task not done yet: ${text}` };
  } catch (error) {
    debug(`${kind} failed, failing open`, error);
    return { exitCode: 0 };
  }
}

const run = (mode, inputOrRaw, options) => (mode === 'record' ? record(inputOrRaw, options) : gate(mode, inputOrRaw, options));

if (require.main === module) {
  const mode = process.argv[2];
  let raw = '';
  let tooLong = false;
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    if (raw.length + chunk.length > MAX_STDIN) tooLong = true;
    else raw += chunk;
  });
  process.stdin.on('end', () => {
    const result = mode === 'record' || mode === 'stop' || mode === 'task' ? (tooLong ? { exitCode: 0 } : run(mode, raw)) : { exitCode: 0 };
    if (result.stdout) process.stdout.write(`${result.stdout}\n`);
    if (result.stderr) process.stderr.write(`${result.stderr}\n`);
    process.exit(result.exitCode);
  });
}

module.exports = { run, record, gate, checksOf, isShellEdit, isProse, extraPattern, applyToolEvent, stateOf, emptyLedger, readLedger, ledgerPath, ledgerDir, endsWithQuestion, CHECKS, SHELL_EDIT_NAME };
