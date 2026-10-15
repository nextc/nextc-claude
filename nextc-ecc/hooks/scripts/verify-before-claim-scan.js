#!/usr/bin/env node
/**
 * Verify-Before-Claim Phrase Scanner
 *
 * Stop hook. Fires when the main agent finishes a turn. Scans the final
 * assistant message for the "red-flag" hedge phrases enumerated in
 * rules/nextc-claude/verify-before-claim.md and, if any are present, surfaces a
 * reminder to verify each claim in-session or tag it "(unverified — ...)".
 *
 * HONEST LIMITATION (read before trusting this): it catches *hedged* inference
 * ("probably", "should work", "I believe"). It CANNOT catch *confident*
 * inference — a wrong fact stated flatly as truth has no lexical tell, so it
 * sails straight through. This raises the floor; it is NOT a guarantee. The
 * discipline in verify-before-claim.md is the real guard.
 *
 * EXTERNAL: Stop hook contract, https://code.claude.com/docs/en/hooks (Stop section, checked 2026-10-15):
 *   stdin  : JSON with `last_assistant_message` (string, the turn's final text)
 *            and `stop_hook_active` (true when Claude is already continuing
 *            because a Stop hook kept it going). There is no `messages` array.
 *   output : top-level {decision:"block", reason} keeps Claude working;
 *            {hookSpecificOutput:{hookEventName:"Stop", additionalContext}} is
 *            non-error feedback, and the conversation ALSO continues. A non-zero
 *            exit with one stderr line is the user-facing "warn" mode.
 *
 * Config (env):
 *   VERIFY_HOOK_MODE    = "context" (default) | "warn" | "block" | "off"
 *       context -> feedback to the MODEL; it continues once to self-correct (default)
 *       warn    -> one-line notice to the USER, stop proceeds (no model turn, no loop)
 *       block   -> hook error that forces the model to continue and re-check once
 *       off     -> disabled
 *   VERIFY_HOOK_PHRASES = comma-separated list to override the defaults
 */

'use strict';

const MAX_STDIN = 4 * 1024 * 1024;

// MAGIC: curated high-signal subset of the red-flag list in
// verify-before-claim.md. Broader hedges ("likely", "usually", "by default")
// are deliberately omitted — they fire on ordinary prose and drown the signal.
const DEFAULT_PHRASES = [
  'should work', 'should be fine', 'this is standard',
  "i'm pretty sure", 'i believe', 'if i remember correctly', 'from what i recall',
  'as expected', 'it probably', 'would return',
  'we already have', "there's a helper for", 'there is a helper for',
  'this will compile', 'this will build', 'this will pass', 'this should compile',
];

function getPhrases() {
  const override = (process.env.VERIFY_HOOK_PHRASES || '').trim();
  if (!override) return DEFAULT_PHRASES;
  return override.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (typeof b === 'string' ? b : (b && typeof b.text === 'string' ? b.text : '')))
      .join('\n');
  }
  return '';
}

function run(input) {
  const mode = (process.env.VERIFY_HOOK_MODE || 'context').toLowerCase();
  if (mode === 'off') return null;

  // ORDER: loop guard first — both model-facing modes make Claude continue, so
  // a turn that is already a Stop-hook continuation must be allowed to stop.
  if (input && input.stop_hook_active && mode !== 'warn') return null;

  const phrases = getPhrases();
  const finalText = extractText(input && input.last_assistant_message);
  if (!finalText) return null;

  const lower = finalText.toLowerCase();

  const hits = phrases.filter((p) => lower.includes(p));
  if (hits.length === 0) return null;

  // ASSUMPTION: a turn that already tagged something "(unverified ..." is
  // following the rule — don't nag about hedges on a turn that self-flagged.
  if (lower.includes('(unverified')) return null;

  const list = hits.map((h) => `"${h}"`).join(', ');
  const oneLine =
    `[verify-before-claim] Hedge phrases in reply (${list}) — verify in-session ` +
    `or tag "(unverified — …)". (Catches hedges only, not confident-wrong.)`;
  const full =
    `[verify-before-claim] Unverified-language detected in your reply: ${list}. ` +
    `Before finishing, per verify-before-claim.md: verify each such claim in-session ` +
    `(open the file / run the command / query the MCP) and replace the hedge with a ` +
    `confirmed statement, OR tag it "(unverified — …)". Note: this scanner only ` +
    `catches hedged phrasing, not confidently-stated wrong facts — those remain on you.`;

  if (mode === 'context') {
    return { exitCode: 0, json: { hookSpecificOutput: { hookEventName: 'Stop', additionalContext: full } } };
  }

  if (mode === 'block') {
    return { exitCode: 0, json: { decision: 'block', reason: full } };
  }

  // mode === 'warn' (and any unrecognized value): user-facing, non-blocking. Exit non-zero so the
  // first stderr line is shown to the user; the stop still proceeds.
  return { exitCode: 1, stderr: oneLine };
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  if (raw.length < MAX_STDIN) raw += chunk;
});
process.stdin.on('end', () => {
  let result;
  try {
    const input = raw ? JSON.parse(raw) : {};
    result = run(input);
  } catch (err) {
    // Fail open: a scanner crash must never block the agent from stopping.
    console.error('[verify-before-claim] scanner error:', err && err.message);
    process.exit(0);
  }

  if (!result) process.exit(0);
  if (result.json) process.stdout.write(JSON.stringify(result.json));
  if (result.stderr) process.stderr.write(result.stderr + '\n');
  process.exit(result.exitCode || 0);
});

module.exports = { run, extractText };
