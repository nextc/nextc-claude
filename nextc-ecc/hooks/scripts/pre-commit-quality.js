#!/usr/bin/env node
/**
 * Pre-Commit Quality Gate
 *
 * PreToolUse hook on Bash. For every `git commit` the command actually runs,
 * scans the content that will land in the commit:
 *   - ERROR (blocks, exit 2): hardcoded secrets (every text file, since keys
 *     usually live in .env/.json/.yaml/.plist), leftover `debugger`
 *     statements (code files only)
 *   - WARNING (allows): reachable `console.log`, non-conventional commit subject
 * `--amend` is scanned too; `-a` also scans modified tracked files.
 *
 * The command is parsed into words, so text that only mentions "git commit"
 * (echo, a quoted string, a heredoc body) never triggers a scan, and
 * `git -C dir commit` / `cd dir && git commit` scan `dir`, not the session cwd.
 * Limitation: a commit hidden inside `sh -c "..."` or `eval` is not parsed.
 *
 * Block contract: exit 2 + stderr. Prints nothing on stdout. Deliberately does
 * NOT run external linters (project-specific and slow). Disable with
 * PRECOMMIT_QUALITY=off.
 *
 * Source: adapted (focused core) from affaan-m/ecc scripts/hooks/
 * pre-bash-commit-quality.js (MIT).
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const MAX_STDIN = 1024 * 1024;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const CHECK_EXT = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.rb', '.java', '.kt', '.dart'];
const CONVENTIONAL = /^(feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert)(\(.+\))?!?:\s+.+/;
const AUTO_SUBJECT = /^(fixup!|squash!|amend!|Merge |Revert ")/;

// Git global options that take the next word as their value (git --help).
const GIT_VALUE_OPTS = new Set(['-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--exec-path', '--config-env']);
// Short `git commit` options whose value is attached or is the next word.
const COMMIT_VALUE_SHORTS = new Set(['m', 'F', 'C', 'c', 't']);
const COMMIT_ATTACHED_ONLY_SHORTS = new Set(['u', 'S']);

const SECRET_PATTERNS = [
  // \b keeps words ending in "sk" (task-, desk-) from matching now that the
  // body allows `-`/`_`, which Anthropic (sk-ant-…) and OpenAI project keys contain.
  { re: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/, name: 'Anthropic/OpenAI API key' },
  { re: /\bgh[pousr]_[A-Za-z0-9]{36}/, name: 'GitHub token' },
  { re: /\bgithub_pat_[A-Za-z0-9_]{22,}/, name: 'GitHub fine-grained token' },
  { re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/, name: 'Slack token' },
  { re: /\bAIza[0-9A-Za-z_-]{35}/, name: 'Google API key' },
  { re: /\b[sr]k_live_[0-9A-Za-z]{24,}/, name: 'Stripe live key' },
  { re: /AKIA[A-Z0-9]{16}/, name: 'AWS access key id' },
  { re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/, name: 'private key' },
  // Leading (?:^|[^a-z0-9]) anchors the keyword to a token start so a camelCase
  // suffix like `authForgotPassword = '/auth/forgot-password'` isn't read as a
  // `password` credential. Real keys (`apiKey`, `password`, `db_password`,
  // `MY_API_KEY`) still match — they're preceded by start-of-line, whitespace,
  // a quote, or a `_`/`-` separator, never a lowercase letter.
  { re: /(?:^|[^a-z0-9])(?:api[_-]?key|secret|token|password)\s*[=:]\s*['"][^'"]{8,}['"]/i, name: 'hardcoded credential' },
];

const HEREDOC_MARK = '\u0000H';
const HEREDOC_RE = /<<-?[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[^\n]*\n([\s\S]*?)\n[ \t]*\2(?![A-Za-z0-9_])/g;

function isOff() {
  return /^(0|false|no|off|disabled)$/i.test(String(process.env.PRECOMMIT_QUALITY || '').trim());
}

/**
 * Replaces each heredoc (operator, body and terminator) with a marker word so
 * apostrophes and quotes in the body cannot unbalance the lexer.
 */
function extractHeredocs(src) {
  const bodies = [];
  const text = src.replace(HEREDOC_RE, (_m, _q, _delim, body) => {
    bodies.push(body);
    return `${HEREDOC_MARK}${bodies.length - 1}\u0000`;
  });
  return { text, bodies };
}

