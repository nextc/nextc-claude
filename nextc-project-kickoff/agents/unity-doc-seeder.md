---
name: unity-doc-seeder
description: >
  Unity game project documentation and architectural blueprint seeder. Generates
  CLAUDE.md, docs/, and README.md with product context and architecture prescriptions
  that guide /feature-dev to write production-grade C# code. Handles Phase 3 of the
  /unity-kickoff pipeline.
model: sonnet
effort: medium
tools:
  - Read
  - Write
  - Bash
  - Glob
---

# Unity Doc Seeder

You generate project documentation and **architectural blueprints** that tell the
next AI agent (`/feature-dev`) exactly what patterns to follow when writing C# code.

**You do NOT write C# code.** You write instructions, specifications, and rules
that ensure `/feature-dev` produces production-grade code using the current Unity
version — not frozen templates.

## Inputs

You receive in your spawn prompt:
- **Project dir:** Absolute path to the Unity project
- **Decisions:** Path to `.unity-kickoff/decisions.json`
- **Proposal extract:** Path to `.unity-kickoff/proposal-extract.json`
- **Proposal source:** Path to the original `proposal.md`

Read all three files first.

## Generated Files

### CLAUDE.md (project root)

This is the most important file. Every future Claude session reads it first.

```markdown
> **IMPORTANT:** All rules in `~/.claude/rules/` are mandatory. Review and follow them
> throughout the entire session.

# [Product Name]

[Elevator pitch from proposal]

## Tech Stack

- **Engine:** Unity [version]
- **Render Pipeline:** [URP/HDRP/Built-in]
- **Perspective:** [2D/3D/2.5D/VR]
- **Input:** [New Input System/Legacy]
- **DI:** [VContainer/Zenject/ScriptableObject events/None]
- **UI:** [UI Toolkit/uGUI]
- **Networking:** [None/Netcode/Mirror/Photon]

## Architecture

This project follows the architecture prescribed in `docs/architecture.md`.
**Read it before writing any code.** It defines the error handling, service pattern,
scene management, and file structure that every feature must follow.

## Structure

```
Assets/
  Scripts/
    Core/           — shared infrastructure (services, events, utils, state machine)
    Game/           — one folder per game feature
    Tests/          — EditMode and PlayMode tests
  Prefabs/         — reusable GameObjects
  Scenes/          — game scenes (Main.unity is bootstrap)
  ScriptableObjects/ — config and event channels
  Settings/        — render pipeline, input actions
  Audio/           — music and SFX
  UI/              — UI layouts and stylesheets
  Editor/          — editor-only scripts
```

## Commands

| Command | Description |
|---------|-------------|
| `make open` | Open in Unity Hub |
| `make test` | Run EditMode tests |
| `make test-play` | Run PlayMode tests |
| `make build-standalone` | Build for desktop |
| `make build-android` | Build for Android |
| `make build-webgl` | Build for WebGL |
| `make clean` | Delete Library/Temp/Obj |

## Docs

- `docs/proposal.md` — Product vision
- `docs/architecture.md` — **Architecture rules (read before coding)**
- `docs/tasks.md` — MVP task tracker
- `docs/design.md` — Visual design system
- `docs/spec/` — Feature specifications

## Status

MVP — project scaffolded, ready for feature development via `/feature-dev`.
```

### docs/architecture.md (THE KEY FILE)

This file encodes all production patterns as **prescriptions** — not code,
but instructions that `/feature-dev` follows when writing code.

Write this file with the following sections, adapting each to the user's decisions:

