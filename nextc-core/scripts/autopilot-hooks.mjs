#!/usr/bin/env node
// Hooks for an autopilot run. autopilot-run.mjs registers them through --settings, so they
// exist only inside that run, never in a normal session.
//   node autopilot-hooks.mjs guard  PreToolUse, every tool: kill switch, file-tool scope, hard-stop commands, deploy gate
//   node autopilot-hooks.mjs stop   Stop: keep working while steps remain
// EXTERNAL: AUTOPILOT_RUN_DIR, AUTOPILOT_ROOT and AUTOPILOT_STATE_DIR are set by autopilot-run.mjs.
// Errors go to stderr unconditionally: these hooks run in the user's own terminal session, so
// there is no release build to strip them from.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

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

// Splits a shell command into simple commands, each a list of words with quotes removed. A
// command or process substitution becomes a command of its own. Not a full shell parser:
// redirection targets, heredoc bodies and globs stay as plain words.
function splitCommands(src) {
  const cmds = [];
  const saved = [];
  let words = [];
  let word = null;
  let dq = false;
  const endWord = () => { if (word !== null) words.push(word); word = null; };
  const endCmd = () => { endWord(); if (words.length) cmds.push(words); words = []; };
  const openSub = (closer) => { saved.push({ words, word, dq, closer }); words = []; word = null; dq = false; };
  const closeSub = () => { endCmd(); ({ words, word, dq } = saved.pop()); word = word ?? ''; };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const top = saved.at(-1);
    if (c === '\\') { word = (word ?? '') + (src[i + 1] ?? ''); i++; continue; }
    if (c === '`') { if (top?.closer === '`' && !dq) closeSub(); else openSub('`'); continue; }
    if (c === '$' && src[i + 1] === '(') { openSub(')'); i++; continue; }
    if (dq) { if (c === '"') dq = false; else word = (word ?? '') + c; continue; }
    if (c === '"') { dq = true; word = word ?? ''; continue; }
    if (c === "'") {
      const end = src.indexOf("'", i + 1);
      word = (word ?? '') + src.slice(i + 1, end < 0 ? src.length : end);
      i = end < 0 ? src.length : end;
      continue;
    }
    if (c === '#' && word === null) { while (i < src.length && src[i] !== '\n') i++; endCmd(); continue; }
    if (c === ')' && top?.closer === ')') { closeSub(); continue; }
    if (';&|\n()'.includes(c)) { endCmd(); continue; }
    if (/\s/.test(c) || c === '<' || c === '>') { endWord(); continue; }
    word = (word ?? '') + c;
  }
  while (saved.length) closeSub();
  endCmd();
  return cmds;
}

// Commands that run the rest of their words as another command. Their own options may take
// values, so every suffix is checked rather than guessing where the inner command starts.
const WRAPPERS = new Set(['sudo', 'env', 'command', 'exec', 'nohup', 'time', 'nice', 'timeout', 'xargs', 'npx', 'bunx', 'xcrun', 'caffeinate']);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
const GIT_VALUE_OPTS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env', '--super-prefix']);
const GIT_COMMON = new Set(['status', 'log', 'diff', 'show', 'add', 'commit', 'restore', 'switch', 'checkout', 'branch', 'tag', 'merge', 'rebase', 'reset', 'stash', 'rev-parse', 'ls-files', 'grep', 'blame', 'fetch', 'pull', 'clone', 'init', 'mv', 'rm', 'config', 'remote', 'describe', 'cherry-pick', 'revert', 'clean', 'worktree', 'check-ignore', 'shortlog', 'reflog', 'apply', 'format-patch', 'notes', 'bisect', 'submodule', 'help', 'version']);
// Store uploads stay a hard stop: the user approves each one by hand. release_testflight is
// the nextc-flutter fastlane lane.
const FASTLANE_STORE = new Set(['pilot', 'deliver', 'supply', 'upload_to_testflight', 'upload_to_app_store', 'upload_to_play_store', 'release_testflight']);
const PUBLISHERS = new Set(['npm', 'pnpm', 'yarn', 'bun', 'cargo', 'dart', 'flutter']);
const GH_DENIED = new Set(['pr', 'api', 'release', 'repo']);

