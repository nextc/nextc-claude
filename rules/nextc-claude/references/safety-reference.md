# Safety Reference

> Owner: `rules/nextc-claude/safety.md`. Update here when adding language coverage or expanding error-message translations.

Logging APIs by language and error-message translations. Consulted when writing error handlers in unfamiliar languages or composing UI error states. The 2-language inline excerpt in `safety.md` covers Dart/Flutter and TypeScript/JS.

## Debug-Safe Logging — Additional Languages

| Language | Debug-Safe | NEVER Use in Production |
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
