# Where things live, by stack

Use as a search checklist; every item reported must be confirmed with `ls`/`rg` in the repo. Say "not found" when absent.

## Flutter / Dart (`pubspec.yaml`)

| Question | Look at |
|---|---|
| Entry point | `lib/main.dart` (and `main_<flavor>.dart`), `runApp(` |
| State management | `pubspec.yaml` deps: `flutter_riverpod`, `flutter_bloc`, `provider`, `get`; `rg "ProviderScope|BlocProvider"` |
| Routing | `go_router`/`auto_route` config: `rg "GoRouter\(|AutoRoute"`; else `Navigator`/`onGenerateRoute` |
| Layers | `lib/` top level: `features/`, `data/`, `domain/`, `core/`, `l10n/` |
| Backend | `appwrite`, `supabase_flutter`, `firebase_*` deps; client init `rg "Client\(\)|Supabase.initialize"` |
| Config/env | `--dart-define`, `.env` + `flutter_dotenv`, `lib/config*`, flavors in `android/app/build.gradle*` and `ios/Runner.xcodeproj` schemes |
| Build/signing | `android/app/build.gradle*` (applicationId, minSdk, signingConfigs), `ios/Runner/Info.plist`, `ios/fastlane/`, `android/key.properties` (must be gitignored) |
| l10n | `l10n.yaml`, `lib/l10n/*.arb` |
| Tests/CI | `test/`, `integration_test/`, `.github/workflows/`, `codemagic.yaml` |

## Unity (`ProjectSettings/`)

| Question | Look at |
|---|---|
| Unity version | `ProjectSettings/ProjectVersion.txt` |
| Packages | `Packages/manifest.json` (+ `packages-lock.json`) |
| Entry scene/boot | `ProjectSettings/EditorBuildSettings.asset` scene list; `rg "RuntimeInitializeOnLoadMethod"` |
| Code layout | `Assets/Scripts/` or assembly definitions: `find Assets -name "*.asmdef"` |
| State/DI | `rg "VContainer|Zenject|ScriptableObject"`; singletons: `rg "static .* Instance"` |
| Data/config | `Assets/**/ScriptableObjects`, `Resources/`, Addressables groups |
| Build | `ProjectSettings/ProjectSettings.asset` (bundle id, version), editor build scripts `rg "BuildPipeline.BuildPlayer"`, `Assets/Editor/` |
| Tests/CI | `Assets/Tests/`, `.github/workflows/` (game-ci) |

## Go (`go.mod`)

| Question | Look at |
|---|---|
| Entry points | `cmd/*/main.go`, else `main.go` |
| Layout | `internal/`, `pkg/`, `api/`; module path in `go.mod` |
| Routing/handlers | `rg "http.NewServeMux|chi.NewRouter|gin.Default|echo.New"` |
| Data | `migrations/`, `sqlc.yaml`, `rg "sql.Open|pgx"` |
| Config | `rg "os.Getenv|envconfig|viper"`; `.env.example` |
| Build/deploy | `Makefile`, `Dockerfile`, `.github/workflows/` |
| Tests | `*_test.go`; `go test ./...` is the full suite (offer, do not run) |

## TypeScript / Node (`package.json`)

| Question | Look at |
|---|---|
| Runtime and scripts | `package.json` `scripts`, `engines`; `tsconfig.json` (`paths`, `strict`) |
| Entry | `main`/`exports`, `src/index.ts`, `src/main.ts`, `app/` or `pages/` (Next.js) |
| Framework | deps: `next`, `express`, `fastify`, `hono`, `@nestjs/*`; Appwrite functions: `appwrite.json`, `functions/*/src/main.*` |
| Supabase | `supabase/config.toml`, `supabase/migrations/`, `supabase/functions/` |
| Data/validation | `prisma/schema.prisma`, `drizzle.config.*`, `zod` schemas |
| Config | `.env.example`, `process.env` usage `rg "process.env\."` |
| Tests/CI | `vitest.config.*`, `jest.config.*`, `.github/workflows/` |
