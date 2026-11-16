#!/usr/bin/env node
/**
 * Upload Guard Hook (PreToolUse, Bash)
 *
 * Denies a fastlane upload lane (name or action contains testflight / upload /
 * deliver / pilot / supply) when:
 *   (a) docs/buildlog.md already records this pubspec version+build as uploaded, or
 *   (b) the command's effective directory is not the Flutter project root or its
 *       ios/ or android/ folder.
 * Everything else is silent (exit 0, no output).
 *
 * This is a convenience guard against double uploads and wrong-directory runs,
 * NOT a security boundary: it fails OPEN on any error or unparseable command.
 * Set NEXTC_UPLOAD_GUARD_DEBUG=1 to see why it decided what it did on stderr.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_STDIN = 1024 * 1024;
const MAX_DEPTH = 4;
const UPLOAD_WORD = /testflight|upload|deliver|pilot|supply/i;
const READ_ONLY_FIRST_ARG = new Set([
  'lanes', 'list', 'env', 'actions', 'action', 'help', 'docs', 'init', 'new_action', 'install_plugins', 'update_fastlane',
]);
const WRAPPERS = new Set(['bundle', 'exec', 'env', 'time', 'nohup', 'command', 'caffeinate', 'sudo', 'arch', 'rbenv', 'rvm']);
const SHELLS = new Set(['sh', 'bash', 'zsh']);

function debug(msg) {
  if (process.env.NEXTC_UPLOAD_GUARD_DEBUG) process.stderr.write(`[upload-guard] ${msg}\n`);
}

/** Removes heredoc bodies so lane names inside them are never inspected. */
function stripHeredocs(src) {
  const lines = src.split('\n');
  const out = [];
  let end = null;
  for (const line of lines) {
    if (end !== null) {
      if (line.trim() === end) end = null;
      continue;
    }
    out.push(line);
    const m = /<<(?!<)-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(line);
    if (m) end = m[2];
  }
  return out.join('\n');
}

/**
 * Splits a shell string into simple commands of words. Quoted text stays inside
 * its word, so operators and lane names inside quotes never split or match.
 * A word is `dynamic` when it holds an expansion ($ or backtick) outside single quotes.
 */
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
  const add = (text, dynamic = false) => {
    word = word ?? { text: '', dynamic: false };
    word.text += text;
    word.dynamic = word.dynamic || dynamic;
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '\\' && i + 1 < src.length) {
      add(src[++i]);
    } else if (ch === "'") {
      const close = src.indexOf("'", i + 1);
      const end = close === -1 ? src.length : close;
      add(src.slice(i + 1, end));
      i = end;
    } else if (ch === '"') {
      let j = i + 1;
      let text = '';
      let dynamic = false;
      while (j < src.length && src[j] !== '"') {
        if (src[j] === '\\' && j + 1 < src.length) j++;
        else if (src[j] === '$' || src[j] === '`') dynamic = true;
        text += src[j++];
      }
      add(text, dynamic);
      i = j;
    } else if (ch === '#' && word === null) {
      const nl = src.indexOf('\n', i);
      i = nl === -1 ? src.length : nl - 1;
    } else if (/[;&|\n()`]/.test(ch)) {
      endCommand();
    } else if (/\s/.test(ch)) {
      endWord();
    } else {
      add(ch, ch === '$');
    }
  }
  endCommand();
  return commands;
}

const isAssignment = (w) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(w.text);

/** Returns the non-option words after `fastlane`, or null when the command is not a fastlane run. */
function fastlaneArgs(words) {
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    const base = path.basename(w.text);
    if (base === 'fastlane') break;
    if (isAssignment(w) || w.text.startsWith('-') || WRAPPERS.has(base)) i++;
    else return null;
  }
  if (i >= words.length) return null;
  return words
    .slice(i + 1)
    .map((w) => w.text)
    .filter((t) => !t.startsWith('-') && !t.includes(':') && !t.includes('='));
}

function isUploadLane(args) {
  if (!args.length || READ_ONLY_FIRST_ARG.has(args[0])) return false;
  return args.some((a) => UPLOAD_WORD.test(a));
}

function realOrResolved(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/** Applies a `cd`/`pushd` to the tracked directory; null means "unknown". */
function applyCd(dir, words) {
  if (dir === null) return null;
  const target = words.slice(1).find((w) => !w.text.startsWith('-'));
  if (!target) return os.homedir();
  if (target.dynamic || target.text === '-' || target.text.startsWith('~')) return null;
  return path.resolve(dir, target.text);
}

function findProjectRoot(startDir) {
  let dir = realOrResolved(startDir);
  for (let i = 0; i < 40; i++) {
    if (fs.existsSync(path.join(dir, 'pubspec.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

function pubspecVersion(root) {
  const text = fs.readFileSync(path.join(root, 'pubspec.yaml'), 'utf8');
  const m = /^version:\s*([0-9][0-9.]*)(?:-[\w.]+)?\+(\d+)/m.exec(text);
  return m ? { version: m[1], build: m[2] } : null;
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True when the buildlog entry for version+build has `**Uploaded:** yes ...`. */
function alreadyUploaded(root, { version, build }) {
  const logPath = path.join(root, 'docs', 'buildlog.md');
  if (!fs.existsSync(logPath)) return false;
  const log = fs.readFileSync(logPath, 'utf8');
  const header = new RegExp(`^##\\s+Build\\b.*${escapeRegExp(version)}\\+${escapeRegExp(build)}(?!\\d)`);
  const lines = log.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!header.test(lines[i])) continue;
    for (let j = i + 1; j < lines.length && !/^##\s/.test(lines[j]); j++) {
      if (/^\s*-\s*\*\*Uploaded:\*\*\s*yes\b/i.test(lines[j])) return true;
    }
  }
  return false;
}

