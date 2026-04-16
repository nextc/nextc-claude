/**
 * Bundled Claude Code specs for validation.
 * Source: https://code.claude.com/docs/en/skills, /sub-agents, /hooks, /plugins-reference
 * Last synced: 2026-04-09
 */

'use strict';

// --- Skill SKILL.md frontmatter ---
const VALID_SKILL_FIELDS = new Set([
  'name',
  'description',
  'argument-hint',
  'disable-model-invocation',
  'user-invocable',
  'allowed-tools',
  'model',
  'effort',
  'context',
  'agent',
  'hooks',
  'paths',
  'shell',
]);

// --- Agent frontmatter ---
const VALID_AGENT_FIELDS = new Set([
  'name',
  'description',
  'tools',
  'disallowedTools',
  'model',
  'permissionMode',
  'maxTurns',
  'skills',
  'mcpServers',
  'hooks',
  'memory',
  'background',
  'effort',
  'isolation',
  'color',
  'initialPrompt',
]);

// Fields ignored for plugin-shipped agents (security restriction)
const PLUGIN_IGNORED_AGENT_FIELDS = new Set([
  'hooks',
  'mcpServers',
  'permissionMode',
]);

// --- Hook event types ---
const VALID_HOOK_EVENTS = new Set([
  'SessionStart',
  'SessionEnd',
  'InstructionsLoaded',
  'ConfigChange',
  'CwdChanged',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'PermissionDenied',
  'UserPromptSubmit',
  'Notification',
  'SubagentStart',
  'SubagentStop',
  'TaskCreated',
  'TaskCompleted',
  'TeammateIdle',
  'Elicitation',
  'ElicitationResult',
  'PreCompact',
  'PostCompact',
  'WorktreeCreate',
  'WorktreeRemove',
  'StopFailure',
  'FileChanged',
  'Stop',
]);

// --- Hook handler types ---
const VALID_HOOK_TYPES = new Set([
  'command',
  'http',
  'prompt',
  'agent',
]);

// --- Model shorthand values ---
const VALID_MODEL_SHORTHANDS = new Set([
  'sonnet',
  'opus',
  'haiku',
  'inherit',
]);

// Full model ID pattern: claude-{family}-{version} or similar
const MODEL_ID_PATTERN = /^claude-[a-z0-9-]+$/;

// --- Effort levels ---
const VALID_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

// --- Agent display colors ---
const VALID_COLORS = new Set([
  'red', 'blue', 'green', 'yellow',
  'purple', 'orange', 'pink', 'cyan',
]);

// --- Permission modes ---
const VALID_PERMISSION_MODES = new Set([
  'default',
  'acceptEdits',
  'auto',
  'dontAsk',
  'bypassPermissions',
  'plan',
]);

// --- Isolation values ---
const VALID_ISOLATION_VALUES = new Set(['worktree']);

// --- Memory scopes ---
const VALID_MEMORY_SCOPES = new Set(['user', 'project', 'local']);

// --- Repo-specific: model tier assignments from rules/nextc-claude/agents.md ---
const MODEL_TIER_TABLE = {
  'doc-keeper': 'haiku',
  'flutter-builder': 'haiku',
  'flutter-l10n-agent': 'sonnet',
  'ui-ux-developer': 'sonnet',
  'aso-director': 'sonnet',
  'planner': 'opus',
  'architect': 'opus',
  'code-reviewer': 'sonnet',
  'security-reviewer': 'sonnet',
  'code-architect': 'sonnet',
  'code-explorer': 'sonnet',
  'code-simplifier': 'sonnet',
  'silent-failure-hunter': 'sonnet',
  'build-error-resolver': 'sonnet',
  'refactor-cleaner': 'sonnet',
  'opensource-forker': 'sonnet',
  'opensource-sanitizer': 'sonnet',
  'opensource-packager': 'sonnet',
};

// --- Content antipatterns ---
// These scan rule bodies, agent bodies, and skill bodies for language that
// either (1) hardcodes claims about Claude/tool capabilities that age poorly,
// or (2) causes repeated online fetches that cost tokens each session.
// Each pattern is heuristic — emitted as WARN so authors can review.
const CONTENT_ANTIPATTERNS = [
  {
    id: 'C01',
    label: 'capability-restriction',
    hint: 'avoid hardcoding Claude/tool limitations — describe a resolution order so future capabilities naturally take precedence',
    patterns: [
      /\bCANNOT\b/,
      /\b(cannot|can'?t) be (overridden|changed|modified|configured|set)\b/i,
      /\bdoes not (support|accept|allow|expose)\b/i,
      /\bis not (supported|possible|available) (by|in|for|through|via) (claude|the agent|the tool|agent\(\)|subagent)/i,
      /\bnever supports?\b/i,
    ],
  },
  {
    id: 'C02',
    label: 'repeated-fetch',
    hint: 'the Agent() tool schema, CLAUDE.md, and rules are already in your system prompt — avoid instructions that trigger extra fetches each session',
    patterns: [
      /\b(check|fetch|verify|consult|visit|reload|retrieve|read)\s+(?:the\s+)?(?:current|latest|online|upstream|updated|remote|live)\s+(?:claude(?:\s+code)?\s+)?(?:docs|documentation|specs?|api|website|reference)\b/i,
      /\bfetch\b[^.]{0,60}\b(each|every)\s+(session|turn|invocation|call|prompt|request|response)\b/i,
    ],
  },
];

// --- Kebab-case pattern ---
const KEBAB_CASE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// --- Skill name pattern (lowercase letters, numbers, hyphens, max 64 chars) ---
const SKILL_NAME_PATTERN = /^[a-z0-9-]{1,64}$/;

// --- Semver pattern ---
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;

module.exports = {
  VALID_SKILL_FIELDS,
  VALID_AGENT_FIELDS,
  PLUGIN_IGNORED_AGENT_FIELDS,
  VALID_HOOK_EVENTS,
  VALID_HOOK_TYPES,
  VALID_MODEL_SHORTHANDS,
  MODEL_ID_PATTERN,
  VALID_EFFORTS,
  VALID_COLORS,
  VALID_PERMISSION_MODES,
  VALID_ISOLATION_VALUES,
  VALID_MEMORY_SCOPES,
  MODEL_TIER_TABLE,
  CONTENT_ANTIPATTERNS,
  KEBAB_CASE_PATTERN,
  SKILL_NAME_PATTERN,
  SEMVER_PATTERN,
};
