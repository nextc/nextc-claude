# Safety Reference

> Owner: `rules/nextc-claude/safety.md`. Update here when adding language coverage or expanding error-message translations.

Logging APIs by language and error-message translations. Consulted when writing error handlers in unfamiliar languages or composing UI error states. `safety.md` covers Dart/Flutter and TypeScript/JS inline.

## The Dart/Flutter footgun

`debugPrint` is not stripped in release builds. Per the Flutter docs (`testing/code-debugging.md`), it "will print messages in release mode unless part of a debug mode check or an assert." The `debug` in the name refers to throttling, not release behavior: a bare `debugPrint(...)` writes to logcat, the iOS console and `flutter run --release` output on user devices. Wrap it:

```dart
if (kDebugMode) {
  debugPrint('[Class.method] ...');
}
```

`kDebugMode` comes from `package:flutter/foundation.dart`; the compiler folds the branch out of release builds.

## Handler pattern

```
try {
  riskyOperation()
} catch (error, stackTrace) {
  DEBUG_LOG("[Class.method] Failed to <operation>: {error}, stack: {stackTrace}")
  // then: re-throw as a user-friendly error, return an error state, or handle gracefully
}
```

## Debug-safe logging, other languages

| Language | Debug-safe | Not in production |
|---|---|---|
| **Python** | `logging.debug()` / `logging.exception()` | `print()` |
| **Go** | Build-tag-gated or leveled logger (zerolog, zap) | `fmt.Println` |
| **Rust** | `log::debug!()` / `tracing::debug!()` | `println!()` / `eprintln!()` |
| **Swift** | `#if DEBUG print()` / `os_log(.debug, ...)` | `print()` without `#if DEBUG` |
| **Kotlin** | `Log.d()` / `Timber.d()` | `println()` |
| **Java** | `log.debug()` (SLF4J/Logback) | `System.out.println()` |
| **C++** | `#ifndef NDEBUG` guard, or spdlog debug level | Raw `std::cout/cerr` |

## Error Translations

| Technical Error | User Message |
|---|---|
| Network timeout / connection refused | "Unable to connect. Please check your internet connection." |
| Invalid credentials | "Incorrect email or password. Please try again." |
| Session expired / token invalid | "Your session has expired. Please sign in again." |
| Unauthorized / forbidden | "You don't have permission to do that." |
| Duplicate / unique violation | "This already exists. Please try a different name." |
| Not found | "Could not find what you're looking for." |
| Constraint violation | "The information provided is not valid. Please check and try again." |
| Rate limit | "Too many requests. Please wait a moment and try again." |
| Server error (5xx) | "Our servers are having trouble. Please try again in a moment." |
| File too large / invalid format | "This file can't be used. Please check the size and format." |
| Any unhandled exception | "Something went wrong. Please try again." |