const firstArg = (args) => args.find((a) => !a.startsWith('-'));

function gitAlias(name) {
  try {
    return execFileSync('git', ['-C', ROOT, 'config', '--get', `alias.${name}`], { encoding: 'utf8' }).trim();
  } catch (err) {
    // git exits 1 when the alias doesn't exist; anything else is a real failure.
    if (err.status === 1) return null;
    throw err;
  }
}

let deploys;
// The deploy steps' commands and scripts, from the approved config plan mode wrote.
function approvedDeploys() {
  deploys ??= readJson(path.join(STATE_DIR, 'approved.json'))?.deploys ?? [];
  return deploys;
}

// By file name, so `cd scripts && ./deploy.sh` matches too; only executed words are compared.
const isScript = (word, script) => word !== '' && path.basename(word) === path.basename(script);

// Returns the deploy entry that `w` runs, or null. A script counts only where it is executed
// (first word, or the file a shell or `source` runs), so reading it with cat or grep is allowed.
function deployRun(w) {
  const name = path.basename(w[0]);
  const runs = [w[0]];
  // `sh -n` only checks syntax, so it is reading, not running.
  const syntaxOnly = SHELLS.has(name) && w.slice(1).some((a) => /^-[a-z]*n[a-z]*$/.test(a));
  if ((SHELLS.has(name) && !syntaxOnly) || name === 'source' || name === '.') runs.push(w.slice(1).find((a) => !a.startsWith('-')) ?? '');
  for (const d of approvedDeploys()) {
    if ((d.commands ?? []).some((c) => { const cw = c.split(/\s+/); return cw.every((x, i) => w[i] === x); })) return d;
    if ((d.scripts ?? []).some((s) => runs.some((r) => isScript(r, s)))) return d;
  }
  return null;
}

// SECURITY: a deploy or rollback is outward-facing, so it runs only after the compatibility check
// passed. state.json is the run's own file: this stops accidents, such as a dry run in the wrong
// folder, not a run set on deploying. Commands a deploy script runs as child processes aren't seen.
function deployGate(w) {
  const d = deployRun(w);
  if (!d) return null;
  const step = readJson(path.join(RUN_DIR, 'state.json'))?.steps?.find((s) => s.id === d.step);
  if (step?.status === 'in_progress' && step.gate === 'pass') return null;
  return `Autopilot: "${w.join(' ')}" deploys or rolls back ${d.step}. It runs only after the compatibility check passes: gather the evidence by reading the code, log the DEPLOY entry, then set "gate": "pass" on ${d.step} in state.json. Never run it to collect evidence.`;
}

