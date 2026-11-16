#!/usr/bin/env node
/**
 * Config Protection Hook
 *
 * Blocks modifications to linter/formatter config files.
 * Agents frequently modify these to make checks pass instead of fixing
 * the actual code. This hook steers the agent back to fixing the source.
 *
 * Exit codes:
 *   0 = allow (not a config file)
 *   2 = block (config file modification attempted)
 */

'use strict';

const path = require('path');

const MAX_STDIN = 1024 * 1024;
const PROTECTED_FILES = new Set([
  // ESLint (legacy + v9 flat config, JS/TS/MJS/CJS)
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yml',
  '.eslintrc.yaml',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  'eslint.config.mts',
  'eslint.config.cts',
  // Prettier (all config variants including ESM)
  '.prettierrc',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.json',
  '.prettierrc.yml',
  '.prettierrc.yaml',
  'prettier.config.js',
  'prettier.config.cjs',
  'prettier.config.mjs',
  // Biome
  'biome.json',
  'biome.jsonc',
  // Ruff (Python)
  '.ruff.toml',
  'ruff.toml',
  // Note: pyproject.toml is intentionally NOT included here because it
  // contains project metadata alongside linter config. Blocking all edits
  // to pyproject.toml would prevent legitimate dependency changes.
  // Shell / Style / Markdown
  '.shellcheckrc',
  '.stylelintrc',
  '.stylelintrc.json',
  '.stylelintrc.yml',
  '.markdownlint.json',
  '.markdownlint.yaml',
  '.markdownlintrc',
  // Dart / Flutter analyzer, cross-editor style
  'analysis_options.yaml',
  '.editorconfig',
]);

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

/**
 * Pure decision function: returns { exitCode, stderr? } for a hook payload.
 */
function run(inputOrRaw, options = {}) {
  if (options.truncated) {
    return {
      exitCode: 2,
      stderr:
        `BLOCKED: Hook input exceeded ${options.maxStdin || MAX_STDIN} bytes. ` +
        'Refusing to bypass config-protection on a truncated payload. ' +
        'Retry with a smaller edit.'
    };
  }

  const input = parseInput(inputOrRaw);
  // EXTERNAL: Edit/Write send `file_path`; NotebookEdit sends `notebook_path` (code.claude.com/docs/en/permissions).
  const toolInput = input?.tool_input || {};
  const filePath = toolInput.file_path || toolInput.notebook_path || toolInput.file || '';
  if (!filePath) return { exitCode: 0 };

  const basename = path.basename(filePath);
  if (PROTECTED_FILES.has(basename)) {
    return {
      exitCode: 2,
      stderr:
        `BLOCKED: ${basename} is a linter/formatter config; editing it is not allowed. ` +
        'Fix the source code to satisfy the rules instead of weakening the config. ' +
        'If the config change itself is the task, ask the user to make it or to approve it explicitly. ' +
        'In an unattended run (no human to ask), do not work around this: mark the step blocked and report it.',
    };
  }

  return { exitCode: 0 };
}

module.exports = { run, PROTECTED_FILES };

if (require.main === module) {
  let raw = '';
  let truncated = /^(1|true|yes)$/i.test(String(process.env.ECC_HOOK_INPUT_TRUNCATED || ''));
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (raw.length < MAX_STDIN) {
      const remaining = MAX_STDIN - raw.length;
      raw += chunk.substring(0, remaining);
      if (chunk.length > remaining) truncated = true;
    } else {
      truncated = true;
    }
  });

  process.stdin.on('end', () => {
    const result = run(raw, {
      truncated,
      maxStdin: Number(process.env.ECC_HOOK_INPUT_MAX_BYTES) || MAX_STDIN,
    });
    if (result.stderr) process.stderr.write(result.stderr + '\n');
    process.exit(result.exitCode === 2 ? 2 : 0);
  });
}
