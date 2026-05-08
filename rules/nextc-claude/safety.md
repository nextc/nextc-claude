# Error Handling (CRITICAL — ALWAYS ENFORCE)

All languages, all platforms, no exceptions.

## Rule 1: Debug Logging is MANDATORY

Every error handler (`try/catch`, `.catch()`, `.catchError`, `except`, `rescue`, etc.) MUST log with full context. Logs MUST NOT exist in production.

- Log error object/message AND stack trace
- Include context: what failed, which class/function, what inputs (excluding secrets)
- Use debug-only logging — never production-unsafe alternatives
- For third-party errors (Supabase, Firebase, Stripe, etc.), log the full response
- NEVER silently swallow errors

### Debug-Safe Logging by Language

| Language | Debug-Safe | NEVER Use in Production |
|---|---|---|
| **Dart/Flutter** | `debugPrint()`, `developer.log()`, `kDebugMode` guard | `print()` |
| **TypeScript/JS** | Env-guarded `console.error()`, leveled logger (winston, pino) | Raw `console.log/error` |

For Python/Go/Rust/Swift/Kotlin/Java/C++, see `references/safety-reference.md`.

### Pattern

```
try {
  riskyOperation()
} catch (error, stackTrace) {
  DEBUG_LOG("[Class.method] Failed to <operation>: {error}, stack: {stackTrace}")
  // Then: re-throw as user-friendly error, return error state, or handle gracefully
}
```

### What counts as "handled"

- Log + re-throw or return error state = OK
- Log + show user-friendly message = OK
- Catch without log = NEVER OK
- Production-unsafe logging = NEVER OK

## Rule 2: User-Facing Errors Must Be Friendly

Never show technical details to users. Every UI error must be human-readable with a suggested action.

- Never expose: stack traces, error codes, class names, SQL errors, HTTP status codes, raw API messages
- Service layers catch raw errors → throw user-friendly error types
- UI layers display friendly message, with generic fallback for unexpected errors

### Error Translations

See `references/safety-reference.md` for the full technical→user-friendly error-message lookup table.

## Rule 3: Secret Management

- NEVER hardcode secrets — use env vars or secret manager
- Validate required secrets at startup
- Rotate any exposed secrets

## Enforcement

- Every new/modified catch block: apply Rules 1 + 2
- Code review: flag catch without debug log as CRITICAL
- Code review: flag raw error shown in UI as CRITICAL
