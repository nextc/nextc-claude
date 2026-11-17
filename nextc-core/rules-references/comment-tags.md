# Comment Tag Examples

> Owner: `rules/nextc-claude/code-comments.md`. Update here when adding new examples or new tag types.

Examples for each comment tag. Consulted when writing a comment that needs tagging. The tag definitions and enforcement rules live in `code-comments.md`.

## WORKAROUND

```
// WORKAROUND: Supabase realtime drops payloads >64KB, chunking here
// WORKAROUND: iOS 17 keyboard avoidance bug — manual padding until Flutter 3.x ships fix
// WORKAROUND: Riverpod rebuilds twice on first frame, debouncing to skip the duplicate
```

## ASSUMPTION

```
// ASSUMPTION: user.email is always lowercase (normalized at signup)
// ASSUMPTION: host is always players[0], enforced by lobby creation flow
// ASSUMPTION: tile IDs are 0-indexed and contiguous within a wall
```

## ORDER

```
// ORDER: dispose controller before closing the channel, else memory leak (sync)
// ORDER: set auth header before the interceptor runs, not after (sync)
// ORDER: don't await — must fire before the channel closes (async)
// ORDER: subscribe before calling join(), or you miss the first broadcast (async)
// ORDER: hydrate state before mounting widget, otherwise initial build sees null (async)
```

## EXTERNAL

```
// EXTERNAL: Stripe webhook retries up to 3x — must stay idempotent
// EXTERNAL: mobile app v2.1 reads these exact JSON keys, do not rename
// EXTERNAL: Supabase RLS policy "host_can_write" depends on this column name
// EXTERNAL: BigQuery export job parses this log format, breaking it breaks the dashboard
// EXTERNAL: matches the schema in supabase/migrations/0007_players.sql
```

## SECURITY

```
// SECURITY: validating server-side because client validation can be bypassed
// SECURITY: never log this — contains raw OAuth token
// SECURITY: RLS enforces user_id match, but double-checking here as defense in depth
// SECURITY: escaping before interpolation to prevent SQL injection in raw query
```

## MAGIC

```
// MAGIC: 4096 matches Supabase realtime's internal batch size
const kRealtimeChunkSize = 4096;

// MAGIC: 300ms is the threshold below which users perceive UI as "instant" (Nielsen)
const kTapFeedbackDelayMs = 300;

// MAGIC: 13 = max mahjong hand size before draw, hardcoded by rule, not config
const kHandSizeBeforeDraw = 13;
```
