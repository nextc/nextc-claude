#!/usr/bin/env node
// Hooks and the ledger writer for an autopilot run. autopilot-run.mjs registers the hooks through
// --settings, so they exist only inside that run, never in a normal session.
//   node autopilot-hooks.mjs guard   PreToolUse, every tool: kill switch, file-tool scope, outward commands,
//                                    deploy gate, foreground subagents, decider cap, end-of-run order
//   node autopilot-hooks.mjs stop    Stop: keep working while steps, docs or the report remain
//   node autopilot-hooks.mjs ledger <kind> <step|-> "<title>" [Field=value …] [-]
//                                    appends a numbered, UTC-stamped ledger entry (`-` reads Field: value lines from stdin)
// EXTERNAL: AUTOPILOT_RUN_DIR, AUTOPILOT_ROOT and AUTOPILOT_STATE_DIR are set by autopilot-run.mjs.
// Debug output goes to stderr only when AUTOPILOT_DEBUG=1; a hook's stderr is shown to the model and
// the user's terminal, never shipped in a product build.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const TERMINAL = new Set(['done', 'blocked', 'hard-stop', 'skipped']);
const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const READ_TOOLS = new Set(['Read', 'Glob', 'Grep']);
// MAGIC: the owner's per-run cap on decider calls when approved.json sets none.
export const DEFAULT_DECIDER_CAP = 30;
const DECIDER_RE = /(^|:)autopilot-decider$/;
const DOC_KEEPER_RE = /(^|:)doc-keeper$/;

export function debug(where, err) {
  if (process.env.AUTOPILOT_DEBUG === '1') console.error(`[autopilot-hooks ${where}] ${err?.stack || err}`);
}

export function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') debug(`readJson ${p}`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// File paths

// Files that configure Claude Code or git. Writing them would let the run widen its own sandbox,
// add hooks or MCP servers, or plant a git hook or filter that the launcher's own git commands
// would run outside the sandbox.
const PROTECTED = [/(^|\/)\.claude(\/|$)/, /(^|\/)\.mcp\.json$/, /(^|\/)\.git(\/|$)/];
const PROTECTED_FOR_BASH = /(^|\/)(\.git\/(hooks(\/|$)|config$|info\/attributes$|info\/exclude$)|\.claude(\/|$)|\.mcp\.json$)/;
// ASSUMPTION: plan mode puts every clone at <repo>/.claude/autopilot-runs/<run-id>/, so that prefix
// is the clone itself, not a Claude Code settings folder. Paths are tested from inside the clone.
const CLONE_PREFIX = /^.*?\.claude\/autopilot-runs\/[^/]+(\/|$)/;
export const isProtectedForBash = (p) => !/\s/.test(p) && PROTECTED_FOR_BASH.test(String(p).replace(CLONE_PREFIX, ''));

