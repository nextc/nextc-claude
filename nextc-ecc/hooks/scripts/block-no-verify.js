#!/usr/bin/env node
/**
 * Block No-Verify Hook
 *
 * Blocks git commands that skip client-side hooks: --no-verify, `git commit -n`,
 * and a core.hooksPath override. Adapted from the block-no-verify npm package
 * (MIT), which checked `-n` against the whole Bash string, so `git commit ...;
 * grep -n x` was blocked. Here each simple command is checked on its own words.
 *
 * Exit codes:
 *   0 = allow
 *   2 = block
 */

'use strict';

const MAX_STDIN = 1024 * 1024;
let raw = '';

const GIT_COMMANDS_WITH_NO_VERIFY = new Set(['commit', 'push', 'merge', 'cherry-pick', 'rebase', 'am']);

// Global git options that take the next word as their value (git --help).
const GIT_VALUE_OPTS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--exec-path', '--config-env']);

// Short commit options whose value is attached or is the next word (git commit --help).
const COMMIT_VALUE_SHORTS = new Set(['m', 'F', 'C', 'c', 't']);
const COMMIT_ATTACHED_ONLY_SHORTS = new Set(['u', 'S']);

/**
 * Splits a shell string into simple commands, each a list of unquoted words.
 * Quoted text is also returned in `nested`, because it may itself be run
 * (sh -c "...", eval "...", "$(...)").
 */
function lex(src) {
  const commands = [];
  const nested = [];
  let words = [];
  let word = null;
  let quoted = '';
  const endWord = () => {
    if (word !== null) words.push(word);
    word = null;
  };
  const endCommand = () => {
    endWord();
    if (words.length) commands.push(words);
    words = [];
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '\\' && i + 1 < src.length) {
      word = (word ?? '') + src[++i];
    } else if (ch === "'" || ch === '"') {
      const close = src.indexOf(ch, i + 1);
      const end = close === -1 ? src.length : close;
      quoted = src.slice(i + 1, end);
      nested.push(quoted);
      word = (word ?? '') + quoted;
      i = end;
    } else if (ch === '#' && word === null) {
      const nl = src.indexOf('\n', i);
      i = nl === -1 ? src.length : nl - 1;
    } else if (/[;&|\n()`]/.test(ch)) {
      endCommand();
    } else if (/\s/.test(ch)) {
      endWord();
    } else {
      word = (word ?? '') + ch;
    }
  }
  endCommand();
  return { commands, nested };
}

function isGit(word) {
  return /(^|\/)git(\.exe)?$/.test(word);
}

function hooksPathOverride(word) {
  return /^core\.hookspath\s*=/i.test(word);
}

function commitSkipsHooks(args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') return false;
    if (a.startsWith('--') || !a.startsWith('-') || a === '-') continue;
    for (let j = 1; j < a.length; j++) {
      const flag = a[j];
      if (flag === 'n') return true;
      if (COMMIT_ATTACHED_ONLY_SHORTS.has(flag)) break;
      if (COMMIT_VALUE_SHORTS.has(flag)) {
        if (j === a.length - 1) i++;
        break;
      }
    }
  }
  return false;
}

function checkWords(words) {
  const at = words.findIndex(isGit);
  if (at === -1) return null;
  let i = at + 1;
  while (i < words.length && words[i].startsWith('-')) {
    const opt = words[i];
    if (opt === '-c' && hooksPathOverride(words[i + 1] ?? '')) return 'Overriding core.hooksPath';
    if (/^-c.+/.test(opt) && hooksPathOverride(opt.slice(2))) return 'Overriding core.hooksPath';
    i += GIT_VALUE_OPTS.has(opt) ? 2 : 1;
  }
  const sub = words[i];
  if (!GIT_COMMANDS_WITH_NO_VERIFY.has(sub)) return null;
  const args = words.slice(i + 1);
  if (args.some((a) => a === '--no-verify')) return `--no-verify with git ${sub}`;
  if (sub === 'commit' && commitSkipsHooks(args)) return '-n (--no-verify) with git commit';
  return null;
}

const MAX_DEPTH = 8;

function check(src, depth = 0) {
  if (depth > MAX_DEPTH) return null;
  const { commands, nested } = lex(src);
  for (const words of commands) {
    const reason = checkWords(words);
    if (reason) return reason;
  }
  // SECURITY: quoted text can be a command (sh -c, eval, "$(...)"), so it is checked too;
  // a commit message that quotes a bypassing git command is blocked as well.
  for (const inner of nested) {
    if (/\bgit\b/.test(inner)) {
      const reason = check(inner, depth + 1);
      if (reason) return reason;
    }
  }
  return null;
}

function parseInput(inputOrRaw) {
  if (typeof inputOrRaw === 'string') {
    try {
      return inputOrRaw.trim() ? JSON.parse(inputOrRaw) : {};
    } catch {
      return {};
    }
  }

  return inputOrRaw && typeof inputOrRaw === 'object' ? inputOrRaw : {};
}

function run(inputOrRaw, options = {}) {
  if (options.truncated) {
    return {
      exitCode: 2,
      stderr: `BLOCKED: Hook input exceeded ${options.maxStdin || MAX_STDIN} bytes. Refusing to check a truncated command.`,
    };
  }

  const input = parseInput(inputOrRaw);
  const command = input?.tool_input?.command;
  if (typeof command !== 'string' || !command) return { exitCode: 0 };

  const reason = check(command);
  if (reason) {
    return {
      exitCode: 2,
      stderr: `BLOCKED: ${reason} is not allowed. Git hooks must not be bypassed.`,
    };
  }

  return { exitCode: 0 };
}

module.exports = { run, check };

if (require.main === module) {
  let truncated = false;
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    if (raw.length < MAX_STDIN) {
      const remaining = MAX_STDIN - raw.length;
      raw += chunk.substring(0, remaining);
      if (chunk.length > remaining) truncated = true;
    } else {
      truncated = true;
    }
  });

  process.stdin.on('end', () => {
    const result = run(raw, { truncated, maxStdin: MAX_STDIN });
    if (result.stderr) process.stderr.write(result.stderr + '\n');
    if (result.exitCode === 2) process.exit(2);
    process.stdout.write(raw);
  });
}
