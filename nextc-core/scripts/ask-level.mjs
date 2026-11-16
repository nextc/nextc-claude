#!/usr/bin/env node
// Tells the session which asking level is set, so rules/nextc-claude/heavy-commands.md can
// apply it. Runs at session start (and for each subagent, which gets the rules but not the
// session's start context).
//
// EXTERNAL: the line printed here is matched word for word by heavy-commands.md
// ("nextc ask level: less"). `normal` is the rule's default, so nothing is printed for it and
// a session at the default level carries no extra context.
import { fileURLToPath } from 'node:url';

export const LINE = 'nextc ask level: less';

// EXTERNAL: Claude Code exports each plugin option to hook processes as
// CLAUDE_PLUGIN_OPTION_<KEY>, the key uppercased (plugins reference, "Reference a saved value").
export function contextFor(env) {
  return String(env.CLAUDE_PLUGIN_OPTION_ASK_LEVEL ?? '').trim().toLowerCase() === 'less'
    ? `${LINE}\nThe user set the nextc asking level to "less": follow the "less" column in the "Approvals and Heavy Commands" rule.`
    : null;
}

export function output(event, env) {
  const text = contextFor(env);
  if (text === null) return '';
  return JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const event = process.argv[2] === 'SubagentStart' ? 'SubagentStart' : 'SessionStart';
  const out = output(event, process.env);
  if (out !== '') process.stdout.write(`${out}\n`);
}
