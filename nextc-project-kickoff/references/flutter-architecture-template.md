# Flutter Architecture Template

> Owner: `nextc-project-kickoff/agents/flutter-doc-seeder.md`. Update here when architectural prescriptions change for newly-seeded Flutter projects.

This file is the canonical prescription for `docs/architecture.md` in a Flutter project seeded
by `flutter-doc-seeder`. Write `docs/architecture.md` by following every section below verbatim,
then adapting bracketed placeholders to the user's decisions and removing sections that do not apply.

---

## docs/architecture.md content

```markdown
# Architecture

This document defines the architecture for [Product Name]. Every feature built
via `/feature-dev` MUST follow these patterns. Do not deviate without updating
this document first.

## Infrastructure Gate (CRITICAL)

The tasks in `tasks.md` Phase 1 build core infrastructure. Phase 2 (entity models
and repositories) and Phase 3 (MVP features) MUST NOT start until the infrastructure
verification checklist in `tasks.md` passes. This is a hard gate, not a suggestion.

After completing Phase 1, run every check in the "Infrastructure Verification"
section of `tasks.md`. If ANY check fails, fix it before proceeding. Do not mark
Phase 1 as complete until all verification checks pass.

`flutter analyze` must pass AND the app must launch without crashes.

## Folder Structure

Every feature lives in `lib/features/{feature_name}/` with this structure:

```
lib/features/{feature}/
  {feature}.dart              — barrel file, re-exports public API
  domain/
    {entity}_repository.dart  — abstract repository interface
  data/
    {entity}_repository_impl.dart — concrete implementation
  presentation/
    {feature}_screen.dart     — screen widget
    widgets/                  — feature-specific widgets
```

Shared code lives in:
- `lib/core/` — infrastructure (errors, theme, router, DI, config, utils)
- `lib/shared/models/` — entity models used across features
- `lib/shared/widgets/` — reusable widgets

## Error Handling (CRITICAL)

### Sealed Error Hierarchy

Create `lib/core/errors/app_exception.dart` with a sealed class:

- `AppException` (base) — has `message` (user-friendly) and `cause` (debug)
- `NetworkException` — connection failures
- `AuthException` — authentication/authorization failures
- `StorageException` — database/storage failures
- `ValidationException` — invalid input
- `UnexpectedException` — catch-all

Example shape:
```dart
sealed class AppException implements Exception {
  const AppException(this.message, [this.cause]);
  final String message;  // user-friendly, safe for UI
  final Object? cause;   // original error, debug only
}
class NetworkException extends AppException {
  const NetworkException([String message = 'Unable to connect. Please check your internet.', Object? cause])
      : super(message, cause);
}
// ... same pattern for Auth, Storage, Validation, Unexpected
```

### Error Handler

Create `lib/core/errors/error_handler.dart` with a static `guard<T>()` method:

```dart
abstract final class ErrorHandler {
  static Future<T> guard<T>(Future<T> Function() action) async {
    try {
      return await action();
    } on AppException {
      rethrow;
    } on [BackendSpecificAuthException] catch (e, st) {
      AppLogger.e('[ErrorHandler] Auth error', error: e, stackTrace: st);
      throw AuthException('Authentication failed.', e);  // preserve cause
    }
    // ... catch backend-specific exceptions, map to AppException subtypes
    // Generic catch-all at the bottom for unexpected errors
  }
}
```

Rules:
- Catches backend-specific exceptions (Supabase/Firebase/etc types)
- Maps to `AppException` subtypes with **generic** user-friendly messages
- **Always** preserves original exception in `cause` parameter
- **Always** logs via `AppLogger` before rethrowing
- **Never** forwards raw backend `e.message` to the UI
- Do NOT import `dart:io` (breaks Flutter web) — use generic catch-all for network errors

### Global Error Boundary

`main.dart` must use `runZonedGuarded` with:
- `FlutterError.onError` for widget tree errors
- `PlatformDispatcher.instance.onError` for platform errors
- TODO comment for crash reporting integration (Sentry/Crashlytics)

Example shape:
```dart
void main() {
  runZonedGuarded(() async {
    WidgetsFlutterBinding.ensureInitialized();
    FlutterError.onError = (details) {
      AppLogger.e('[FlutterError]', error: details.exception, stackTrace: details.stack);
    };
    PlatformDispatcher.instance.onError = (error, stack) {
      AppLogger.e('[PlatformError]', error: error, stackTrace: stack);
      return true;
    };
    // Backend initialization here
    runApp(const App());
  }, (error, stack) {
    AppLogger.e('[UncaughtError]', error: error, stackTrace: stack);
  });
}
```

### UI Error Display

Create a reusable error widget that:
- Checks `error is AppException` → show `error.message`
- Otherwise → show "Something went wrong. Please try again."
- Has an optional `onRetry` callback (only show retry button when provided)
- Never displays stack traces, class names, or raw error text

## Entity Models

### Plain Dart (no Freezed)

Every entity model in `lib/shared/models/` must have:
- `@immutable` annotation
- `const` constructor with named parameters
- `fromJson` factory constructor
- `toJson` method
- `copyWith` method
- `==` and `hashCode` based on `id` (entity identity semantics)
- `toString` override

Example shape:
```dart
@immutable
class Room {
  const Room({required this.id, required this.name, this.description});
  final String id;
  final String name;
  final String? description;

