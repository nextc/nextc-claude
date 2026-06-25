#!/usr/bin/env node
/**
 * Pre-Commit Quality Gate
 *
 * PreToolUse hook on Bash. When the command is a `git commit`, scans the STAGED
 * content for issues before the commit lands:
 *   - ERROR (blocks, exit 2): hardcoded secrets, leftover `debugger` statements
 *   - WARNING (allows): reachable `console.log`, non-conventional commit subject
 *
 * Enforces git-workflow.md (conventional commits) and safety.md (never commit
 * secrets) at the tool layer. Deliberately does NOT run external linters
 * (eslint/pylint/…) — those are project-specific and slow; this repo's own
 * pre-commit githook + /validate own that. Block contract matches
 * config-protection.js: exit 2 + stderr. Disable with PRECOMMIT_QUALITY=off.
 *
 * Source: adapted (focused core) from affaan-m/ecc scripts/hooks/
 * pre-bash-commit-quality.js (MIT).
 */

'use strict';

const { spawnSync } = require('child_process');

const MAX_STDIN = 1024 * 1024;
const CHECK_EXT = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.rb', '.java', '.kt', '.dart'];

const SECRET_PATTERNS = [
  { re: /sk-[a-zA-Z0-9]{20,}/, name: 'OpenAI API key' },
  { re: /ghp_[a-zA-Z0-9]{36}/, name: 'GitHub personal access token' },
  { re: /AKIA[A-Z0-9]{16}/, name: 'AWS access key id' },
  { re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/, name: 'private key' },
  // Leading (?:^|[^a-z0-9]) anchors the keyword to a token start so a camelCase
  // suffix like `authForgotPassword = '/auth/forgot-password'` isn't read as a
  // `password` credential. Real keys (`apiKey`, `password`, `db_password`,
  // `MY_API_KEY`) still match — they're preceded by start-of-line, whitespace,
  // a quote, or a `_`/`-` separator, never a lowercase letter.
  { re: /(?:^|[^a-z0-9])(?:api[_-]?key|secret|token|password)\s*[=:]\s*['"][^'"]{8,}['"]/i, name: 'hardcoded credential' },
];

function isOff() {
  return /^(0|false|no|off|disabled)$/i.test(String(process.env.PRECOMMIT_QUALITY || '').trim());
}

function git(args) {
  const r = spawnSync('git', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  return r.status === 0 ? r.stdout : null;
}

function stagedFiles() {
  const out = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR']);
  return out ? out.trim().split('\n').filter(Boolean) : [];
}

function checkable(f) {
  return CHECK_EXT.some((e) => f.endsWith(e));
}

function scanFile(file) {
  const content = git(['show', `:${file}`]);
  if (content == null) return [];
  const issues = [];
  content.split('\n').forEach((line, i) => {
    const n = i + 1;
    const trimmed = line.trim();
    const isComment = trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('#');
    for (const { re, name } of SECRET_PATTERNS) {
      if (re.test(line)) issues.push({ sev: 'error', msg: `possible ${name} at ${file}:${n}` });
    }
    if (/\bdebugger\b/.test(line) && !isComment) issues.push({ sev: 'error', msg: `debugger statement at ${file}:${n}` });
    if (line.includes('console.log') && !isComment) issues.push({ sev: 'warn', msg: `console.log at ${file}:${n}` });
  });
  return issues;
}

function commitMessageIssues(command) {
  const m = command.match(/(?:-m|--message)[=\s]+["']([^"']+)["']/);
  if (!m) return [];
  const message = m[1];
  const conventional = /^(feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert)(\(.+\))?!?:\s+.+/;
  const issues = [];
  if (!conventional.test(message)) {
    issues.push({ sev: 'warn', msg: `commit subject is not conventional ("type(scope): description"): "${message.slice(0, 60)}"` });
  }
  return issues;
}

function evaluate(rawInput) {
  let input;
  try {
    input = rawInput.trim() ? JSON.parse(rawInput) : {};
  } catch {
    return { exitCode: 0 };
  }
  if ((input.tool_name || '') !== 'Bash') return { exitCode: 0 };
  const command = (input.tool_input && input.tool_input.command) || '';
  if (!/\bgit\s+commit\b/.test(command) || command.includes('--amend')) return { exitCode: 0 };

  const files = stagedFiles().filter(checkable);
  const issues = [];
  for (const f of files) issues.push(...scanFile(f));
  issues.push(...commitMessageIssues(command));

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

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { if (raw.length < MAX_STDIN) raw += c.substring(0, MAX_STDIN - raw.length); });
process.stdin.on('end', () => {
  let result = { exitCode: 0 };
  try {
    if (!isOff()) result = evaluate(raw);
  } catch (err) {
    console.error('[PreCommitQuality] Error:', err && err.message);
  }
  if (result.stderr) process.stderr.write(result.stderr + '\n');
  if (result.exitCode === 2) process.exit(2);
  process.stdout.write(raw);
  process.exit(0);
});

module.exports = { evaluate, scanFile };
