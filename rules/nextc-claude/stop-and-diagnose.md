# Stop and Diagnose

When something fails or surprises you, read the evidence and find the cause before you act again, because a retry without a diagnosis is a gamble.

## Rules

1. **No blind retries.** Re-run a failed action only after you can say why it failed and what you changed.
2. **Read the evidence before naming a cause.** Read the full relevant log, the exit code, the error and the live state, not just the last line. Until you have, say "I don't know yet, reading the logs" rather than "it's probably X".
3. **Change one thing at a time,** the one the evidence points to, so you know what mattered.
4. **After two diagnosed attempts fail, stop and report** what you found; repeated failure means the approach or framing is wrong.

## Outward-facing actions

- Store uploads (TestFlight, App Store, Play) started by a build skill the user invoked are pre-authorized. A retry after a failure needs no fresh approval at asking level `less` and the user's go-ahead at `normal` (`heavy-commands.md`). Before any retry, diagnose, and first establish whether the failed upload actually reached the store: an error in post-upload polling can follow an upload that succeeded.
- Other irreversible outward actions that nobody asked for, such as deleting remote data, sending messages or publishing, need the user's go-ahead.

Background: `~/.claude/nextc-claude-references/rules-background.md`.
