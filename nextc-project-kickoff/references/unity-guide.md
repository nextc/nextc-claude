# Unity kickoff guide

Facts below were checked on 2026-11-16 unless marked `(unverified)`. Sources: https://docs.unity.com/en-us/engine/6000.0/manual/unity-editor/command-line-arguments/editor, https://docs.unity3d.com/Packages/com.unity.test-framework@1.4/manual/reference-command-line.html, https://docs.unity.com/en-us/engine/6000.0/script-reference/unityeditor/playersettings/setapplicationidentifier, https://docs.unity.com/en-us/engine/6000.0/manual/building-and-publishing/build-settings/build-profiles, https://unity.com/releases/unity-6, the Unity and OpenUPM registries, and the files inside the installed editor (`Unity.app/Contents/Resources/PackageManager/BuiltInPackages`).

## What is created and by whom

| Created by | What |
|------------|------|
| `scripts/unity-scaffold.mjs write` (text only) | folder tree, `.asmdef` files, `.gitignore`, `.gitattributes`, `.editorconfig`, `Makefile`, `ProjectSettings/ProjectVersion.txt` (so the Hub opens the right editor), `Assets/Editor/BuildScript.cs` (+ `.meta`, same bytes and GUID as `/unity-build`'s scaffold), `Assets/Editor/KickoffSetup.cs` |
| `scripts/upm-check.mjs --write` | `Packages/manifest.json`, resolved at run time |
| The Unity editor (batch step, or first open in the Hub) | `ProjectSettings/*.asset` (including `ProjectSettings.asset`), every other `.meta`, `Library/`, the `Main` scene, bundle id stamping |

Nothing else is hand-written: no ProjectSettings assets, no scene YAML, no `.meta` except BuildScript's.

## Preflight additions

- Editors installed: `ls /Applications/Unity/Hub/Editor` (macOS). Default editor: the newest installed `6000.x`; `--editor` overrides; none installed is a warning (the project is still written, the batch step is not offered).
- `pgrep -fl 'Unity\.app/Contents/MacOS/Unity'`: a running editor blocks the batch step (batch mode cannot open a project another editor has open).
- `git lfs version`: LFS lines go into `.gitattributes` only when the intake says yes (default yes when installed). Never `git lfs install` globally; with a commit chosen, run `git lfs install --local`.
- Unity Hub is never launched by the kickoff.

## Intake items

| Key | Default and when | Notes |
|-----|------------------|-------|
| `editor_version` | newest installed Unity 6 | packages resolve for this editor line |
| `target_devices` | from the proposal (phone, tablet, desktop, WebGL) | drives performance budgets in the doc |
| `dimension` | `2d` or `3d` from the proposal | 2D also passes `-kickoff2D` (editor opens in 2D mode) |
| `render_pipeline` | `urp` | `hdrp` only for high-end PC/console visuals; the proposal must say so |
| `input` | `new` (Input System package) | `legacy` only for an asset that needs it |
| `ui` | `uitoolkit` | `ugui` when the proposal is world-space or HUD-light; a judgement call, say why |
| `networking` | `none` unless a feature id needs players to share state | `netcode` (Netcode for GameObjects), `mirror`, `photon`, `other`. Name the authority model in the doc |
| `di` | `none` (plain C# + ScriptableObject events) for small scope; `vcontainer` for medium and large | |
| `audio` | built-in | FMOD / Wwise are manual installs: no manifest entry, a "Needs your action" line |
| `save` | `json` when any feature persists progress | |
| `analytics` | none | |
| `lfs` | yes when git-lfs is installed | |
| `editor_run` | no | the batch step below: heavier, only when accepted. Say it takes minutes, needs a licensed editor and no open editor on the project |
| `commit` | no | |

## Packages (step `scaffold-files`)

Write the chosen packages into state `dependencies` (reason + feature ids), then resolve and write the manifest in one call:

```bash
node $KICKOFF/scripts/upm-check.mjs --project <proj> --editor <ver> --write <names...>
```

`upm-check.mjs` takes each package from, in order: the installed editor's `BuiltInPackages` (exact version bundled with that editor), the built-in `com.unity.modules.*` (version `1.0.0`), the Unity registry (highest stable version whose minimum editor is not above the editor line), OpenUPM (adds the scoped registry). Exit 1 prints which package is `missing` or `unresolved` and why: fix the name or drop the package, rerun. Never write a version by hand.

| Decision | Package names |
|----------|---------------|
| always | `com.unity.test-framework`, `com.unity.ugui`, `com.unity.ide.visualstudio`, `com.unity.ide.rider`, `com.unity.modules.jsonserialize` |
| `urp` / `hdrp` | `com.unity.render-pipelines.universal` / `com.unity.render-pipelines.high-definition` (editor-bound: resolved only from an installed editor; otherwise `unresolved`, add in Package Manager) |
| `input=new` | `com.unity.inputsystem` |
| `ui=uitoolkit` | built into the editor, no package |
| 2D / 3D | `com.unity.modules.physics2d` / `com.unity.modules.physics` (and `com.unity.2d.*` feature packages only when a feature needs them) |
| `netcode` | `com.unity.netcode.gameobjects` |
| `di=vcontainer` | `jp.hadashikick.vcontainer` (OpenUPM) |
| async | `com.cysharp.unitask` (OpenUPM) only when a feature needs async flows |
| JSON saves | `com.unity.nuget.newtonsoft-json` |
| content streaming | `com.unity.addressables` only when the proposal has downloadable content |

Facts from the registry check: `com.unity.render-pipelines.universal` on the public registry stops at 10.10.1 while editor 6000.4.1f1 bundles 17.4.0, which is why editor-bundled wins. `com.mirror-networking.mirror` returned 404 on OpenUPM, so `mirror` fails with `missing`: tell the user Mirror installs through its own documented route (Asset Store or git URL) `(unverified: not checked)` and record a manual step. `com.unity.textmeshpro` and the Photon, FMOD and Wwise SDKs are not in the manifest.

## Editor batch step (step `editor_run`, only when accepted)

Preflight again right before: no running editor (`pgrep` above) and no `Temp/UnityLockfile`. Run in the background, wait for the completion notification, then read the log:

```bash
"/Applications/Unity/Hub/Editor/<ver>/Unity.app/Contents/MacOS/Unity" -batchmode -nographics -quit \
  -projectPath "<proj>" -logFile "<proj>/.kickoff/logs/editor-run.log" \
  -executeMethod KickoffSetup.Apply -kickoffProductName "<product>" -kickoffCompany "<company>" \
  -kickoffBundleId "<app_id>" [-kickoff2D]
```

`run_in_background: true`, `timeout` 1800000. Flags are from the Unity 6.0 manual: `-batchmode` exits 1 on script exceptions and cannot open a project another editor has open; `-executeMethod` needs a static method in an Editor folder; `-logFile` is required because `-nographics` turns logs off; `-quit` can hide errors on screen but they remain in the log. First import of a project is slow (package resolution, import); if the log shows no progress for ten minutes, stop and report, do not rerun.

After the notification:

1. `node $KICKOFF/scripts/unity-scaffold.mjs scan-log --log <proj>/.kickoff/logs/editor-run.log`: `compiled: failed` lists `error CS...` lines; `licenseProblem` means the editor is not licensed for batch mode (sign in through the Hub once); `projectAlreadyOpen` means an editor holds the project.
2. `node $KICKOFF/scripts/unity-scaffold.mjs verify-stamp --dir <proj> --product "<product>" --company "<company>" --bundle-id "<app_id>"`: reads the generated `ProjectSettings.asset`.
3. On success `node $KICKOFF/scripts/unity-scaffold.mjs remove-setup --dir <proj>` deletes `KickoffSetup.cs`. Unity may rewrite `Packages/manifest.json` and `packages-lock.json`: re-read the manifest before writing the docs.
4. A failure: read the full log, name the cause from it, change one thing. The compile errors reported to the user are the log's lines, not a summary from memory.

Not accepted: run `remove-setup` anyway (the file does nothing without the batch arguments), mark the compile claim `(unverified: needs the editor batch step or opening the project)`, and list the manual steps under "Needs your action": open the project in the Hub (Unity creates `ProjectSettings`, `.meta` files and `Library/`), set Project Settings > Player > Identification > Package Name / Bundle Identifier to `<app_id>` and Company/Product name, add a scene and tick it in Build Profiles / Build Settings (a build with no scenes fails).

## BuildScript contract (the one `/unity-build` expects)

`Assets/Editor/BuildScript.cs` is written only by `unity-scaffold.mjs write`, from `references/templates/unity/BuildScript.cs`, which equals the scaffold in `nextc-unity/agents/unity-builder.md` (checked 2026-11-16).

| Method | Invoked as | Reads | Writes |
|--------|------------|-------|--------|
| `BuildScript.BuildAndroid` | `-buildTarget Android -executeMethod BuildScript.BuildAndroid` | `-appname`, `-buildVersion`, `-buildNumber`, `-developmentBuild` (flag), enabled scenes of `EditorBuildSettings` | `Builds/Android/{appname}_{version}_{build}.apk` (`{appname}.apk` when version or build is missing) |
| `BuildScript.BuildIOS` | `-buildTarget iOS -executeMethod BuildScript.BuildIOS` | `-developmentBuild`, enabled scenes | Xcode project in `Builds/iOS` (contains `Unity-iPhone.xcodeproj`) |

Both exit 0 on `BuildResult.Succeeded`, else 1. The generated `Makefile` targets `build-android` and `build-ios` call exactly these methods with these arguments; there is no `BuildiOS`, `BuildStandalone` or `BuildWebGL`. `make test` and `make test-play` omit `-quit` because with `-runTests` it ends the editor before tests finish. Unity 6 Build Profiles are not used by this script `(unverified: the Build Profiles page does not document BuildPipeline.BuildPlayer behavior)`.

## Architecture section content (Unity)

Layering to write into architecture.md (adapt to the decisions, keep each rule one or two lines):

- **Assemblies**: `<Name>.Core` (services, events, state machine, utilities; no game rules), `<Name>.Game` (one folder per feature, references Core), `<Name>.EditMode` and `<Name>.PlayMode` tests. Namespaces equal assembly names. Features never reference each other directly: they talk through Core events or services.
- **Data tiers**: ScriptableObjects for designer-tuned data (stats, levels, items) in `Assets/ScriptableObjects/Config`; MonoBehaviours only for scene behavior; plain serializable C# classes for save data and messages (no Unity types). Name each concrete asset type and class from the Feature map and Data model.
- **Scenes**: `Main` is the bootstrap scene (created by the editor step); features load additively. List the scenes this product needs (derived from the features).
- **Input**: Input System actions asset and the action maps per feature id (or legacy, when chosen).
- **UI**: the chosen toolkit, where documents/prefabs live, which feature owns which screen.
- **State machine, save/load, audio, pooling, events**: include a section only when a feature id needs it; say which ids. Save: what is saved, format, versioning, where.
- **Networking** (only when chosen): library, authority model, what is synchronized per feature id, offline behavior.
- **Performance**: budgets from `target_devices` (frame rate target, memory, build size) taken from the proposal or marked open.
- **Logging and errors**: `Debug.Log*` calls wrapped for editor/development builds only; every `catch` logs with context; players never see exception text; global handler on `Application.logMessageReceived` for crash reporting if chosen.
- **Build and release**: the BuildScript contract above, Makefile targets, how version and build numbers reach `-appname/-buildVersion/-buildNumber`.

## Gotchas

- Unity generates `ProjectSettings/*.asset` and every `.meta` on first open; hand-written ones are wrong in subtle ways (this is why the old stub and the scene YAML are gone). Commit the generated `.meta` files after the first open.
- A batch run needs a licensed editor and no other editor on the same project; with an open editor it can exit 0 without doing anything (`docs/unity-build-lessons.md` B1). Check the log, not the exit code.
- Package versions must match the editor line: the registry lists old lines of editor-bound packages (URP 10.10.1), so versions come from the installed editor first. A manifest written for another editor line is wrong on the next editor.
- Unity 6 support windows from https://unity.com/releases/unity-6 (2026-11-16): 6.3 LTS two-year support until December 2027; 6.0 LTS through October 2026. Mention when the chosen editor is on a line close to its end.
- `PlayerSettings.SetApplicationIdentifier` has a `NamedBuildTarget` overload and a deprecated `BuildTargetGroup` overload; `KickoffSetup.cs` uses the first.
- The official Unity MCP is optional and not installed by the kickoff: open beta, needs Unity 6 or later, the AI Assistant package (`com.unity.ai.assistant`) and a Unity AI beta subscription (https://unity.com/blog/unity-ai-mcp-how-to-get-started).
- `.gitattributes` has no `merge=unityyamlmerge` lines: that driver needs per-machine git config the kickoff does not write.