/** Splits a shell string into simple commands, each a list of words (quotes removed). */
function lex(src) {
  const commands = [];
  let words = [];
  let word = null;
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
    } else if (ch === "'") {
      const close = src.indexOf("'", i + 1);
      const end = close === -1 ? src.length : close;
      word = (word ?? '') + src.slice(i + 1, end);
      i = end;
    } else if (ch === '"') {
      let j = i + 1;
      let chunk = '';
      while (j < src.length && src[j] !== '"') {
        if (src[j] === '\\' && j + 1 < src.length) j++;
        chunk += src[j++];
      }
      word = (word ?? '') + chunk;
      i = j;
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
  return commands;
}

function isGit(word) {
  return /(^|\/)git(\.exe)?$/.test(word);
}

function resolveMessage(word, bodies) {
  const heredoc = word.match(/^\$\(\s*cat\s+\u0000H(\d+)\u0000\s*\)$/);
  if (heredoc) return bodies[Number(heredoc[1])] ?? null;
  const direct = word.match(/^\u0000H(\d+)\u0000$/);
  if (direct) return bodies[Number(direct[1])] ?? null;
  // ASSUMPTION: any other substitution cannot be evaluated statically, so the subject check is skipped.
  if (word.includes('$(') || word.includes('`') || word.includes('\u0000')) return null;
  return word;
}

function parseCommitArgs(args, bodies) {
  let all = false;
  let message = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') break;
    if (a === '--all') all = true;
    else if (a === '--message') message = message ?? (args[++i] ?? null);
    else if (a.startsWith('--message=')) message = message ?? a.slice('--message='.length);
    else if (a.startsWith('--') || !a.startsWith('-') || a === '-') continue;
    else {
      for (let j = 1; j < a.length; j++) {
        const flag = a[j];
        if (flag === 'a') all = true;
        if (COMMIT_ATTACHED_ONLY_SHORTS.has(flag)) break;
        if (COMMIT_VALUE_SHORTS.has(flag)) {
          const attached = a.slice(j + 1);
          const value = attached || (args[++i] ?? '');
          if (flag === 'm' && message === null) message = value;
          break;
        }
      }
    }
  }
  return { all, message: message === null ? null : resolveMessage(message, bodies) };
}

/**
 * Returns one entry per `git commit` the command runs: the directory it runs
 * in, whether `-a` was given, and the commit message when it is statically known.
 */
function extractCommits(command, baseCwd) {
  const { text, bodies } = extractHeredocs(command);
  const commits = [];
  let cwd = baseCwd;
  for (const words of lex(text)) {
    let at = 0;
    while (at < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[at])) at++;
    const head = words[at];
    if (head === 'cd' && words[at + 1] && words[at + 1] !== '-') {
      cwd = path.resolve(cwd, words[at + 1]);
      continue;
    }
    if (!head || !isGit(head)) continue;
    let dir = cwd;
    let i = at + 1;
    while (i < words.length && words[i].startsWith('-')) {
      const opt = words[i];
      if (opt === '-C' && words[i + 1] !== undefined) dir = path.resolve(dir, words[i + 1]);
      i += opt === '-C' || GIT_VALUE_OPTS.has(opt) ? 2 : 1;
    }
    if (words[i] !== 'commit') continue;
    commits.push({ dir, ...parseCommitArgs(words.slice(i + 1), bodies) });
  }
  return commits;
}

function git(dir, args) {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: MAX_FILE_BYTES });
  return r.status === 0 ? r.stdout : null;
}

function nameList(dir, args) {
  const out = git(dir, [...args, '--name-only', '--diff-filter=ACMR', '-z']);
  return out ? out.split('\0').filter(Boolean) : [];
}

function isCode(file) {
  return CHECK_EXT.some((e) => file.endsWith(e));
}

function scanContent(file, content) {
  if (content == null || content.includes('\0')) return [];
  const code = isCode(file);
  const issues = [];
  content.split('\n').forEach((line, i) => {
    const n = i + 1;
    const trimmed = line.trim();
    const isComment = trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('#');
    for (const { re, name } of SECRET_PATTERNS) {
      if (re.test(line)) issues.push({ sev: 'error', msg: `possible ${name} at ${file}:${n}` });
    }
    if (!code) return;
    if (/^\s*debugger\s*;?\s*$/.test(line)) issues.push({ sev: 'error', msg: `debugger statement at ${file}:${n}` });
    if (line.includes('console.log') && !isComment) issues.push({ sev: 'warn', msg: `console.log at ${file}:${n}` });
  });
  return issues;
}