// The real location a write to `abs` lands on: every symlink resolved, including the last
// component and links that don't resolve yet. Returns null for a dangling link.
export function realTarget(abs) {
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
export function checkFilePath(raw, root) {
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

// ---------------------------------------------------------------------------------------------
// Shell parsing. Not a full shell: enough structure to find every simple command a string runs,
// including inside $(…), `…`, <(…), unquoted heredoc bodies, shell keywords and groups. Anything it
// can't follow is reported as an error, and the guard denies it (fail closed).

const RESERVED_START = new Set(['!', '{', '}', 'then', 'do', 'else', 'elif', 'if', 'while', 'until', 'fi', 'done', 'esac', 'time', 'coproc']);
const NOT_COMMANDS = new Set(['for', 'case', 'select', 'function', 'in']);
const ASSIGN_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;
const DECLARERS = new Set(['export', 'declare', 'local', 'readonly', 'typeset']);
const MAX_DEPTH = 8;

class ParseError extends Error {}

function decodeAnsiC(s) {
  return s.replace(/\\(x[0-9a-fA-F]{1,2}|u[0-9a-fA-F]{1,4}|U[0-9a-fA-F]{1,8}|[0-7]{1,3}|c.|.)/gs, (m, e) => {
    const map = { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', v: '\v', '\\': '\\', "'": "'", '"': '"', '?': '?' };
    if (e[0] === 'x' || e[0] === 'u' || e[0] === 'U') return String.fromCodePoint(parseInt(e.slice(1), 16));
    if (/^[0-7]+$/.test(e)) return String.fromCharCode(parseInt(e, 8));
    if (e[0] === 'c') return String.fromCharCode(e.charCodeAt(1) & 31);
    return map[e] ?? m;
  });
}

// Parses `src`. Returns { commands: [{ words: [{ text, dyn }], redirects: [{ text, dyn }], heredocs: [{ body, quoted }] }] }
// in order, nested substitutions included as commands of their own. `scope` maps variable names
// assigned earlier in the same command string to their literal value (undefined = assigned but unknown).
export function parseShell(src, { env = process.env, scope = new Map(), depth = 0 } = {}) {
  if (depth > MAX_DEPTH) throw new ParseError('the command nests too deeply to check');
  const out = [];
  const st = { src, i: 0, env, scope, depth, out };
  scanList(st, null);
  return { commands: out };
}

function lookup(st, name) {
  if (st.scope.has(name)) return st.scope.get(name);
  return Object.prototype.hasOwnProperty.call(st.env, name) ? st.env[name] : undefined;
}

// Reads a substitution's inner text starting at st.i (just after the opener) and returns it,
// leaving st.i on the closer. Parsing it fully finds the right closer even with nested quotes.
function scanSub(st, closer) {
  const start = st.i;
  const inner = { ...st, out: st.out, depth: st.depth + 1 };
  if (inner.depth > MAX_DEPTH) throw new ParseError('the command nests too deeply to check');
  scanList(inner, closer);
  st.i = inner.i;
  return st.src.slice(start, st.i);
}

function newCmd() { return { words: [], redirects: [], heredocs: [] }; }

function scanList(st, closer) {
  const { src } = st;
  let cmd = newCmd();
  let word = null; // { text, dyn, split }
  let redirNext = false;
  let assignPos = true; // still in the leading NAME=value words
  let declarer = false;
  const pending = []; // heredocs waiting for their body
  let braceOpen = false;
  let parenDepth = 0; // open ( … ) subshells in this list
  let caseDepth = 0; // open case … esac

  const startWord = () => { word ??= { text: '', dyn: false, split: false }; };
  const endWord = () => {
    if (word === null) return;
    braceOpen = false;
    if (word.text === 'esac' && !word.dyn && cmd.words.length === 0) caseDepth = Math.max(0, caseDepth - 1);
    const pieces = word.split ? word.text.split(/[ \t\n]+/).filter(Boolean) : [word.text];
    for (const text of pieces) {
      const w = { text, dyn: word.dyn };
      if (redirNext) { cmd.redirects.push(w); redirNext = false; continue; }
      const isAssign = ASSIGN_RE.test(text) && (assignPos || declarer);
      if (isAssign) {
        const name = text.slice(0, text.indexOf('='));
        st.scope.set(name, w.dyn ? undefined : text.slice(name.length + 1));
      } else if (cmd.words.every((x) => ASSIGN_RE.test(x.text))) {
        assignPos = false;
        declarer = DECLARERS.has(text);
      }
      cmd.words.push(w);
    }
    word = null;
  };
  const endCmd = () => {
    endWord();
    if (cmd.words[0]?.text === 'case') caseDepth++;
    if (cmd.words.length || cmd.redirects.length || cmd.heredocs.length) st.out.push(cmd);
    cmd = newCmd();
    assignPos = true;
    declarer = false;
    redirNext = false;
  };
  const readHeredocBodies = () => {
    for (const h of pending.splice(0)) {
      const lines = [];
      let found = false;
      while (st.i < src.length) {
        const nl = src.indexOf('\n', st.i);
        const line = src.slice(st.i, nl < 0 ? src.length : nl);
        st.i = nl < 0 ? src.length : nl + 1;
        if ((h.strip ? line.replace(/^\t+/, '') : line) === h.delim) { found = true; break; }
        lines.push(h.strip ? line.replace(/^\t+/, '') : line);
      }
      h.entry.body = lines.join('\n');
      h.entry.terminated = found;
      // SECURITY: an unquoted heredoc expands $(…) and `…` in its body, so those run as commands.
      if (!h.entry.quoted) expandBody(st, h.entry.body);
    }
  };
  // `$NAME`, `${…}` or a special parameter at st.i (on the `$`). Returns true when it consumed one.
  const expansion = (inDq) => {
    const rest = src.slice(st.i + 1);
    let m = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (m) {
      st.i += m[0].length;
      const v = lookup(st, m[0]);
      startWord();
      if (v === undefined) { word.text += `$${m[0]}`; word.dyn = true; } else { word.text += v; if (!inDq && /\s/.test(v)) word.split = true; }
      return true;
    }
    if (rest[0] === '{') {
      const close = rest.indexOf('}');
      if (close < 0) throw new ParseError('unterminated ${');
      const body = rest.slice(1, close);
      st.i += close + 1;
      startWord();
      const simple = body.match(/^([A-Za-z_][A-Za-z0-9_]*)(?::?-(.*))?$/s);
      let v;
      if (simple) v = lookup(st, simple[1]) ?? simple[2];
      if (v === undefined) { word.text += `\${${body}}`; word.dyn = true; } else { word.text += v; if (!inDq && /\s/.test(v)) word.split = true; }
      return true;
    }
    m = rest.match(/^[0-9?$!#@*-]/);
    if (m) { st.i += 1; startWord(); word.text += `$${m[0]}`; word.dyn = true; return true; }
    return false;
  };

  for (; st.i < src.length; st.i++) {
    const c = src[st.i];
    const n = src[st.i + 1];
    if (c === '\\') {
      if (n === '\n') { st.i++; continue; }
      startWord(); word.text += n ?? ''; st.i++; continue;
    }
    if (c === "'") {
      const end = src.indexOf("'", st.i + 1);
      if (end < 0) throw new ParseError('unterminated single quote');
      startWord(); word.text += src.slice(st.i + 1, end); st.i = end; continue;
    }
    if (c === '$' && n === "'") {
      let j = st.i + 2;
      for (; j < src.length && src[j] !== "'"; j++) if (src[j] === '\\') j++;
      if (j >= src.length) throw new ParseError("unterminated $'…'");
      startWord(); word.text += decodeAnsiC(src.slice(st.i + 2, j)); st.i = j; continue;
    }
    if (c === '"' || (c === '$' && n === '"')) {
      if (c === '$') st.i++;
      startWord();
      let closed = false;
      for (st.i++; st.i < src.length; st.i++) {
        const d = src[st.i];
        if (d === '"') { closed = true; break; }
        if (d === '\\' && '$`"\\\n'.includes(src[st.i + 1])) { if (src[st.i + 1] !== '\n') word.text += src[st.i + 1]; st.i++; continue; }
        if (d === '$' && src[st.i + 1] === '(' && src[st.i + 2] === '(') { st.i = skipArith(src, st.i); word.text += '0'; word.dyn = true; continue; }
        if (d === '$' && src[st.i + 1] === '(') { st.i += 2; scanSub(st, ')'); word.dyn = true; continue; }
        if (d === '`') { st.i = backtick(st, st.i); word.dyn = true; continue; }
        if (d === '$' && expansion(true)) continue;
        word.text += d;
      }
      if (!closed) throw new ParseError('unterminated double quote');
      continue;
    }
    if (c === '`') { st.i = backtick(st, st.i); startWord(); word.dyn = true; continue; }
    if (c === '$' && n === '(' && src[st.i + 2] === '(') { st.i = skipArith(src, st.i); startWord(); word.text += '0'; word.dyn = true; continue; }
    if (c === '$' && n === '(') { st.i += 2; scanSub(st, ')'); startWord(); word.dyn = true; continue; }
    if (c === '$' && expansion(false)) continue;
    if ((c === '<' || c === '>') && n === '(') { st.i += 2; scanSub(st, ')'); startWord(); word.dyn = true; continue; }
    if (c === '#' && word === null) { while (st.i + 1 < src.length && src[st.i + 1] !== '\n') st.i++; continue; }
    if (c === ')' && closer === ')') { endCmd(); return; }
    if (c === '\n') { endCmd(); st.i++; readHeredocBodies(); st.i--; continue; }
    if (c === '(' && word !== null && n === ')') { endWord(); st.i++; endCmd(); continue; }
    if (c === ')' && parenDepth === 0 && caseDepth > 0) {
      // A case pattern such as `*.md)`: the words so far are patterns, not a command.
      endWord();
      if (cmd.words[0]?.text === 'case') endCmd(); else { cmd = newCmd(); assignPos = true; declarer = false; }
      continue;
    }
    if (';&|()'.includes(c)) {
      if (c === '&' && n === '>') { endWord(); st.i += src[st.i + 2] === '>' ? 2 : 1; redirNext = true; continue; }
      if (c === '(') parenDepth++;
      if (c === ')') parenDepth = Math.max(0, parenDepth - 1);
      endCmd(); continue;
    }
    if (c === '<' || c === '>') {
      if (word && /^\d+$/.test(word.text) && !word.dyn) word = null; else endWord();
      if (c === '<' && n === '<' && src[st.i + 2] === '<') { st.i += 2; redirNext = true; continue; }
      if (c === '<' && n === '<') {
        const strip = src[st.i + 2] === '-';
        st.i += strip ? 3 : 2;
        while (src[st.i] === ' ' || src[st.i] === '\t') st.i++;
        let delim = '';
        let quoted = false;
        for (; st.i < src.length && !/[\s;&|<>()]/.test(src[st.i]); st.i++) {
          const d = src[st.i];
          if (d === "'" || d === '"') {
            const end = src.indexOf(d, st.i + 1);
            if (end < 0) throw new ParseError('unterminated heredoc delimiter');
            delim += src.slice(st.i + 1, end); quoted = true; st.i = end;
          } else if (d === '\\') { delim += src[st.i + 1] ?? ''; quoted = true; st.i++; } else delim += d;
        }
        st.i--;
        if (!delim) throw new ParseError('heredoc without a delimiter');
        const entry = { body: '', quoted, terminated: false };
        cmd.heredocs.push(entry);
        pending.push({ delim, strip, entry });
        continue;
      }
      while (src[st.i + 1] === '>' || src[st.i + 1] === '&' || src[st.i + 1] === '|' || (c === '<' && src[st.i + 1] === '>')) st.i++;
      redirNext = true;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r') { endWord(); continue; }
    if (c === '{' && word === null && /[\s]/.test(n ?? ' ')) { word = { text: '{', dyn: false, split: false }; endWord(); continue; }
    if (c === '}' && word === null && (n === undefined || /[\s;&|)]/.test(n))) { word = { text: '}', dyn: false, split: false }; endWord(); continue; }
    startWord();
    if (c === '{') braceOpen = true;
    else if (braceOpen && (c === ',' || (c === '.' && n === '.'))) word.dyn = true;
    else if (c === '}') braceOpen = false;
    else if (c === '*' || c === '?') word.dyn = true;
    word.text += c;
  }
  if (closer) throw new ParseError(`unterminated ${closer === ')' ? '$(' : closer}`);
  endCmd();
  readHeredocBodies();
}

function skipArith(src, i) {
  let depth = 0;
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === '(') depth++;
    else if (src[j] === ')') { depth--; if (depth === 0) return j; }
  }
  throw new ParseError('unterminated $((');
}

// Parses `…` starting at index i (on the opening backtick); returns the index of the closing one.
function backtick(st, i) {
  let j = i + 1;
  let inner = '';
  for (; j < st.src.length && st.src[j] !== '`'; j++) {
    if (st.src[j] === '\\' && '`$\\'.includes(st.src[j + 1])) { inner += st.src[j + 1]; j++; } else inner += st.src[j];
  }
  if (j >= st.src.length) throw new ParseError('unterminated backtick');
  const sub = parseShell(inner, { env: st.env, scope: st.scope, depth: st.depth + 1 });
  st.out.push(...sub.commands);
  return j;
}

// The command substitutions an unquoted heredoc body runs.
function expandBody(st, body) {
  const sub = { ...st, src: body, i: 0 };
  for (; sub.i < body.length; sub.i++) {
    const c = body[sub.i];
    if (c === '\\') { sub.i++; continue; }
    if (c === '$' && body[sub.i + 1] === '(' && body[sub.i + 2] === '(') { sub.i = skipArith(body, sub.i); continue; }
    if (c === '$' && body[sub.i + 1] === '(') { sub.i += 2; scanSub(sub, ')'); continue; }
    if (c === '`') sub.i = backtick(sub, sub.i);
  }
}

// ---------------------------------------------------------------------------------------------
// Command policy

const WRAPPERS = new Set(['sudo', 'doas', 'command', 'builtin', 'exec', 'nohup', 'setsid', 'nice', 'ionice', 'timeout', 'gtimeout', 'stdbuf', 'unbuffer', 'caffeinate', 'chronic', 'flock', 'time', 'xargs', 'parallel', 'watch', 'npx', 'bunx', 'pnpx', 'xcrun', 'arch', 'coproc', 'then', 'do', 'nocorrect', 'noglob']);
const RUNNERS = { bundle: ['exec'], poetry: ['run'], uv: ['run', 'tool'], uvx: null, pipenv: ['run'], pipx: ['run'], rbenv: ['exec'], pyenv: ['exec'], asdf: ['exec'], mise: ['exec', 'x'], rtx: ['exec', 'x'], direnv: ['exec'], npm: ['exec', 'x'], pnpm: ['exec', 'dlx', 'x'], yarn: ['exec', 'dlx', 'run'], bun: ['x', 'run'], dotnet: ['tool'] };
const YARN_BUILTINS = new Set(['add', 'install', 'remove', 'test', 'build', 'run', 'exec', 'dlx', 'why', 'info', 'upgrade', 'up', 'init', 'config', 'cache', 'workspace', 'workspaces', 'npm', 'pack', 'version', 'set', 'plugin', 'constraints', 'dedupe', 'link', 'unlink', 'node', 'rebuild', 'patch', 'explain', 'list', 'outdated', 'audit', 'create', 'import', 'global', 'help', 'bin', 'login', 'logout', 'publish', 'tag', 'owner', 'licenses', 'check', 'autoclean', 'generate-lock-entry', 'policies', 'team', 'unplug', 'search', 'stage', 'start', 'lint', 'format', 'dev']);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish', 'mksh', 'yash']);
const INTERPRETERS = { python: ['-c'], node: ['-e', '--eval', '-p', '--print'], nodejs: ['-e', '--eval', '-p', '--print'], ruby: ['-e'], perl: ['-e', '-E'], php: ['-r'], bun: ['-e', '--eval', '-p', '--print'], deno: ['eval'], osascript: ['-e'], pwsh: ['-c', '-Command', '-command'], powershell: ['-c', '-Command', '-command'], lua: ['-e'], Rscript: ['-e'], tclsh: [], jshell: [] };
// SECURITY: code that starts another process is opaque: what it runs can't be read from the command.
const SPAWN_RE = /subprocess|os\.(system|popen|exec\w*|spawn\w*|posix_spawn\w*)|pty\.spawn|commands\.getoutput|child_process|\bexecSync\b|\bspawnSync\b|\bexecFile(Sync)?\b|\bexeca\b|\bexec\s*\(|\bspawn\s*\(|Deno\.(run|Command)|Bun\.(spawn|\$)|\bsystem\s*\(|IO\.popen|Open3|%x[({[]|shell_exec|passthru|proc_open|\bpopen\s*\(|do shell script|Process\.Start|Start-Process|Invoke-Expression|\biex\b|Runtime\.getRuntime|ProcessBuilder|from ['"]zx|require\(['"]zx/;
const READERS = new Set(['cat', 'less', 'more', 'head', 'tail', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'ls', 'stat', 'file', 'wc', 'diff', 'cmp', 'git', 'test', '[', '[[', 'echo', 'printf', 'readlink', 'realpath', 'basename', 'dirname', 'jq', 'sort', 'uniq', 'cut', 'tr', 'md5', 'shasum', 'sha256sum', 'xxd', 'od', 'hexdump', 'strings', 'du', 'tree', 'which', 'type', 'awk', 'find', 'sed', 'bat', 'column', 'nl', 'fold', 'plutil']);
const GIT_VALUE_OPTS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--super-prefix', '--attr-source']);
const GIT_COMMON = new Set(['status', 'log', 'diff', 'show', 'add', 'commit', 'restore', 'switch', 'checkout', 'branch', 'tag', 'merge', 'rebase', 'reset', 'stash', 'rev-parse', 'ls-files', 'grep', 'blame', 'fetch', 'pull', 'clone', 'init', 'mv', 'rm', 'config', 'remote', 'describe', 'cherry-pick', 'revert', 'clean', 'worktree', 'check-ignore', 'shortlog', 'reflog', 'apply', 'format-patch', 'notes', 'bisect', 'submodule', 'help', 'version', 'cat-file', 'rev-list', 'show-ref', 'ls-tree', 'merge-base', 'name-rev', 'for-each-ref', 'symbolic-ref', 'update-index', 'hash-object', 'var', 'count-objects', 'fsck', 'gc', 'am', 'range-diff', 'whatchanged', 'sparse-checkout', 'maintenance', 'archive', 'difftool', 'mergetool', 'filter-branch', 'credential', 'lfs', 'svn', 'p4', 'push', 'send-email', 'request-pull', 'hook']);
const GIT_DANGEROUS_KEY = /^(alias\.|core\.(hookspath|fsmonitor|sshcommand|pager|editor|askpass|gitproxy|attributesfile|excludesfile)|include\.|includeif\.|filter\.|diff\..*\.(textconv|command)|merge\..*\.driver|credential\.|remote\..*\.(pushurl|url|receivepack|uploadpack|proxy)|url\..*insteadof|sequence\.editor|gpg\.|uploadpack\.|receive\.|protocol\.|http\..*(proxy|extraheader|sslcainfo))/i;
const GIT_CONFIG_READ = /^(--get|--get-all|--get-regexp|--get-urlmatch|--list|-l|get|list|--show-origin|--show-scope|--name-only|-z|--null|--type=.*|--bool|--int|--path|--default=.*|--local|--global|--system|--worktree|--includes|--no-includes)$/;
const GH_READ = { issue: ['list', 'view', 'status'], pr: ['list', 'view', 'diff', 'checks', 'status'], run: ['list', 'view'], repo: ['view'], release: ['list', 'view'], workflow: ['list', 'view'], label: ['list'], search: null, status: null, help: null, version: null, '--version': null, '--help': null };
// Fastlane: uploads are denied by default. A lane runs only when its name says it builds, tests,
// lints or takes screenshots and nothing in the name says it ships.
const FASTLANE_BUILD_LANE = /(^|_)(build|builds|test|tests|lint|analy[sz]e|screenshots?|snapshot|gym|scan|format|setup|match_readonly|certificates_readonly|prepare|bump|version)(_|$)/i;
const FASTLANE_SHIP = /(upload|release|deploy|beta|testflight|pilot|deliver|supply|submit|publish|store|distribute|distribution|internal|alpha|production|prod|promote|firebase|appcenter|crashlytics|play|appstore|app_store|itc|connect|ship|rollout|live)/i;
const FASTLANE_SAFE_ACTIONS = new Set(['gym', 'build_app', 'build_ios_app', 'build_mac_app', 'scan', 'run_tests', 'snapshot', 'capture_screenshots', 'capture_ios_screenshots', 'swiftlint', 'clear_derived_data', 'increment_build_number', 'increment_version_number', 'get_version_number', 'get_build_number', 'ensure_git_status_clean', 'xcodebuild', 'xcclean', 'xctest']);
const FASTLANE_META = new Set(['lanes', 'list', 'env', 'help', 'version', '--version', '--help', 'init', 'docs', 'search_plugins', 'action', 'actions']);
const PUBLISH_CMDS = new Set(['publish', 'unpublish', 'deprecate', 'dist-tag', 'owner', 'access', 'trust']);
const NPM_VALUE_OPTS = new Set(['--prefix', '-C', '--dir', '--filter', '-F', '--workspace', '-w', '--cwd', '--registry', '--tag', '--otp', '--userconfig', '--cache']);
const STORE_TOOLS = new Set(['altool', 'iTMSTransporter', 'transporter', 'notarytool', 'ios-deploy-upload', 'appcenter', 'bundletool-upload', 'codemagic', 'firebase-appdistribution']);
const ALWAYS_OUTWARD = new Set(['surge', 'gh-pages', 'twine', 'ghr', 'goreleaser', 'release-it', 'semantic-release', 'changeset-publish', 'np', 'expo-publish']);

// SECURITY: cloud and package commands that act on a live service. Each returns the matching
// action, or null. A gated deploy step's own recorded commands are allowed before these run.
const CLOUD = {
  firebase: (p) => p.find((a) => /^(deploy|hosting:|appdistribution:|functions:(delete|config:set|config:unset|secrets:set|secrets:destroy)|database:(set|update|push|remove)|firestore:delete|remoteconfig:rollback|auth:import|ext:(install|update|uninstall)|apphosting:|target:apply|use)/.test(a)),
  wrangler: (p) => (/^(deploy|publish|rollback|delete|secret|deployments|triggers)$/.test(p[0] ?? '') || (p[0] === 'pages' && /^(deploy|publish|project)$/.test(p[1] ?? '')) || (p[0] === 'versions' && /^(upload|deploy)$/.test(p[1] ?? '')) || /^(kv|r2|d1|queues|vectorize)/.test(p[0] ?? '') && p.some((a) => /^(put|delete|create|execute|bulk|object)$/.test(a)) ? p.join(' ') : null),
  supabase: (p) => ((p[0] === 'db' && /^(push|reset)$/.test(p[1] ?? '')) || /^(functions|secrets|projects|branches|orgs|storage|sso|domains|vanity-subdomains|network-restrictions|ssl-enforcement|postgres-config|link)$/.test(p[0] ?? '') && !/^(serve|list|new|download)$/.test(p[1] ?? '') || (p[0] === 'migration' && /^(repair|up)$/.test(p[1] ?? '')) || (p[0] === 'config' && p[1] === 'push') ? p.slice(0, 2).join(' ') : null),
  vercel: (p) => (/^(build|dev|pull|whoami|ls|list|inspect|logs|help|--version|-v|login|logout|init|link|env)$/.test(p[0] ?? '') && !(p[0] === 'env' && /^(add|rm|remove)$/.test(p[1] ?? '')) ? null : (p[0] ?? 'deploy')),
  netlify: (p) => p.find((a) => /^(deploy|sites:(create|delete)|env:(set|unset|import)|api|functions:(deploy|create)|link|init)$/.test(a)),
  fly: (p) => p.find((a) => /^(deploy|launch|secrets|scale|machine|machines|destroy|apps|volumes|certs|ips|postgres|redis|releases)$/.test(a)),
  flyctl: (p) => CLOUD.fly(p),
  heroku: (p) => (/^(logs|apps:info|--version|help|ps|config)$/.test(p[0] ?? '') && !(p[0] === 'ps' && p.length > 1) ? null : (p[0] ?? 'heroku')),
  railway: (p) => p.find((a) => /^(up|deploy|down|redeploy|variables|link|domain|volume)$/.test(a)),
  gcloud: (p) => p.find((a) => /^(deploy|submit|delete|create|update|cp|rsync|mv|set-iam-policy|add-iam-policy-binding|remove-iam-policy-binding|publish|import|patch|replace|set-traffic)$/.test(a)),
  gsutil: (p) => p.find((a) => /^(cp|rsync|mv|rm|rb|mb|setmeta|acl|iam|defacl)$/.test(a)),
  aws: (p) => p.find((a) => /^(cp|sync|mv|rm|rb|mb|deploy|invoke|run-instances|package)$|^(put|create|update|delete|publish|start|stop|terminate|send|upload|modify|attach|detach|associate|register|deregister|reboot|restore|import)-/.test(a)),
  az: (p) => p.find((a) => /^(create|delete|update|deploy|set|upload|up|publish|restart|start|stop|import|swap)$/.test(a)),
  kubectl: (p) => p.find((a) => /^(apply|create|delete|patch|replace|rollout|scale|set|edit|run|expose|label|annotate|cp|exec|drain|cordon|taint|autoscale)$/.test(a)),
  helm: (p) => p.find((a) => /^(install|upgrade|uninstall|delete|rollback|push)$/.test(a)),
  terraform: (p) => (/^(apply|destroy|import|taint|untaint|force-unlock)$/.test(p[0] ?? '') || (p[0] === 'state' && /^(rm|mv|push|replace-provider)$/.test(p[1] ?? '')) ? p[0] : null),
  tofu: (p) => CLOUD.terraform(p),
  pulumi: (p) => p.find((a) => /^(up|update|destroy|import|refresh|cancel)$/.test(a)),
  serverless: (p) => p.find((a) => /^(deploy|remove|rollback)$/.test(a)),
  sls: (p) => CLOUD.serverless(p),
  cdk: (p) => p.find((a) => /^(deploy|destroy|bootstrap)$/.test(a)),
  docker: (p, raw) => (p[0] === 'push' || (p[0] === 'image' && p[1] === 'push') || (p[0] === 'buildx' && raw.includes('--push')) || p[0] === 'login' || (p[0] === 'manifest' && p[1] === 'push') ? 'push' : null),
  podman: (p) => (p[0] === 'push' || p[0] === 'login' ? 'push' : null),
  gem: (p) => (/^(push|yank|owner|signin)$/.test(p[0] ?? '') ? p[0] : null),
  pod: (p) => ((p[0] === 'trunk' && /^(push|register|add-owner|delete|deprecate)$/.test(p[1] ?? '')) || (p[0] === 'repo' && p[1] === 'push') ? p.slice(0, 2).join(' ') : null),
  mvn: (p) => p.find((a) => /(^|:)deploy(:|$)|^release:/.test(a)),
  poetry: (p) => (p[0] === 'publish' ? 'publish' : null),
  hatch: (p) => (p[0] === 'publish' ? 'publish' : null),
  flit: (p) => (p[0] === 'publish' ? 'publish' : null),
  pdm: (p) => (p[0] === 'publish' ? 'publish' : null),
  uv: (p) => (p[0] === 'publish' ? 'publish' : null),
  nuget: (p) => (p[0] === 'push' || p[0] === 'delete' ? p[0] : null),
  swift: (p) => (p[0] === 'package-registry' && p[1] === 'publish' ? 'package-registry publish' : null),
  expo: (p) => (/^(publish|upload:)/.test(p[0] ?? '') ? p[0] : null),
  eas: (p, raw) => (/^(submit|update|publish)/.test(p[0] ?? '') || ((p[0] === 'build') && !raw.includes('--local')) ? p[0] : null),
  appwrite: (p) => p.find((a) => /^(push|deploy|init|login|run|pull)$|^(create|update|delete|upsert|increment|decrement)/.test(a)),
  security: (p) => (/^(find-generic-password|find-internet-password|dump-keychain|export|find-certificate)$/.test(p[0] ?? '') ? p[0] : null),
};

const firstPositional = (args, valueOpts = new Set()) => {
  for (let i = 0; i < args.length; i++) {
    if (valueOpts.has(args[i])) { i++; continue; }
    if (!args[i].startsWith('-')) return { index: i, word: args[i] };
  }
  return null;
};

const opaque = (what) => `Autopilot: ${what}, so the guard can't tell what it runs. Write the command out plainly (literal command name and arguments, no variables, globs or generated code in command position) and run it again.`;

let deploysCache;
function approvedDeploys(ctx) {
  if (ctx.deploys) return ctx.deploys;
  deploysCache ??= readJson(path.join(ctx.stateDir, 'approved.json'))?.deploys ?? [];
  return deploysCache;
}

const isScript = (word, script) => word !== '' && path.basename(word) === path.basename(script);

// Returns the deploy entry that `w` runs, or null. A script counts only where it is executed
// (first word, or the file a shell or `source` runs), so reading it with cat or grep is allowed.
function deployRun(w, ctx) {
  const name = path.basename(w[0]);
  const runs = [w[0]];
  // `sh -n` only checks syntax, so it is reading, not running.
  const syntaxOnly = SHELLS.has(name) && w.slice(1).some((a) => /^-[a-z]*n[a-z]*$/.test(a));
  if ((SHELLS.has(name) && !syntaxOnly) || name === 'source' || name === '.') runs.push(w.slice(1).find((a) => !a.startsWith('-')) ?? '');
  for (const d of approvedDeploys(ctx)) {
    if ((d.commands ?? []).some((c) => { const cw = c.split(/\s+/); return cw.every((x, i) => w[i] === x); })) return d;
    if ((d.scripts ?? []).some((s) => runs.some((r) => isScript(r, s)))) return d;
  }
  return null;
}

function deployGatePasses(d, ctx) {
  const step = readJson(path.join(ctx.runDir, 'state.json'))?.steps?.find((s) => s.id === d.step);
  return step?.status === 'in_progress' && step.gate === 'pass';
}

function gitAlias(name, ctx) {
  if (ctx.gitAlias) return ctx.gitAlias(name);
  try {
    return execFileSync('git', ['-C', ctx.root, 'config', '--get', `alias.${name}`], { encoding: 'utf8' }).trim();
  } catch (err) {
    // git exits 1 when the alias doesn't exist; anything else is a real failure.
    if (err.status === 1) return null;
    throw err;
  }
}

function fastlaneReason(args) {
  const pos = args.filter((a) => !a.startsWith('-') && !a.includes(':'));
  if (!pos.length || FASTLANE_META.has(pos[0])) return null;
  if (pos[0] === 'run') {
    const action = pos[1] ?? '';
    return FASTLANE_SAFE_ACTIONS.has(action) ? null : `Autopilot: fastlane action "${action}" is not on the build-only list, so it is treated as a store upload and left for the user.`;
  }
  const lane = /^(ios|android|mac)$/.test(pos[0]) ? pos[1] ?? '' : pos[0];
  if (FASTLANE_BUILD_LANE.test(lane) && !FASTLANE_SHIP.test(lane)) return null;
  return `Autopilot: fastlane lane "${lane}" is not a build-only lane (its name must say build, test, lint or screenshots, and nothing about uploading or releasing), so it is treated as a store upload and left for the user.`;
}

function xcodebuildReason(args, ctx) {
  if (!args.includes('-exportArchive')) return null;
  const i = args.indexOf('-exportOptionsPlist');
  const plist = i >= 0 ? args[i + 1] : null;
  if (!plist) return 'Autopilot: xcodebuild -exportArchive without -exportOptionsPlist is refused, because its destination can be an upload to App Store Connect.';
  let text;
  try {
    text = fs.readFileSync(path.isAbsolute(plist) ? plist : path.join(ctx.root, plist), 'utf8');
  } catch (err) {
    debug('xcodebuildReason', err);
    return `Autopilot: could not read ${plist} to check that the export doesn't upload, so it is refused.`;
  }
  return /<key>\s*destination\s*<\/key>\s*<string>\s*upload\s*<\/string>/i.test(text)
    ? `Autopilot: ${plist} sets destination "upload", which sends the build to App Store Connect. Store uploads are left for the user.` : null;
}

function interpreterReason(name, args, cmd, ctx, depth) {
  const flags = INTERPRETERS[name.replace(/^python[\d.]*$/, 'python')];
  if (!flags) return null;
  const base = name.replace(/^python[\d.]*$/, 'python');
  let code = null;
  if (base === 'python') {
    const m = args.indexOf('-m');
    if (m >= 0 && args[m + 1]) return checkWords(args.slice(m + 1).map((t) => ({ text: t })), cmd, ctx, depth + 1);
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const flag = flags.find((f) => a === f || (f.length === 2 && a.startsWith('-') && !a.startsWith('--') && a.endsWith(f[1]) && /^-[A-Za-z]+$/.test(a)));
    if (flag) { code = args[i + 1] ?? ''; break; }
  }
  const scriptArg = args.find((a) => !a.startsWith('-'));
  if (code === null && cmd.heredocs.length && (scriptArg === undefined || scriptArg === '-')) code = cmd.heredocs.map((h) => h.body).join('\n');
  if (code === null) return null;
  // Ruby backticks run a command. Perl's do too, but perl one-liners edit Markdown full of
  // backticks, so for perl only qx// is treated as a process call (a known gap, see the tests).
  const backticks = (base === 'ruby' && code.includes('`')) || (base === 'perl' && /\bqx\s*[^\w\s]/.test(code));
  if (SPAWN_RE.test(code) || backticks) return opaque(`this ${name} code starts another process`);
  return null;
}

// Returns a reason to deny one simple command, or null. `words` are { text, dyn }.
// `suffix` marks a tail of a wrapper's words that may not be the wrapped command (an option value,
// a file name), so a variable there is not treated as an opaque command name.
function checkWords(words, cmd, ctx, depth, suffix = false) {
  if (depth > MAX_DEPTH) return 'Autopilot: the command nests too deeply to check. Write it out plainly.';
  let w = words;
  for (;;) {
    while (w.length && RESERVED_START.has(w[0].text) && !w[0].dyn) w = w.slice(1);
    if (w.length && w[0].text === '-p' && words.some((x) => x.text === 'time')) { w = w.slice(1); continue; }
    break;
  }
  if (!w.length || NOT_COMMANDS.has(w[0].text)) return null;
  while (w.length && ASSIGN_RE.test(w[0].text)) {
    if (/^GIT_CONFIG_/.test(w[0].text)) return 'Autopilot: setting git config through the environment is blocked, because it can define an alias for push or a hook.';
    w = w.slice(1);
  }
  if (!w.length) return null;
  const texts = w.map((x) => x.text);

  const d = deployRun(texts, ctx);
  if (d) {
    if (deployGatePasses(d, ctx)) return null;
    return `Autopilot: "${texts.join(' ')}" deploys or rolls back ${d.step}. It runs only after the compatibility check passes: gather the evidence by reading the code, log the DEPLOY entry, then set "gate": "pass" on ${d.step} in state.json. Never run it to collect evidence.`;
  }
  if (w[0].dyn) return suffix ? null : opaque(`the command name "${w[0].text}" comes from a variable, glob, brace or substitution`);
  const name = path.basename(texts[0]);
  const args = texts.slice(1);
  if (texts.some((t) => path.basename(t) === 'autopilot-run.mjs')) return 'Autopilot: the launcher (autopilot-run.mjs) is for the user to run, not the run itself.';
  // SECURITY: a write into .git/hooks, .git/config, .claude/ or .mcp.json would run outside the
  // sandbox later (the launcher's git commands, the next launch's settings).
  const writer = !READERS.has(name) || (name === 'sed' && args.some((a) => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place'))) || (name === 'find' && args.some((a) => /^-(delete|exec|execdir|ok|okdir|fprint)/.test(a)));
  const hit = cmd.redirects.find((r) => isProtectedForBash(r.text)) ?? (writer ? w.slice(1).find((a) => isProtectedForBash(a.text)) : null);
  if (hit) return `Autopilot: ${hit.text} configures git or Claude Code, and the run may not change it.`;
  if ((name === 'cd' || name === 'pushd') && /(^|\/)\.(git|claude)(\/|$)/.test((args.find((a) => !a.startsWith('-')) ?? '').replace(CLONE_PREFIX, ''))) return 'Autopilot: work on .git and .claude paths from outside them; changing into them is blocked so a relative write can\'t reach git hooks or Claude Code settings.';

  if (WRAPPERS.has(name)) return checkTails(w, 1, cmd, ctx, depth);
  if (name === 'env') {
    for (let i = 0; i < args.length; i++) {
      const m = args[i].match(/^(-S|--split-string)(=?)(.*)$/s);
      if (m) {
        const value = m[3] || (m[2] ? '' : args[i + 1] ?? '');
        const reason = checkCommand(value, ctx, depth + 1);
        if (reason) return reason;
      }
    }
    return checkTails(w, 1, cmd, ctx, depth);
  }
  if (name in RUNNERS) {
    const subs = RUNNERS[name];
    const pos = firstPositional(args, NPM_VALUE_OPTS);
    const yarnBin = (name === 'yarn' || name === 'pnpm') && pos && !YARN_BUILTINS.has(pos.word);
    if (subs === null || (pos && subs.includes(pos.word)) || yarnBin) {
      const from = subs === null ? 1 : (yarnBin ? pos.index + 1 : pos.index + 2);
      const reason = checkTails(w, from, cmd, ctx, depth);
      if (reason) return reason;
      if (name !== 'npm' && name !== 'pnpm' && name !== 'yarn' && name !== 'bun' && name !== 'uv') return null;
    }
  }
  if (name === 'su' || name === 'script') {
    const c = args.findIndex((a) => a === '-c' || a === '--command');
    if (c >= 0) return checkCommand(args[c + 1] ?? '', ctx, depth + 1);
  }
  if (SHELLS.has(name)) {
    const c = args.findIndex((a) => /^-[a-z]*c[a-z]*$/.test(a));
    if (c >= 0) {
      if (w[c + 2]?.dyn) return opaque('the shell runs a command string built from variables or substitutions');
      return args[c + 1] !== undefined ? checkCommand(args[c + 1], ctx, depth + 1) : null;
    }
    const script = args.find((a) => !a.startsWith('-'));
    if ((script === undefined || args.includes('-s')) && cmd.heredocs.length) {
      for (const h of cmd.heredocs) {
        const reason = checkCommand(h.body, ctx, depth + 1);
        if (reason) return reason;
      }
    }
    return null;
  }
  if (name === 'eval') {
    if (w.slice(1).some((x) => x.dyn)) return opaque('eval runs text built from variables or substitutions');
    return checkCommand(args.join(' '), ctx, depth + 1);
  }
  if (name === 'alias') {
    for (const a of args) {
      const eq = a.indexOf('=');
      if (eq > 0) { const reason = checkCommand(a.slice(eq + 1), ctx, depth + 1); if (reason) return reason; }
    }
    return null;
  }
  if (name === 'find') {
    for (let i = 0; i < args.length; i++) {
      if (!/^-(exec|execdir|ok|okdir)$/.test(args[i])) continue;
      const end = args.findIndex((a, j) => j > i && (a === ';' || a === '+'));
      const inner = w.slice(i + 2, end < 0 ? w.length : end + 1).map((x) => ({ ...x, text: x.text === '{}' ? 'FILE' : x.text }));
      const reason = checkWords(inner, { ...cmd, redirects: [], heredocs: [] }, ctx, depth + 1);
      if (reason) return reason;
    }
    return null;
  }
  if (/^(awk|gawk|mawk|nawk)$/.test(name)) {
    const prog = args.find((a) => !a.startsWith('-')) ?? '';
    if (/\bsystem\s*\(|\|\s*getline|print[^;]*\|\s*"|\|&/.test(prog)) return opaque('this awk program runs other commands');
    return null;
  }
  const interp = interpreterReason(name, args, cmd, ctx, depth);
  if (interp) return interp;

  if (name === 'git' || name.startsWith('git-')) return gitReason(name, w, cmd, ctx, depth);
  if (name === 'gh') {
    const pos = args.filter((a) => !a.startsWith('-'));
    if (!pos.length) return null;
    const allowed = GH_READ[pos[0]];
    if (allowed === null || (allowed && allowed.includes(pos[1]))) return null;
    return `Autopilot: gh ${pos.slice(0, 2).join(' ')} acts on GitHub or reads its credentials, and is left for the user. Read-only gh commands (issue/pr list, view, diff, checks) still work.`;
  }
  if (name === 'fastlane') return fastlaneReason(args);
  if (STORE_TOOLS.has(name)) return `Autopilot: ${name} uploads to a store or distribution service; store uploads are a hard stop, left for the user.`;
  if (name === 'xcodebuild') return xcodebuildReason(args, ctx);
  if (ALWAYS_OUTWARD.has(name)) return `Autopilot: ${name} publishes or acts on a live service, and is left for the user.`;
  if (['npm', 'pnpm', 'yarn', 'bun', 'cargo', 'dart', 'flutter'].includes(name)) {
    const pos = args.filter((a, i) => !a.startsWith('-') && !NPM_VALUE_OPTS.has(args[i - 1]));
    const pub = PUBLISH_CMDS.has(pos[0]) || (pos[0] === 'npm' && PUBLISH_CMDS.has(pos[1])) || (pos[0] === 'pub' && /^(publish|lish)$/.test(pos[1] ?? '')) || (name === 'cargo' && /^(publish|yank|owner)$/.test(pos[0] ?? ''));
    if (pub) return 'Autopilot: publishing a package is outward-facing and left for the user.';
  }
  if (/^(gradle|gradlew)$/.test(name)) {
    const task = args.find((a) => /(^|:)(publish(?!ToMavenLocal\b)\w*|upload\w*|appDistributionUpload\w*)$/i.test(a));
    if (task) return `Autopilot: gradle task ${task} publishes or uploads, and is left for the user.`;
  }
  if (CLOUD[name] && !args.some((a) => a === '--help' || a === '-h' || a === 'help' || a === '--version')) {
    const action = CLOUD[name](args.filter((a) => !a.startsWith('-') || a === '--version'), args);
    if (action) return `Autopilot: ${name} ${action} acts on a live service. It runs only as a deploy step's own recorded command after that step's compatibility check passed.`;
  }
  return null;
}

// Checks every tail of `w` from index `from`, since a wrapper's own options may take values. The
// first word that looks like a command (not an option, number, duration or assignment) is the
// wrapped command and gets the full check; the other tails get the suffix check.
function checkTails(w, from, cmd, ctx, depth) {
  const first = w.findIndex((x, i) => i >= from && !x.text.startsWith('-') && !/^\d+(\.\d+)?[smhd]?$/.test(x.text) && !ASSIGN_RE.test(x.text));
  for (let i = from; i < w.length; i++) {
    const reason = checkWords(w.slice(i), { ...cmd, redirects: [] }, ctx, depth + 1, i !== first);
    if (reason) return reason;
  }
  return null;
}

function gitReason(name, w, cmd, ctx, depth) {
  if (name !== 'git') {
    if (/^git-(push|send-email|credential|receive-pack|upload-pack)/.test(name)) return `Autopilot: ${name} is blocked (push or stored credentials).`;
    return null;
  }
  const args = w.slice(1);
  let i = 0;
  for (; i < args.length && args[i].text.startsWith('-'); i++) {
    const [opt, inline] = args[i].text.split(/=(.*)/s);
    const value = GIT_VALUE_OPTS.has(opt) ? (inline ?? args[++i]?.text) : null;
    if ((opt === '-c' || opt === '--config-env') && /^alias\./i.test(value ?? '')) return 'Autopilot: defining a git alias on the command line is blocked, because it can hide a push.';
  }
  const subWord = args[i];
  if (!subWord) return null;
  if (subWord.dyn) return opaque(`the git subcommand "${subWord.text}" comes from a variable, glob or substitution`);
  const sub = subWord.text;
  const rest = args.slice(i + 1).map((x) => x.text);
  if (sub === 'push' || sub === 'send-email') return `Autopilot: git ${sub} is a hard stop. The user pushes the run branch after reviewing it.`;
  if ((sub === 'svn' && rest.includes('dcommit')) || (sub === 'p4' && rest.includes('submit')) || (sub === 'lfs' && rest[0] === 'push')) return `Autopilot: git ${sub} ${rest[0]} sends commits to a remote; it is a hard stop.`;
  if (sub === 'credential' || sub === 'credential-cache' || sub === 'credential-store') return 'Autopilot: git credential prints stored credentials and is blocked.';
  if (sub === 'config') {
    const read = rest.some((a) => /^(--get|--get-all|--get-regexp|--get-urlmatch|--list|-l|get|list)$/.test(a));
    if (rest.includes('--edit') || rest.includes('-e')) return 'Autopilot: git config --edit is blocked; set a value with git config <key> <value>.';
    const key = rest.find((a) => !GIT_CONFIG_READ.test(a) && !a.startsWith('-'));
    if (!read && key && GIT_DANGEROUS_KEY.test(key)) return `Autopilot: setting git config ${key} is blocked, because it can hide a push or run a command outside the sandbox.`;
    return null;
  }
  if (sub === 'submodule' && rest.includes('foreach')) {
    const cmdText = rest.slice(rest.indexOf('foreach') + 1).filter((a) => !/^--/.test(a)).join(' ');
    return checkCommand(cmdText, ctx, depth + 1);
  }
  if (sub === 'rebase') {
    for (let j = 0; j < rest.length; j++) {
      const m = rest[j].match(/^(-x|--exec)(=(.*))?$/s);
      if (m) { const reason = checkCommand(m[3] ?? rest[j + 1] ?? '', ctx, depth + 1); if (reason) return reason; }
    }
  }
  if (sub === 'bisect' && rest[0] === 'run') return checkWords(args.slice(i + 2), { ...cmd, redirects: [] }, ctx, depth + 1);
  if (sub === 'filter-branch') {
    for (let j = 0; j < rest.length; j++) {
      if (/^--[\w-]*filter$/.test(rest[j])) { const reason = checkCommand(rest[j + 1] ?? '', ctx, depth + 1); if (reason) return reason; }
    }
  }
  if (sub === 'difftool' || sub === 'mergetool') {
    const x = rest.findIndex((a) => a === '-x' || a === '--extcmd' || a.startsWith('--extcmd='));
    if (x >= 0) { const reason = checkCommand(rest[x].includes('=') ? rest[x].split('=').slice(1).join('=') : rest[x + 1] ?? '', ctx, depth + 1); if (reason) return reason; }
  }
  if (!GIT_COMMON.has(sub)) {
    const alias = gitAlias(sub, ctx);
    if (alias) return alias.startsWith('!') ? checkCommand(alias.slice(1), ctx, depth + 1) : checkWords(['git', ...alias.split(/\s+/), ...rest].map((t) => ({ text: t })), cmd, ctx, depth + 1);
  }
  return null;
}

// Returns a reason to deny the shell command `src`, or null when it may run.
export function checkCommand(src, ctx, depth = 0) {
  let parsed;
  try {
    parsed = parseShell(String(src), { env: ctx.env ?? process.env, depth });
  } catch (err) {
    if (!(err instanceof ParseError)) throw err;
    return `Autopilot: the guard could not parse this command (${err.message}). Write it out plainly and run it again.`;
  }
  for (const cmd of parsed.commands) {
    if (!cmd.words.length) {
      const hit = cmd.redirects.find((r) => isProtectedForBash(r.text));
      if (hit) return `Autopilot: ${hit.text} configures git or Claude Code, and the run may not change it.`;
      continue;
    }
    const reason = checkWords(cmd.words, cmd, ctx, depth);
    if (reason) return reason;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Subagents

// Runs `fn` while holding a lock directory, so parallel hook processes count decider calls one at a time.
function withLock(dir, fn) {
  const lock = path.join(dir, 'decider.lock');
  const until = Date.now() + 3000;
  for (;;) {
    try { fs.mkdirSync(lock); break; } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      // MAGIC: a lock older than 10 s belongs to a hook process that died mid-update.
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 10000) fs.rmdirSync(lock); } catch (e) { debug('withLock stale', e); }
      if (Date.now() > until) throw new Error('could not take the decider counter lock');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  }
  try { return fn(); } finally { fs.rmdirSync(lock); }
}

export function deciderCounterPath(stateDir) { return path.join(stateDir, 'decider-calls.json'); }

export function readDeciderCount(stateDir) {
  return readJson(deciderCounterPath(stateDir)) ?? { used: 0, warned: false };
}

// Decides one decider spawn and records it. Returns { deny?: reason }.
export function deciderCall(input, ctx) {
  const cap = Number(ctx.approved?.deciderCap ?? DEFAULT_DECIDER_CAP);
  const warnAt = Math.ceil(cap * 0.8);
  const state = readJson(path.join(ctx.runDir, 'state.json')) ?? {};
  const model = input.tool_input?.model;
  if (state.deciderModel === 'opus' && model !== 'opus') {
    return { deny: 'Autopilot: this run fell back to Opus for the decider (state.json deciderModel). Call autopilot-decider with model: "opus" and effort: "xhigh".' };
  }
  if (model === 'opus' && state.deciderModel !== 'opus') {
    return { deny: 'Autopilot: before calling the decider on Opus, record the fallback: set "deciderModel": "opus" in state.json and add a FALLBACK ledger entry with the Fable error. Then call it with model: "opus" and effort: "xhigh".' };
  }
  if (model && model !== 'fable' && model !== 'opus') return { deny: 'Autopilot: autopilot-decider runs on model "fable" (effort "high"), or on "opus" (effort "xhigh") after a recorded fallback.' };
  return withLock(ctx.stateDir, () => {
    const count = readDeciderCount(ctx.stateDir);
    if (count.used >= cap) {
      return { deny: `Autopilot: the decider cap is reached (${count.used}/${cap} calls this run). Do not stop the run. Take the asker's own LEAN (or the plan's default when there is none), record it with the ledger helper as kind NODECIDER (Question, Lean, Why fields; it is marked Review: yes), give the worker that answer, and continue. The report lists these under "Decisions made without the decider".` };
    }
    if (count.used + 1 >= warnAt && !count.warned) {
      fs.writeFileSync(deciderCounterPath(ctx.stateDir), JSON.stringify({ ...count, warned: true }), { mode: 0o600 });
      return { deny: `Autopilot: decider budget warning: this would be call ${count.used + 1} of ${cap}. Add a WARN ledger entry ("decider calls ${count.used + 1}/${cap}"), keep only questions a user would really need to answer, then repeat this exact call; it will go through.` };
    }
    fs.writeFileSync(deciderCounterPath(ctx.stateDir), JSON.stringify({ ...count, used: count.used + 1, lastAt: new Date().toISOString() }), { mode: 0o600 });
    return {};
  });
}

function agentDecision(input, ctx) {
  const ti = input.tool_input ?? {};
  // ORDER: foreground first. A `claude -p` run stops background subagents 10 minutes after its last
  // turn (CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS), which killed workers mid-step in three real runs.
  if (ti.run_in_background !== false) {
    return 'Autopilot: start every subagent in the foreground: pass run_in_background: false and wait for its result. A background subagent can be stopped when this unattended session ends its turn.';
  }
  const type = String(ti.subagent_type ?? '');
  if (DOC_KEEPER_RE.test(type)) {
    const state = readJson(path.join(ctx.runDir, 'state.json'));
    const open = state?.steps?.filter((s) => !TERMINAL.has(s.status)) ?? [];
    if (open.length) return `Autopilot: doc-keeper runs once, after every step is finished. Open: ${open.map((s) => s.id).join(', ')}.`;
  }
  if (DECIDER_RE.test(type)) return deciderCall(input, ctx).deny ?? null;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Guard and Stop

export function guardDecision(input, ctx) {
  const root = ctx.root;
  const raw = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (fs.existsSync(path.join(ctx.stateDir, 'STOP'))) {
    // SECURITY: after STOP only reading and writing the run's own records is allowed, so the
    // run can log the stop and write its report but start nothing new.
    if (READ_TOOLS.has(input.tool_name)) return null;
    const runDir = fs.realpathSync(ctx.runDir);
    if (FILE_TOOLS.has(input.tool_name) && !checkFilePath(raw, root) && realTarget(raw).startsWith(runDir + path.sep)) return null;
    return 'Autopilot was stopped by the user (STOP file). Do not start new work: log the stop in ledger.md, write report.md, and end. The launcher commits the run folder.';
  }
  if (input.tool_name === 'Bash') {
    // SECURITY: the outward-facing commands the run must leave to the user (push, store
    // uploads, publishing, live services). Commands hidden inside scripts can't be seen here;
    // the sandbox and the network allowlist stop those.
    return checkCommand(String(input.tool_input?.command ?? ''), ctx);
  }
  if (input.tool_name === 'Agent' || input.tool_name === 'Task') return agentDecision(input, ctx);
  if (!FILE_TOOLS.has(input.tool_name)) return null;
  // SECURITY: file tools run outside the OS sandbox, so this check is what keeps edits inside
  // the clone. Shell commands are confined by the sandbox itself.
  const reason = checkFilePath(raw, root);
  if (reason) return reason;
  if (path.basename(raw) === 'report.md' && realTarget(raw) === path.join(fs.realpathSync(ctx.runDir), 'report.md')) {
    const state = readJson(path.join(ctx.runDir, 'state.json'));
    const open = state?.steps?.filter((s) => !TERMINAL.has(s.status)) ?? [];
    if (open.length) return `Autopilot: report.md is written after every step is finished. Open: ${open.map((s) => s.id).join(', ')}.`;
    if (needsDocs(state)) return 'Autopilot: run doc-keeper (foreground) and commit its changes, then set "docs": "done" in state.json before writing report.md.';
  }
  return null;
}

const needsDocs = (state) => state?.steps?.some((s) => s.status === 'done') && !['done', 'skipped'].includes(state?.docs);

// A subagent that really is still running. Background work is rare now (the guard keeps subagents
// in the foreground), but while one runs the session must be allowed to wait for it.
const liveSubagent = (input) => (input.background_tasks ?? []).find((t) => t.type === 'subagent' && /running|pending/.test(String(t.status ?? 'running')));

export function stopDecision(input, ctx) {
  if (fs.existsSync(path.join(ctx.stateDir, 'STOP'))) return null;
  const statePath = path.join(ctx.runDir, 'state.json');
  const state = readJson(statePath);
  const open = state?.steps?.filter((s) => !TERMINAL.has(s.status)) ?? null;
  const report = fs.existsSync(path.join(ctx.runDir, 'report.md'));
  if (open && open.length === 0 && !needsDocs(state) && report) return null;
  // EXTERNAL: Stop input lists background_tasks; with a subagent still running, ending the turn is
  // how the session waits for it (the launcher lifts the 10-minute wait ceiling).
  if (liveSubagent(input)) return null;

  // ORDER: compare against the fingerprint taken at the previous block. With no change to the
  // ledger or the step states since then, the run is stuck, and blocking again would loop.
  const ledger = path.join(ctx.runDir, 'ledger.md');
  const fingerprint = crypto.createHash('sha256')
    .update(fs.existsSync(ledger) ? fs.readFileSync(ledger) : '')
    .update(fs.existsSync(statePath) ? fs.readFileSync(statePath) : '')
    .digest('hex');
  const markFile = path.join(ctx.stateDir, 'stop-hook.json');
  if (input.stop_hook_active && readJson(markFile)?.fingerprint === fingerprint) return null;
  fs.writeFileSync(markFile, JSON.stringify({ fingerprint }), { mode: 0o600 });
  // writeFileSync's mode applies only when it creates the file.
  fs.chmodSync(markFile, 0o600);

  const running = open?.filter((s) => s.status === 'in_progress') ?? [];
  const next = !open ? 'state.json is missing or not valid JSON: repair it from the ledger before anything else.'
    : running.length ? `${running.map((s) => s.id).join(', ')} ${running.length > 1 ? 'are' : 'is'} in_progress but no worker is running. Follow the run mode's Resume rules: inspect the clone (git status, git diff), add an R ledger entry, then continue from the edits or re-dispatch one foreground worker.`
      : open.length ? `Steps not finished: ${open.map((s) => `${s.id} (${s.status})`).join(', ')}.`
        : needsDocs(state) ? 'Every step is finished: run doc-keeper once in the foreground, commit its changes, set "docs": "done" in state.json, then write report.md.'
          : 'Every step is finished but report.md is missing.';
  return `Autopilot run is not done. ${next} Nobody is watching this session: do not ask the user or wait for an answer. Continue with the autopilot skill's run mode. If you cannot continue a step, mark it blocked in state.json with the reason and a ledger entry, then go on.`;
}

// ---------------------------------------------------------------------------------------------
// Ledger

export const LEDGER_KINDS = {
  start: [], done: ['Commit'], blocked: ['Reason'], 'hard-stop': [], skipped: ['Reason'],
  Q: ['Asked-by', 'Options', 'Context', 'Lean', 'Answer', 'Why', 'Rejected', 'Confidence', 'Reversible', 'Review', 'Model'],
  D: ['By', 'Why'],
  F: ['Evidence', 'Diagnosis', 'Change', 'Diagnosed-by'],
  R: ['Found', 'Action'],
  DEPLOY: ['Compat', 'Rollback', 'Canary'],
  FALLBACK: ['Reason'],
  NODECIDER: ['Question', 'Lean', 'Why'],
  WARN: [], STOP: [], DOCS: ['Result'], REPORT: [], NOTE: [],
};

// Formats one entry; throws when a required field is missing.
export function formatLedgerEntry({ n, at, kind, step, title, fields }) {
  const need = LEDGER_KINDS[kind];
  if (!need) throw new Error(`unknown ledger kind "${kind}" (use one of ${Object.keys(LEDGER_KINDS).join(', ')})`);
  const missing = need.filter((k) => !String(fields[k] ?? '').trim());
  if (missing.length) throw new Error(`a ${kind} entry needs ${missing.join(', ')}`);
  const all = kind === 'NODECIDER' ? { ...fields, Review: 'yes' } : fields;
  const stamp = at.toISOString().slice(0, 16) + 'Z';
  const head = `### [${n}] ${stamp} ${kind}${step && step !== '-' ? ` ${step}` : ''}: ${title}`;
  return [head, ...Object.entries(all).map(([k, v]) => `- ${k}: ${String(v).replace(/\n+/g, ' ').trim()}`)].join('\n');
}

export function nextLedgerNumber(text) {
  let max = 0;
  for (const m of text.matchAll(/^### \[(\d+)\]/gm)) max = Math.max(max, Number(m[1]));
  return max + 1;
}

export function parseFieldLines(text) {
  const fields = {};
  let last = null;
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z][A-Za-z-]*):\s?(.*)$/);
    if (m) { fields[m[1]] = m[2]; last = m[1]; } else if (last && line.trim()) fields[last] += ` ${line.trim()}`;
  }
  return fields;
}

function ledgerMain(argv, runDir) {
  const [kind, step, title, ...rest] = argv;
  if (!kind || !step || !title) throw new Error('usage: autopilot-hooks.mjs ledger <kind> <step|-> "<title>" [Field=value …] [-]');
  const fields = {};
  for (const a of rest) {
    if (a === '-') Object.assign(fields, parseFieldLines(fs.readFileSync(0, 'utf8')));
    else { const eq = a.indexOf('='); if (eq < 1) throw new Error(`field "${a}" is not Field=value`); fields[a.slice(0, eq)] = a.slice(eq + 1); }
  }
  const file = path.join(runDir, 'ledger.md');
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const entry = formatLedgerEntry({ n: nextLedgerNumber(text), at: new Date(), kind, step, title, fields });
  fs.appendFileSync(file, `${text.endsWith('\n') || !text ? '' : '\n'}\n${entry}\n`);
  process.stdout.write(`${entry.split('\n')[0]}\n`);
}

// ---------------------------------------------------------------------------------------------

function contextFromEnv() {
  const { AUTOPILOT_RUN_DIR: runDir, AUTOPILOT_ROOT: root, AUTOPILOT_STATE_DIR: stateDir } = process.env;
  if (!runDir || !root || !stateDir) throw new Error('AUTOPILOT_RUN_DIR / AUTOPILOT_ROOT / AUTOPILOT_STATE_DIR not set');
  return { runDir, root: fs.realpathSync(root), stateDir, env: process.env, approved: readJson(path.join(stateDir, 'approved.json')) ?? {} };
}

const isMain = (() => {
  try { return fs.realpathSync(process.argv[1] ?? '') === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();

if (isMain) {
  const mode = process.argv[2];
  try {
    if (mode === 'ledger') {
      const runDir = process.env.AUTOPILOT_RUN_DIR;
      if (!runDir) throw new Error('AUTOPILOT_RUN_DIR not set: run this inside an autopilot run');
      ledgerMain(process.argv.slice(3), runDir);
    } else {
      const ctx = contextFromEnv();
      const input = JSON.parse(fs.readFileSync(0, 'utf8'));
      if (mode === 'stop') {
        const reason = stopDecision(input, ctx);
        if (reason) process.stdout.write(JSON.stringify({ decision: 'block', reason }));
      } else {
        const reason = guardDecision(input, ctx);
        if (reason) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
      }
    }
  } catch (err) {
    console.error(`[autopilot-hooks ${mode}] ${err.stack || err}`);
    if (mode === 'ledger') process.exit(1);
    // SECURITY: the guard fails closed. A crash must not let a file tool write outside the clone.
    if (mode !== 'stop') process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `Autopilot guard hook failed (${err.message}); the action was blocked to stay safe.` } }));
  }
}