  factory Room.fromJson(Map<String, dynamic> json) => Room(
    id: json['id'] as String,
    name: json['name'] as String,
    description: json['description'] as String?,
  );
  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'description': description};
  Room copyWith({String? id, String? name, String? description}) => Room(
    id: id ?? this.id, name: name ?? this.name, description: description ?? this.description,
  );
  @override bool operator ==(Object other) => identical(this, other) || other is Room && other.id == id;
  @override int get hashCode => id.hashCode;
}
```

### With Freezed (if selected)

Use `@freezed` annotation with `part` directives for `.freezed.dart` and `.g.dart`.
Let Freezed generate `fromJson`, `toJson`, `copyWith`, `==`, `hashCode`.

Example shape:
```dart
@freezed
class Room with _$Room {
  const factory Room({required String id, required String name, String? description}) = _Room;
  factory Room.fromJson(Map<String, dynamic> json) => _$RoomFromJson(json);
}
```

## Repository Pattern

### Interface

Every entity gets an abstract repository in `domain/`:
```
findAll({String? cursor, int limit = 20}) → Future<PaginatedResponse<T>>
findById(String id) → Future<T?>
create(T entity) → Future<T>
update(T entity) → Future<T>
delete(String id) → Future<void>
```

Use a generic `PaginatedResponse<T>` with `items`, `hasMore`, `cursor`, `totalCount`.
The `items` list must be unmodifiable.

### Implementation

Concrete repository in `data/` wraps the data source ([backend] client).
All methods use `ErrorHandler.guard()` to translate backend errors.

Example shape:
```dart
class RoomRepositoryImpl implements RoomRepository {
  RoomRepositoryImpl(this._client);
  final [BackendClient] _client;

  @override
  Future<PaginatedResponse<Room>> findAll({String? cursor, int limit = 20}) =>
      ErrorHandler.guard(() async {
        final response = await _client.from('rooms').select().limit(limit);
        return PaginatedResponse(items: response.map(Room.fromJson).toList(), hasMore: response.length == limit);
      });
  // ... same guard() pattern for findById, create, update, delete
}
```

## Dependency Injection

[RIVERPOD]: Use `@riverpod` annotation for all providers. Each repository and service
gets its own provider in `lib/core/providers/`. Never instantiate repositories directly.

Example:
```dart
@riverpod
RoomRepository roomRepository(Ref ref) => RoomRepositoryImpl(ref.watch(backendClientProvider));
```

[PROVIDER]: Wrap `MaterialApp` in `MultiProvider`. Each feature's state is a
`ChangeNotifier` registered via `ChangeNotifierProvider`. Repositories are injected
into ChangeNotifiers via constructor.

[BLOC]: Wrap `MaterialApp` in `MultiBlocProvider`. Each feature has a Cubit or Bloc
registered at the appropriate scope. Use `context.read<T>()` for events,
`context.watch<T>()` for state. Repositories are injected into Cubits/Blocs via constructor.

## Routing

[GO_ROUTER]: Use `GoRouter` with named routes. Register all feature routes.
Add `AnalyticsObserver` to `observers`. Use `redirect` for auth guards.

[AUTO_ROUTE]: Use `@AutoRouterConfig` with `@RoutePage()` on each screen.
Add `AutoRouteObserver` for analytics. Use route guards for auth.

## Theme

- Use `ColorScheme.fromSeed()` with the brand primary color
- Material 3 (`useMaterial3: true`)
- 48x48dp minimum tap targets on all interactive elements
- Shared `_build(Brightness)` method for light/dark themes (no duplication)
- Color constants in `app_colors.dart`, typography in `app_typography.dart`

## Logging

- Use `AppLogger` wrapper around the `logger` package
- `kDebugMode` guard — all logging suppressed in release builds
- Every `catch` block must log before rethrowing
- Never use `print()` — always `AppLogger.d/e/w/i`

## Secure Storage

- Use `FlutterSecureStorage` with `AndroidOptions(encryptedSharedPreferences: true)`
- Wrap in a `SecureStorageService` class
- Never use `SharedPreferences` for tokens or secrets

## Analytics

- Abstract `AnalyticsService` interface with `trackScreen`, `trackEvent`, `setUserId`
- `NoopAnalytics` default implementation (ships without a provider)
- Route observer that auto-tracks screen views
- Wire real analytics (Firebase, Mixpanel) when ready

## App Configuration

- `AppConfig` class with `env`, `apiBaseUrl`, `apiTimeout`
- Read from `--dart-define` at build time
- Three presets: dev, staging, prod

## Screen State Pattern

Create a reusable widget that handles 4 states:
- Loading (CircularProgressIndicator)
- Error (retry card with user-friendly message)
- Empty (guidance text)
- Success (data builder)

[RIVERPOD]: Works with `AsyncValue<T>`
[BLOC/PROVIDER]: Works with a state-agnostic isLoading/error/data pattern

[IF offline_needed]:

## Offline-First

- Abstract `LocalFirstRepository<T>` base class (read local first, sync when online)
- `SyncQueue` for persisting pending mutations (must use local storage, not in-memory)
- `connectivity_plus` for network state detection
- Queue pending operations when offline, process on reconnect

[IF l10n]:

## Localization

- `l10n.yaml` config at project root
- ARB files in `lib/l10n/`
- Access via `AppLocalizations.of(context)`
- All user-facing strings in ARB, never hardcoded

## Build & Release

- `--obfuscate --split-debug-info=build/debug-info` on all release builds
- `--dart-define-from-file=.env` for environment variables
- Upload debug symbols to crash reporting service
- Android: signing config via `key.properties` (not committed)
- minSdk [minSdk], targetSdk 34, compileSdk 34
```

---

## Adaptation rules

- Keep only the bracketed variant that matches the user's decisions (e.g. keep `[RIVERPOD]`, remove `[PROVIDER]` and `[BLOC]`).
- Remove conditional sections (`[IF offline_needed]`, `[IF l10n]`) when the decision is false.
- The output must read as a single coherent document, not a menu of options.
