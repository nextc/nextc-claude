#!/usr/bin/env node
/**
 * Tool Awareness Hook
 *
 * Fires on PreToolUse for Agent and Skill calls.
 * Logs a concise line to stderr so the user sees which
 * agents/skills are being invoked in real time.
 *
 * Exit codes:
 *   0 = always allow (this hook is informational only)
 */

'use strict';

const MAX_STDIN = 1024 * 1024;
let raw = '';
let truncated = /^(1|true|yes)$/i.test(String(process.env.ECC_HOOK_INPUT_TRUNCATED || ''));

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

function formatAgent(input) {
  const type = input.subagent_type || 'general-purpose';
  const model = input.model || 'default';
  const desc = input.description || '';
  const line = desc
    ? `[Agent] ${type} (${model}) — ${desc}`
    : `[Agent] ${type} (${model})`;
  return line;
}

function formatSkill(input) {
  const skill = input.skill || 'unknown';
  const args = input.args || '';
  return args
    ? `[Skill] ${skill} ${args}`
    : `[Skill] ${skill}`;
}

function run(inputOrRaw, options = {}) {
  const input = parseInput(inputOrRaw);
  const toolName = input.tool_name || '';
  const toolInput = input.tool_input || {};
  const suffix = options.truncated ? ' (truncated)' : '';

  let message = '';
  if (toolName === 'Agent') {
    message = formatAgent(toolInput) + suffix;
  } else if (toolName === 'Skill') {
    message = formatSkill(toolInput) + suffix;
  }

  return { exitCode: 0, stderr: message || undefined };
}

module.exports = { run };

// Stdin fallback for spawnSync execution
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
  const result = run(raw, { truncated });

  if (result.stderr) {
    process.stderr.write(result.stderr + '\n');
  }

  process.stdout.write(raw);
  process.exit(0);
});