// Returns a reason to deny one simple command, or null.
function checkWords(words, depth) {
  if (depth > 8) return 'Autopilot: the command nests too deeply to check.';
  let w = words;
  while (w.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0])) {
    if (/^GIT_CONFIG_/.test(w[0])) return 'Autopilot: setting git config through the environment is blocked, because it can define an alias for push.';
    w = w.slice(1);
  }
  if (!w.length) return null;
  const gated = deployGate(w);
  if (gated) return gated;
  const name = path.basename(w[0]);
  const args = w.slice(1);
  if (WRAPPERS.has(name)) {
    for (let i = 0; i < args.length; i++) {
      const reason = checkWords(args.slice(i), depth + 1);
      if (reason) return reason;
    }
    return null;
  }
  if (name === 'bundle' && args[0] === 'exec') return checkWords(args.slice(1), depth + 1);
  if (SHELLS.has(name)) {
    const c = args.findIndex((a) => /^-[a-z]*c[a-z]*$/.test(a));
    return c >= 0 && args[c + 1] !== undefined ? checkCommand(args[c + 1], depth + 1) : null;
  }
  if (name === 'eval') return checkCommand(args.join(' '), depth + 1);

  if (name === 'git') {
    let i = 0;
    for (; i < args.length && args[i].startsWith('-'); i++) {
      const [opt, inline] = args[i].split(/=(.*)/s);
      const value = GIT_VALUE_OPTS.has(opt) ? (inline ?? args[++i]) : null;
      if ((opt === '-c' || opt === '--config-env') && /^alias\./i.test(value ?? '')) return 'Autopilot: defining a git alias on the command line is blocked, because it can hide a push.';
    }
    const sub = args[i];
    const rest = args.slice(i + 1);
    if (sub === 'push' || sub === 'send-email') return `Autopilot: git ${sub} is a hard stop. The user pushes the run branch after reviewing it.`;
    if (sub === 'config' && rest.some((a) => /^alias\./i.test(a)) && !rest.some((a) => /^(--get|--get-all|--get-regexp|--list|-l|get|list)$/.test(a))) {
      return 'Autopilot: writing a git alias is blocked, because it can hide a push.';
    }
    if (sub && !GIT_COMMON.has(sub)) {
      const alias = gitAlias(sub);
      if (alias) return alias.startsWith('!') ? checkCommand(alias.slice(1), depth + 1) : checkWords(['git', ...alias.split(/\s+/), ...rest], depth + 1);
    }
    return null;
  }
  if (name === 'gh' && GH_DENIED.has(firstArg(args))) return `Autopilot: gh ${firstArg(args)} acts on GitHub and is left for the user.`;
  if (name === 'fastlane' && args.some((a) => FASTLANE_STORE.has(a))) return 'Autopilot: store uploads are a hard stop, left for the user.';
  if (name === 'altool' || name === 'iTMSTransporter') return 'Autopilot: store uploads are a hard stop, left for the user.';
  if (name === 'eas' && firstArg(args) === 'submit') return 'Autopilot: eas submit uploads to a store and is left for the user.';
  if (PUBLISHERS.has(name)) {
    const pos = args.filter((a) => !a.startsWith('-'));
    if (pos[0] === 'publish' || (pos[0] === 'pub' && pos[1] === 'publish') || (pos[0] === 'npm' && pos[1] === 'publish')) {
      return `Autopilot: publishing a package is outward-facing and left for the user.`;
    }
  }
  return null;
}

function checkCommand(src, depth = 0) {
  for (const words of splitCommands(src)) {
    const reason = checkWords(words, depth);
    if (reason) return reason;
  }
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
  if (input.tool_name === 'Bash') {
    // SECURITY: the outward-facing commands the run must leave to the user (push, store
    // uploads, publishing). Commands hidden inside scripts can't be seen here; the sandbox and
    // the network allowlist stop those.
    const reason = checkCommand(String(input.tool_input?.command ?? ''));
    if (reason) deny(reason);
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
  // EXTERNAL: workers run as background agents. Ending the turn is how the orchestrator waits
  // for one; claude -p stays alive and resumes it when the worker's result arrives. Blocking here
  // would only make it poll. If no worker is really running, the session ends, the launcher logs
  // the open step, and launching again resumes.
  if (open?.some((s) => s.status === 'in_progress')) return;

  // ORDER: compare against the fingerprint taken at the previous block. With no change to the
  // ledger or the step states since then, the run is stuck, and blocking again would loop.
  const ledger = path.join(RUN_DIR, 'ledger.md');
  const fingerprint = crypto.createHash('sha256')
    .update(fs.existsSync(ledger) ? fs.readFileSync(ledger) : '')
    .update(fs.existsSync(statePath) ? fs.readFileSync(statePath) : '')
    .digest('hex');
  const markFile = path.join(STATE_DIR, 'stop-hook.json');
  if (input.stop_hook_active && readJson(markFile)?.fingerprint === fingerprint) return;
  fs.writeFileSync(markFile, JSON.stringify({ fingerprint }), { mode: 0o600 });
  // writeFileSync's mode applies only when it creates the file.
  fs.chmodSync(markFile, 0o600);

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