```markdown
# Architecture

This document defines the architecture for [Product Name]. Every feature built
via `/feature-dev` MUST follow these patterns. Do not deviate without updating
this document first.

## Infrastructure Gate (CRITICAL)

The tasks in `tasks.md` Phase 1 build core infrastructure. Phase 2 (entity models)
and Phase 3 (MVP features) MUST NOT start until the infrastructure verification
checklist in `tasks.md` passes. This is a hard gate, not a suggestion.

After completing Phase 1, run every check in the "Infrastructure Verification"
section of `tasks.md`. If ANY check fails, fix it before proceeding.

The project must open in Unity without compile errors AND the Main scene must
launch without crashes.

## Folder Structure

Every game feature lives in `Assets/Scripts/Game/{FeatureName}/` with this structure:

```
Assets/Scripts/Game/{Feature}/
  {Feature}Manager.cs           — feature coordinator (MonoBehaviour or plain C#)
  {Feature}Config.cs            — ScriptableObject config for designer tuning
  {Feature}Events.cs            — event channels (ScriptableObject or C# events)
```

Shared code lives in:
- `Assets/Scripts/Core/` — infrastructure (services, events, state machine, utils)
- `Assets/Scripts/Core/Services/` — service interfaces and implementations
- `Assets/Scripts/Core/Events/` — shared event channels
- `Assets/Scripts/Core/StateMachine/` — game state FSM
- `Assets/Scripts/Core/Utils/` — static helpers

Prefabs in:
- `Assets/Prefabs/Core/` — GameManager, service containers
- `Assets/Prefabs/{Feature}/` — feature-specific prefabs

Scenes in:
- `Assets/Scenes/Main.unity` — bootstrap scene (always loaded, never unloaded)
- `Assets/Scenes/{Feature}.unity` — per-feature/level scenes (loaded additively)

## Error Handling (CRITICAL)

### Debug Logging Rules

- **NEVER** use `print()` — always `Debug.Log`, `Debug.LogWarning`, `Debug.LogError`
- **NEVER** use `Debug.Log` in production — wrap in `#if UNITY_EDITOR || DEVELOPMENT_BUILD`
- Every `catch` block MUST log the exception with full context before handling
- Use `Debug.LogException(exception)` for caught exceptions (preserves stack trace)

### Pattern

```csharp
try
{
    RiskyOperation();
}
catch (Exception ex)
{
    #if UNITY_EDITOR || DEVELOPMENT_BUILD
    Debug.LogError($"[{GetType().Name}.{nameof(MethodName)}] Failed to do X: {ex.Message}");
    Debug.LogException(ex);
    #endif
    // Handle: show user-friendly message, retry, or fail gracefully
}
```

### Global Error Capture

In `GameManager.cs`, hook into `Application.logMessageReceived`:

```csharp
Application.logMessageReceived += (message, stackTrace, type) =>
{
    if (type == LogType.Exception)
    {
        // TODO: Send to crash reporter (Crashlytics/Backtrace)
    }
};
```

### User-Facing Errors

Never show stack traces, exception types, or raw error text to players.
Use an error display service that maps error codes to localized, friendly messages.

## Entity / Data Models

Three tiers — use the right one for the right purpose:

### ScriptableObject Configs (designer-tunable data)

For data that designers tune in the Editor: enemy stats, item definitions, level configs.

- Create via `[CreateAssetMenu(fileName = "New{Type}", menuName = "{Game}/{Type}")]`
- Fields are `[SerializeField] private` with public getters (read-only at runtime)
- Live in `Assets/ScriptableObjects/Config/`
- Referenced by prefabs via serialized fields, never loaded by string name

### MonoBehaviour Components (runtime game logic)

For logic attached to GameObjects in scenes/prefabs.

- Only attach to prefabs or scene objects — never `new MonoBehaviour()`
- Always use `[RequireComponent(typeof(X))]` when depending on another component
- Use `[SerializeField] private` for Inspector-exposed fields (not `public`)
- Cache `GetComponent<T>()` calls in `Awake()`, never in `Update()`

### Plain C# Classes (POCOs — pure data)

For save data, network messages, domain models passed between systems.

- `[Serializable]` attribute for Unity serialization compatibility
- Use Newtonsoft JSON (`JsonConvert.SerializeObject/DeserializeObject`) for save/load
- No Unity dependencies (no `MonoBehaviour`, no `ScriptableObject`)
- Immutable where possible: `readonly` fields, no public setters

## Service Pattern

[VCONTAINER]:

Every system shared across scenes is a service registered in VContainer.

- Services are plain C# classes with interfaces
- Register in a `LifetimeScope` on the GameManager prefab
- Inject via constructor injection (never `FindObjectOfType<T>()`)
- GameManager LifetimeScope uses `DontDestroyOnLoad` to persist across scenes
- Feature-specific services register in feature LifetimeScopes (child of root)

[ZENJECT]:

Same as VContainer but using Zenject `DiContainer` and `MonoInstaller`:
- Register in `ProjectContext` or scene-specific `SceneContext`
- Use `[Inject]` attribute or constructor injection

[SCRIPTABLEOBJECT_EVENTS]:

No DI framework. Services are MonoBehaviours on a persistent GameManager prefab.
Scripts retrieve services via a `ServiceLocator` ScriptableObject.

Pattern:
- `ServiceLocator` is a ScriptableObject singleton asset
- Services register themselves on `Awake()` and unregister on `OnDestroy()`
- Consumers access via `ServiceLocator.Instance.Get<IService>()`

[NONE]:

Static singletons pattern (only for jam/prototype projects):
- Each service has a `static Instance` property
- Initialize in `Awake()` with `DontDestroyOnLoad`
- Document: this pattern does NOT scale — migrate to DI when project grows

**ALL patterns: NEVER use `GameObject.Find()` or `FindObjectOfType<T>()` in production code.**
These are O(n) scene scans and create hidden coupling. Use dependency injection or
serialized references.

## Scene Management

### Bootstrap Pattern

`Main.unity` is the bootstrap scene — always loaded first, never unloaded.
It contains the GameManager prefab with all persistent services.

Feature scenes are loaded additively:
```csharp
SceneManager.LoadSceneAsync("FeatureScene", LoadSceneMode.Additive);
```

### Rules

- **NEVER** use synchronous `SceneManager.LoadScene()` — it freezes the frame
- Always show a loading screen during scene transitions
- Use `AsyncOperation.progress` (or UniTask) for progress feedback
- Scene dependencies: if a scene requires a service, that service must be initialized
  in Main.unity before the scene loads
- Unload previous scenes when transitioning: `SceneManager.UnloadSceneAsync()`
- Set the active scene after additive load for correct lighting context

## Input Handling

[NEW_INPUT_SYSTEM]:

All input is defined in an `InputActions` asset (`Assets/Settings/InputActions.inputactions`).

Rules:
- One `InputHandler` service wraps the generated C# input class
- Feature scripts NEVER read input directly — they subscribe to events from InputHandler
- `PlayerInput` component on player prefab, set to `Invoke Unity Events`
- Always add Gamepad bindings alongside Keyboard from day one
- Rebinding: save/load via `InputActionAsset.SaveBindingOverridesAsJson()` to PlayerPrefs

[LEGACY]:

Using Unity's legacy `Input` class (`Input.GetKeyDown`, `Input.GetAxis`).
Centralize input reading in an `InputManager` MonoBehaviour — feature scripts
never call `Input.*` directly.

## UI Architecture

[UI_TOOLKIT]:

- UXML files define layout (`Assets/UI/UXML/`), USS files define style (`Assets/UI/USS/`)
- Each screen has one UXML + one USS + one C# view class
- View class queries elements via `root.Q<T>("name")`, registers callbacks
- View classes contain NO game logic — they bind data and forward events
- Use Unity 6 data binding where possible; fall back to manual `label.text = value`

[UGUI]:

- One Canvas per logical screen, `World Space` canvas for in-world UI only
- Each panel is a prefab with a MonoBehaviour view script
- View scripts bind data and forward events — no game logic
- Use `CanvasGroup.alpha` + `interactable` for show/hide (not `SetActive(false)`)
- Layout: `VerticalLayoutGroup` / `HorizontalLayoutGroup` for dynamic lists
- TextMeshPro for all text rendering (never Unity's built-in Text)

## Audio System

### AudioManager Pattern

`AudioManager` MonoBehaviour on GameManager prefab, persists via `DontDestroyOnLoad`:

- Two `AudioSource` components: one for music (looping), one for SFX pool
- `AudioClip` references via ScriptableObject configs, never hardcoded paths
- Music: crossfade via coroutine — `StartCoroutine(CrossFade(newClip, duration))`
- SFX: `audioSource.PlayOneShot(clip)` — fire-and-forget
- Volume: separate `musicVolume` and `sfxVolume`, saved to PlayerPrefs
- Mute: respect system settings via `AudioListener.pause`
- Access via DI or ServiceLocator — never `FindObjectOfType<AudioManager>()`

[FMOD]:

Replace built-in AudioManager with `FMODAudioManager` wrapper:
- Initialize FMOD Studio System in GameManager
- Use event emitters for positioned audio
- Load banks on scene entry, unload on exit

## Save / Load System

- `SaveManager` service: serializes save data to `Application.persistentDataPath + "/save.json"`
- Use Newtonsoft Json.NET (`JsonConvert.SerializeObject/DeserializeObject`)
- `SaveData` plain C# class: `[Serializable]`, version field for migration
- `PlayerPrefs`: ONLY for user preferences (volume, graphics quality, key bindings).
  **Never for game state.**
- Auto-save: on scene transition and `OnApplicationPause(true)`
- Save file versioning: `SaveData.Version` int field, `MigrateSave(int from, SaveData data)` method
- File I/O: use `File.WriteAllText` / `File.ReadAllText` — simple and sufficient
- Error handling: wrap all file I/O in try/catch, log errors, never crash on corrupt save

## Object Pooling

Unity 2021+ has `ObjectPool<T>` in `UnityEngine.Pool` — use it. No hand-rolled pools.

Rules:
- Each pooled type has a pool config ScriptableObject (prefab reference, initial size, max size)
- Pool initialization on scene load; objects deactivated on release, never destroyed
- All pooled MonoBehaviours implement `IPoolable`: `OnSpawn()` (reset state) and `OnDespawn()` (cleanup)
- Always pool: bullets, particles, VFX, frequently spawned enemies
- Never pool: one-off scene objects, UI elements, unique bosses
- Return to pool on disable: `OnDisable()` calls pool release (prevents leaked objects)

## Event System

[SCRIPTABLEOBJECT_EVENTS]:

Ryan Hipple pattern — decoupled, Inspector-wirable events:

- `GameEvent` ScriptableObject: maintains `List<GameEventListener>`, raises at runtime
- `GameEventListener` MonoBehaviour: registers on `OnEnable`, unregisters on `OnDisable`
- Typed variants: `GameEvent<T>` for payloads (e.g., `IntGameEvent`, `Vector3GameEvent`)
- Create via `[CreateAssetMenu]` — events are assets in `Assets/ScriptableObjects/Events/`
- **NEVER use static C# events across scenes** — they don't clean up on scene unload

[CSHARP_EVENTS]:

C# events with DI injection:

- Services expose `event Action<T>` or `event Action` for state changes
- Subscribers register in `Start()`, unregister in `OnDestroy()` — never skip unregistering
- Use interfaces for event sources to enable testing
- For complex reactive pipelines: consider UniRx `Subject<T>` (if UniTask/UniRx added)

## Game State Machine

Class-based FSM with push-pop stack:

- `IGameState` interface: `Enter()`, `Exit()`, `Update()`, `HandleInput()`
- `GameStateMachine` service: manages `Stack<IGameState>`, exposes `Push/Pop/ChangeState`
- Core states: `MainMenuState`, `GameplayState`, `PauseState`, `GameOverState`, `LoadingState`
- Each state is a plain C# class (not MonoBehaviour) — injected via DI or created by factory
- State transitions always go through the state machine — never direct field changes
- Persistence: `GameStateMachine` is a service on GameManager, persists across scenes
- Debug: in Editor builds, display current state stack in `OnGUI` overlay

[IF multiplayer]:

## Networking

[Based on networking decision, prescribe the specific networking architecture pattern]

[IF perspective == VR/XR]:

## XR Setup

- XR Interaction Toolkit for hand/controller interaction
- OpenXR provider for cross-platform headset support
- XR Rig prefab with tracked controllers
- Teleportation and direct movement locomotion providers

## Build & Release

- IL2CPP scripting backend for release builds (faster runtime, harder to decompile)
- Code stripping enabled (`Strip Engine Code`)
- Android: minSdkVersion [22], targetSdkVersion [34], keystore config (not committed)
- iOS: targetOSVersion 15.0, automatic signing for CI
- WebGL: Brotli compression, memory size 512MB
- Desktop: include debug symbols for crash reporting
- All builds: upload symbols to crash reporter (TODO: wire Crashlytics/Backtrace)
```

**IMPORTANT:** Adapt the bracketed sections to ONLY include patterns matching the
user's decisions. Remove irrelevant sections entirely (e.g., remove [FMOD] if audio
is built-in, remove [VR/XR] if not a VR project). The file should read as a single
coherent architecture document, not a menu of options.

### docs/proposal.md

Copy the original proposal.md into the project as a snapshot.

### docs/tasks.md

```markdown
# Tasks

## Phase 1: Core Infrastructure

- [ ] **Error handling** — Debug logging wrapper with `#if` guards + global `Application.logMessageReceived` capture in GameManager
- [ ] **Service setup** — [DI/service pattern] wiring on GameManager prefab
- [ ] **Scene management** — Bootstrap Main.unity + additive scene loading with loading screen
- [ ] **Input system** — [Input] setup with InputHandler service wrapping InputActions
- [ ] **Game state machine** — `IGameState` FSM with MainMenu, Gameplay, Pause, GameOver states
- [ ] **UI framework** — [UI toolkit] base setup with one test screen
- [ ] **Audio system** — AudioManager with music/SFX AudioSources on GameManager
- [ ] **Save/Load system** — SaveManager with JSON serialization to persistentDataPath
- [ ] **Object pooling** — Pool infrastructure using UnityEngine.Pool.ObjectPool

## Phase 2: Entity Models & Game Data

[For each key_entity from proposal:]
- [ ] **[Entity] data** — ScriptableObject config + runtime POCO model
- [ ] **[Entity] prefab** — Prefab with MonoBehaviour components

## Phase 3: MVP Features

[For each mvp_feature, ordered by priority:]
- [ ] **[Feature name]** — [description] `[priority]`

## GATE: Infrastructure Verification

**This is a hard gate.** Phase 2 and Phase 3 MUST NOT start until every check
below passes. Run each check, mark pass/fail. If any fails, fix and re-check.

### Automated checks

- [ ] Project opens in Unity without compile errors
- [ ] Main.unity scene loads without crashes
- [ ] EditMode tests pass (`make test`)

### Manual verification (test in Unity Editor)

- [ ] **Error capture:** Add `throw new Exception("test")` in a MonoBehaviour `Start()` → captured by `Application.logMessageReceived`, logged, NOT a silent failure. Remove after verifying.
- [ ] **Services:** Access a service from a MonoBehaviour via [DI/ServiceLocator] — resolves without errors.
- [ ] **Scene loading:** Load a feature scene additively from Main.unity, loading screen appears, scene loads.
- [ ] **Input:** Press a mapped input action → InputHandler fires the event correctly.
- [ ] **Game state:** Transition from MainMenu to Gameplay state and back — states Enter/Exit correctly.
- [ ] **Audio:** Play a test SFX clip and a music clip — both play at correct volumes.
- [ ] **Save/Load:** Save test data, quit, reopen, load — data matches.
- [ ] **Object pool:** Spawn and despawn a pooled object — pool reuses instances correctly.

### Gate result

All checks pass → update `tasks.md`: mark Phase 1 complete, proceed to Phase 2.
Any check fails → fix the infrastructure, re-run failed checks. Do NOT proceed.

## Known Bugs

_(none yet)_

## v2 Backlog

[For each not_v1_feature:]
- [ ] [Feature name]
```

### docs/design.md

Placeholder with sections:
- Color palette (from proposal if available)
- Typography
- UI components
- Visual effects
- Accessibility requirements (colorblind modes, subtitle options)

### docs/glossary.md

Domain terms from proposal -> `**Term** — Definition` entries.

### docs/changelog.md

Empty template with format example.

### docs/product-guide.md

Elevator pitch + MVP features in player-friendly language.
Include genre, target audience, core gameplay loop.

### docs/spec/{feature}.md

One file per MVP feature with:
- Description (from proposal)
- Game entities involved
- Player-facing behavior (what the player does)
- Acceptance criteria (from proposal)
- Scene: which scene this feature lives in

### docs/qc/test-plan.md

Placeholder with scope and feature areas.

### docs/buildlog.md

Empty template.

### README.md

```markdown
# [Product Name]

[Tagline from proposal]

## Tech Stack

- **Engine:** Unity [version]
- **Render Pipeline:** [choice]
- **Language:** C#
- **Platforms:** [platforms]

## Quick Start

1. Install [Unity Hub](https://unity.com/download)
2. Install Unity Editor [version] via Unity Hub
3. Install [Git LFS](https://git-lfs.github.com/) (required for binary assets)
4. Clone this repo: `git clone [repo-url] && cd [dir]`
5. Run `git lfs pull` to download binary assets
6. Open in Unity Hub: `make open` or add project folder in Unity Hub
7. Open `Assets/Scenes/Main.unity` and press Play

## Git Setup

This project uses Git LFS for binary assets. After cloning:
```bash
git lfs install
git lfs pull
```

Configure Unity YAML merge tool (optional but recommended):
```bash
git config merge.unityyamlmerge.name "Unity YAML Merge"
git config merge.unityyamlmerge.driver "path/to/UnityYAMLMerge merge -p %O %A %B %A"
```

## Docs

- [Architecture](docs/architecture.md) — **Read before coding**
- [Tasks](docs/tasks.md) — MVP progress tracker
- [Proposal](docs/proposal.md) — Product vision
- [Design](docs/design.md) — Visual design system
- [Specs](docs/spec/) — Feature specifications
```

## Return

Report to orchestrator:
- Success/failure
- List of files created

**Do NOT update `decisions.json`.** The orchestrator owns checkpoint writes.
