#!/usr/bin/env node
/**
 * Strategic Compact Suggester
 *
 * PreToolUse hook on Edit|Write. Counts tool calls per session and prints a
 * suggestion to stderr after a threshold so the user can decide whether to
 * /compact at a logical phase boundary (auto-compact fires at arbitrary points).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const MAX_STDIN = 1024 * 1024;
let raw = '';
let truncated = /^(1|true|yes)$/i.test(String(process.env.ECC_HOOK_INPUT_TRUNCATED || ''));

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function run() {
  const sessionId = (process.env.CLAUDE_SESSION_ID || 'default').replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
  const counterFile = path.join(os.tmpdir(), `claude-tool-count-${sessionId}`);
  const rawThreshold = parseInt(process.env.COMPACT_THRESHOLD || '50', 10);
  const threshold = Number.isFinite(rawThreshold) && rawThreshold > 0 && rawThreshold <= 10000
    ? rawThreshold
    : 50;

  let count = 1;

  // ORDER: read existing count + write new count under one fd to keep the
  // race window short. The race is accepted as benign — at worst the
  // suggestion fires one tool-call late under heavy parallelism.
  try {
    const fd = fs.openSync(counterFile, 'a+');
    try {
      const buf = Buffer.alloc(64);
      const bytesRead = fs.readSync(fd, buf, 0, 64, 0);
      if (bytesRead > 0) {
        const parsed = parseInt(buf.toString('utf8', 0, bytesRead).trim(), 10);
        count = (Number.isFinite(parsed) && parsed > 0 && parsed <= 1000000)
          ? parsed + 1
          : 1;
      }
      fs.ftruncateSync(fd, 0);
      fs.writeSync(fd, String(count), 0);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    writeFile(counterFile, String(count));
  }

  let message = '';
  if (count === threshold) {
    message = `[StrategicCompact] ${threshold} tool calls reached - consider /compact if transitioning phases`;
  } else if (count > threshold && (count - threshold) % 25 === 0) {
    message = `[StrategicCompact] ${count} tool calls - good checkpoint for /compact if context is stale`;
  }

  return { exitCode: 0, stderr: message || undefined };
}

module.exports = { run };

// ORDER: subscribe to stdin BEFORE async work — Node will buffer chunks until
// the 'end' handler fires, and the hook contract requires us to echo raw
// stdin back on stdout so downstream PreToolUse hooks (and the tool itself)
// see the original input.
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
  let result;
  try {
    result = run();
  } catch (err) {
    console.error('[StrategicCompact] Error:', err.message);
    result = { exitCode: 0 };
  }

  if (result.stderr) {
    process.stderr.write(result.stderr + '\n');
  }

  // EXTERNAL: hook chain expects this stdout passthrough — without it the
  // next PreToolUse hook (or the tool itself) sees empty input.
  process.stdout.write(raw);
  process.exit(result.exitCode || 0);
});