function commitSubjectIssues(message) {
  if (message == null) return [];
  const subject = message.split('\n')[0].trim();
  if (!subject || AUTO_SUBJECT.test(subject) || CONVENTIONAL.test(subject)) return [];
  return [{ sev: 'warn', msg: `commit subject is not conventional ("type(scope): description"): "${subject.slice(0, 60)}"` }];
}

function scanCommit({ dir, all }) {
  const issues = [];
  for (const f of nameList(dir, ['diff', '--cached'])) {
    issues.push(...scanContent(f, git(dir, ['show', `:${f}`])));
  }
  if (all) {
    const top = (git(dir, ['rev-parse', '--show-toplevel']) || '').trim();
    for (const f of nameList(dir, ['diff'])) {
      let content = null;
      try {
        content = fs.readFileSync(path.join(top, f), 'utf8');
      } catch (err) {
        if (process.env.PRECOMMIT_QUALITY_DEBUG) console.error(`[PreCommitQuality] cannot read ${f}: ${err.message}`);
      }
      issues.push(...scanContent(f, content));
    }
  }
  return issues;
}

function evaluate(rawInput) {
  let input;
  try {
    input = rawInput.trim() ? JSON.parse(rawInput) : {};
  } catch (err) {
    if (process.env.PRECOMMIT_QUALITY_DEBUG) console.error(`[PreCommitQuality] unparseable hook input: ${err.message}`);
    return { exitCode: 0 };
  }
  if ((input.tool_name || '') !== 'Bash') return { exitCode: 0 };
  const command = (input.tool_input && input.tool_input.command) || '';
  if (typeof command !== 'string' || !/\bcommit\b/.test(command)) return { exitCode: 0 };

  const commits = extractCommits(command, input.cwd || process.cwd());
  const seen = new Set();
  const issues = [];
  for (const commit of commits) {
    for (const issue of [...scanCommit(commit), ...commitSubjectIssues(commit.message)]) {
      const key = `${issue.sev}:${issue.msg}`;
      if (!seen.has(key)) {
        seen.add(key);
        issues.push(issue);
      }
    }
  }
  if (issues.length === 0) return { exitCode: 0 };

  const errors = issues.filter((i) => i.sev === 'error');
  const warns = issues.filter((i) => i.sev === 'warn');
  const lines = [];
  if (errors.length) {
    lines.push('[Pre-Commit Quality] Commit BLOCKED — fix these first:');
    errors.forEach((e) => lines.push(`  ERROR: ${e.msg}`));
  }
  if (warns.length) {
    lines.push(errors.length ? 'Warnings (not blocking):' : '[Pre-Commit Quality] Warnings (commit allowed):');
    warns.forEach((w) => lines.push(`  WARN: ${w.msg}`));
  }
  if (errors.length) {
    lines.push('Rotate any exposed secret immediately (git rm does not erase history). Disable: PRECOMMIT_QUALITY=off');
    return { exitCode: 2, stderr: lines.join('\n') };
  }
  return { exitCode: 0, stderr: lines.join('\n') };
}

module.exports = { evaluate, extractCommits, commitSubjectIssues, scanContent };

if (require.main === module) {
  let raw = '';
  let truncated = false;
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => {
    if (raw.length < MAX_STDIN) raw += c.substring(0, MAX_STDIN - raw.length);
    if (raw.length >= MAX_STDIN) truncated = true;
  });
  process.stdin.on('end', () => {
    let result = { exitCode: 0 };
    if (truncated) {
      result = { exitCode: 2, stderr: `BLOCKED: Hook input exceeded ${MAX_STDIN} bytes. Refusing to skip the commit scan on a truncated command.` };
    } else if (!isOff()) {
      try {
        result = evaluate(raw);
      } catch (err) {
        if (process.env.PRECOMMIT_QUALITY_DEBUG) console.error('[PreCommitQuality] Error:', err && err.stack);
        result = { exitCode: 2, stderr: `BLOCKED: pre-commit-quality crashed (${err && err.message}). Set PRECOMMIT_QUALITY=off to bypass.` };
      }
    }
    if (result.stderr) process.stderr.write(result.stderr + '\n');
    process.exit(result.exitCode === 2 ? 2 : 0);
  });
}