function inspect(src, startDir, root, depth) {
  let dir = startDir;
  for (const words of lex(stripHeredocs(src))) {
    const head = words.find((w) => !isAssignment(w));
    const headBase = head ? path.basename(head.text) : '';
    if (headBase === 'cd' || headBase === 'pushd') {
      dir = applyCd(dir, words.slice(words.indexOf(head)));
      continue;
    }
    if (SHELLS.has(headBase) && depth < MAX_DEPTH) {
      const c = words.findIndex((w) => /^-[a-z]*c$/.test(w.text));
      if (c !== -1 && words[c + 1]) {
        const nested = inspect(words[c + 1].text, dir, root, depth + 1);
        if (nested) return nested;
      }
      continue;
    }
    const args = fastlaneArgs(words);
    if (!args || !isUploadLane(args)) continue;
    debug(`upload lane detected: ${args.join(' ')} (dir=${dir})`);

    if (dir !== null) {
      const effective = realOrResolved(dir);
      const allowed = [root, path.join(root, 'ios'), path.join(root, 'android')].map(realOrResolved);
      if (!allowed.includes(effective)) {
        return `Upload lane "${args.join(' ')}" would run in ${effective}, which is not the project root (${root}) or its ios/ or android/ folder. cd to one of those and run it again.`;
      }
    }
    const current = pubspecVersion(root);
    if (current && alreadyUploaded(root, current)) {
      return `docs/buildlog.md already records ${current.version}+${current.build} as uploaded. Uploading the same build number again collides in App Store Connect. Bump the build number, or correct the buildlog entry if it is wrong.`;
    }
  }
  return null;
}

/** Returns a deny reason, or null to stay silent. */
function check(command, cwd, env = process.env) {
  try {
    if (env.AUTOPILOT_RUN_DIR) return null;
    if (typeof command !== 'string' || !/fastlane/.test(command)) return null;
    const startDir = cwd || process.cwd();
    const root = findProjectRoot(startDir);
    if (!root) {
      debug(`no pubspec.yaml above ${startDir}; staying silent`);
      return null;
    }
    return inspect(command, path.resolve(startDir), root, 0);
  } catch (error) {
    // Fail open: a bug here must never block a legitimate upload.
    debug(`error, failing open: ${error && error.stack}`);
    return null;
  }
}

function run(raw, env = process.env) {
  let input = {};
  try {
    input = raw.trim() ? JSON.parse(raw) : {};
  } catch (error) {
    debug(`bad stdin JSON, failing open: ${error.message}`);
    return null;
  }
  const reason = check(input?.tool_input?.command, input?.cwd, env);
  if (!reason) return null;
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  });
}

module.exports = { check, run };

if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    if (raw.length < MAX_STDIN) raw += chunk.substring(0, MAX_STDIN - raw.length);
  });
  process.stdin.on('end', () => {
    const out = run(raw);
    if (out) process.stdout.write(out + '\n');
    process.exit(0);
  });
}
