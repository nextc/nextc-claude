// nextc-core/scripts/ask-level.mjs: the session-start line that switches the asking level.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LINE, contextFor, output } from '../nextc-core/scripts/ask-level.mjs';

const SCRIPT = fileURLToPath(new URL('../nextc-core/scripts/ask-level.mjs', import.meta.url));
const RULE = fileURLToPath(new URL('../rules/nextc-claude/heavy-commands.md', import.meta.url));
const MANIFEST = fileURLToPath(new URL('../nextc-core/.claude-plugin/plugin.json', import.meta.url));

test('normal, unset and unknown values add no context', () => {
  for (const v of [undefined, '', 'normal', 'NORMAL', 'more', 'lesser']) {
    assert.equal(contextFor({ CLAUDE_PLUGIN_OPTION_ASK_LEVEL: v }), null);
    assert.equal(output('SessionStart', { CLAUDE_PLUGIN_OPTION_ASK_LEVEL: v }), '');
  }
});

test('less adds the line the rule looks for, as context for the event', () => {
  for (const v of ['less', 'Less', ' less ']) {
    const out = JSON.parse(output('SubagentStart', { CLAUDE_PLUGIN_OPTION_ASK_LEVEL: v }));
    assert.equal(out.hookSpecificOutput.hookEventName, 'SubagentStart');
    assert.ok(out.hookSpecificOutput.additionalContext.startsWith(LINE));
  }
});

test('the rule names the exact line and the option offers exactly the two levels', () => {
  assert.ok(readFileSync(RULE, 'utf8').includes(`\`${LINE}\``));
  const option = JSON.parse(readFileSync(MANIFEST, 'utf8')).userConfig.ask_level;
  assert.deepEqual(option.options, ['normal', 'less']);
  assert.equal(option.default, 'normal');
});

test('the script prints JSON for less and nothing for normal', () => {
  const run = (level, event) => spawnSync('node', [SCRIPT, event], { encoding: 'utf8', env: { ...process.env, CLAUDE_PLUGIN_OPTION_ASK_LEVEL: level } });
  assert.equal(run('normal', 'SessionStart').stdout, '');
  const less = run('less', 'SessionStart');
  assert.equal(less.status, 0);
  assert.equal(JSON.parse(less.stdout).hookSpecificOutput.hookEventName, 'SessionStart');
});
