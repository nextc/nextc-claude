# Error Handling (CRITICAL — ALWAYS ENFORCE)

These rules apply to ALL languages, frameworks, and platforms. Every project. No exceptions.

## Rule 1: Debug Logging is MANDATORY

Every `try/catch`, `.catch()`, `.catchError`, `.onError`, error callback, `except`, `rescue`, or any exception/error handler MUST log the error with full context for debugging. These logs MUST NOT exist in production builds/releases.

### Requirements

- Log the error object/message AND stack trace (where available)
- Include context: what operation failed, in which class/function, with what inputs (excluding secrets)
- Use the language/framework's debug-only logging mechanism so logs are stripped from production
- For third-party service errors (Supabase, Firebase, AWS, Stripe, etc.), log the full error response
- NEVER silently swallow errors — every catch block must log

### Debug-Only Logging by Language

| Language / Framework | Debug-Safe Logging | Production-Unsafe (NEVER use) |
|---|---|---|
| **Dart / Flutter** | `debugPrint()`, `developer.log()`, `kDebugMode` guard | `print()` (leaks to production) |
| **TypeScript / JavaScript** | `if (process.env.NODE_ENV !== 'production') console.error()`, or use a logger with level config (winston, pino) | Raw `console.log/error` without env guard |
| **Python** | `logging.debug()` / `logging.exception()` with level config | `print()` without guard |
| **Go** | Build-tag-gated debug logger, or leveled logger (zerolog, zap) with debug level | `fmt.Println` without guard |
| **Rust** | `log::debug!()` / `tracing::debug!()` (level-filtered at runtime) | `println!()` / `eprintln!()` without guard |
| **Swift / iOS** | `#if DEBUG print()` / `os_log(.debug, ...)` | `print()` without `#if DEBUG` |
| **Kotlin / Android** | `Log.d()` (stripped by ProGuard/R8 in release) or `Timber.d()` | `println()` |
| **Java / Spring** | `log.debug()` (SLF4J/Logback with level config) | `System.out.println()` |
| **C++** | `#ifndef NDEBUG` guarded logging, or spdlog with debug level | Raw `std::cout` / `std::cerr` without guard |
| **Ruby** | `Rails.logger.debug` / `Logger` with level config | `puts` without guard |
| **Deno / Edge Functions** | `console.error()` is OK in server-side Deno (not user-facing) | — |

### Pattern (Language-Agnostic Pseudocode)

```
try {
  riskyOperation()
} catch (error, stackTrace) {
  DEBUG_LOG("[ClassName.methodName] Failed to <describe operation>: {error}")
  DEBUG_LOG("Stack trace: {stackTrace}")

  // Then: re-throw as user-friendly error, return error state, or handle gracefully
}
```

### Dart/Flutter Example

```dart
import 'dart:developer' as developer;
import 'package:flutter/foundation.dart';

try {
  await supabase.from('rooms').insert(data);
} catch (e, stackTrace) {
  debugPrint('[RoomService.createRoom] Insert failed: $e');
  developer.log('Create room failed', name: 'RoomService', error: e, stackTrace: stackTrace);
  throw UserFriendlyException('Could not create the room. Please try again.');
}
```

### TypeScript/Node Example

```typescript
import { logger } from './logger'; // configured to suppress debug in production

try {
  await stripe.charges.create(params);
} catch (error) {
  logger.debug(`[PaymentService.charge] Stripe charge failed`, { error, params: { ...params, card: '[REDACTED]' } });
  throw new UserFriendlyError('Payment could not be processed. Please try again.');
}
```

### Python Example

```python
import logging
logger = logging.getLogger(__name__)

try:
    response = requests.post(url, json=payload)
    response.raise_for_status()
except Exception as e:
    logger.debug(f"[UserService.create] API call failed: {e}", exc_info=True)
    raise UserFriendlyError("Could not complete the request. Please try again.")
```

### What counts as "handled"

- Logging the error AND re-throwing or returning an error state = OK
- Logging the error AND showing user-friendly message = OK
- Catching without any log = NEVER OK
- Using production-unsafe logging (see table above) = NEVER OK

## Rule 2: User-Facing Errors Must Be Friendly

Technical error details MUST NEVER be shown to users in ANY platform (mobile, web, desktop, CLI with end-users). Every error surfaced in the UI must be human-readable and helpful.

### Requirements

- Translate technical errors into plain language the user can understand
- If a specific friendly message isn't possible, use a generic fallback: "Something went wrong. Please try again."
- Never show to users: stack traces, error codes, class names, SQL errors, HTTP status codes, raw API error messages, or exception text
- Always suggest an action when possible ("Please try again", "Check your connection", "Return to home screen")
- Service/provider layers should catch raw errors and throw/return user-friendly error types
- UI layers should only display the friendly message, with a generic fallback for unexpected errors

### Common Error Translations (Universal)

| Technical Error Category | User-Friendly Message |
|---|---|
| Network timeout / connection refused / DNS failure | "Unable to connect. Please check your internet connection." |
| Auth: invalid credentials | "Incorrect email or password. Please try again." |
| Auth: session expired / token invalid | "Your session has expired. Please sign in again." |
| Auth: unauthorized / forbidden | "You don't have permission to do that." |
| Database: duplicate / unique violation | "This already exists. Please try a different name." |
| Database: not found | "Could not find what you're looking for." |
| Database: constraint violation | "The information provided is not valid. Please check and try again." |
| Rate limit / throttle | "Too many requests. Please wait a moment and try again." |
| Server error (5xx) | "Our servers are having trouble. Please try again in a moment." |
| File too large / invalid format | "This file can't be used. Please check the size and format." |
| Any unhandled / unknown exception | "Something went wrong. Please try again." |

### Pattern

```
// Service layer: catch technical error, log it, throw friendly error
catch (technicalError) {
  DEBUG_LOG(technicalError)  // Rule 1
  throw UserFriendlyError("Plain language message")  // Rule 2
}

// UI layer: display only the friendly message
catch (error) {
  if (error is UserFriendlyError) {
    showMessage(error.message)
  } else {
    showMessage("Something went wrong. Please try again.")
  }
}
```

## Enforcement

- When writing ANY new code with error handling in ANY language, apply both rules
- When modifying existing error handlers, add missing debug logs and fix exposed technical errors
- Code reviewers: flag any `catch` block without debug logging as CRITICAL
- Code reviewers: flag any raw error/exception message shown in UI as CRITICAL
- These rules override language-specific defaults — even if a framework logs errors by default, verify the logging is debug-only and the UI message is friendly
