# Unity Scaffolder — File Templates

> Owner: `nextc-project-kickoff/agents/unity-scaffolder.md` (Steps 4–11). Update here when ProjectSettings/asmdef/Makefile templates change.

Reference for `unity-scaffolder` agent. Read this file when writing Steps 4–11.

---

## EditorSettings.asset (Step 4)

Force Text serialization and Visible Meta Files — critical for git diffs.

Set `m_DefaultBehaviorMode` to `1` if perspective is 2D (switches default scene view to 2D).

```yaml
%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!159 &1
EditorSettings:
  m_ObjectHideFlags: 0
  serializedVersion: 11
  m_ExternalVersionControlSupport: Visible Meta Files
  m_SerializationMode: 2
  m_LineEndingsForNewScripts: 2
  m_DefaultBehaviorMode: 0
  m_SpritePackerMode: 0
  m_ProjectGenerationIncludedExtensions: txt;xml;fnt;cd;asmdef;rsp;asmref
  m_ProjectGenerationRootNamespace: [ProductNamePascalCase]
```

---

## ProjectSettings.asset (Step 5)

Minimal stub. Unity populates remaining fields on first open.

Set `defaultScreenWidth`/`Height` to 1080/1920 for mobile-first projects.

```yaml
%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!129 &1
PlayerSettings:
  m_ObjectHideFlags: 0
  serializedVersion: 24
  productName: [ProductName]
  companyName: [CompanyName]
  defaultScreenWidth: 1920
  defaultScreenHeight: 1080
  m_SplashScreenBackgroundColor: {r: 0.13, g: 0.13, b: 0.13, a: 1}
  bundleVersion: 0.1.0
```

---

## Assembly Definitions (Step 6)

Replace `[ProductName]` with the PascalCase product name from decisions.

**Assets/Scripts/Core/[ProductName].Core.asmdef:**
```json
{
  "name": "[ProductName].Core",
  "rootNamespace": "[ProductName].Core",
  "references": [],
  "includePlatforms": [],
  "excludePlatforms": [],
  "allowUnsafeCode": false,
  "overrideReferences": false,
  "precompiledReferences": [],
  "autoReferenced": true,
  "defineConstraints": [],
  "versionDefines": [],
  "noEngineReferences": false
}
```

**Assets/Scripts/Game/[ProductName].Game.asmdef:**
```json
{
  "name": "[ProductName].Game",
  "rootNamespace": "[ProductName].Game",
  "references": ["[ProductName].Core"],
  "includePlatforms": [],
  "excludePlatforms": [],
  "allowUnsafeCode": false,
  "overrideReferences": false,
  "precompiledReferences": [],
  "autoReferenced": true,
  "defineConstraints": [],
  "versionDefines": [],
  "noEngineReferences": false
}
```

**Assets/Scripts/Tests/EditMode/[ProductName].EditMode.asmdef:**
```json
{
  "name": "[ProductName].EditMode",
  "rootNamespace": "[ProductName].EditMode",
  "references": [
    "[ProductName].Core",
    "UnityEngine.TestRunner",
    "UnityEditor.TestRunner"
  ],
  "includePlatforms": ["Editor"],
  "excludePlatforms": [],
  "allowUnsafeCode": false,
  "overrideReferences": true,
  "precompiledReferences": ["nunit.framework.dll"],
  "autoReferenced": false,
  "defineConstraints": ["UNITY_INCLUDE_TESTS"],
  "versionDefines": [],
  "noEngineReferences": false
}
```

**Assets/Scripts/Tests/PlayMode/[ProductName].PlayMode.asmdef:**
```json
{
  "name": "[ProductName].PlayMode",
  "rootNamespace": "[ProductName].PlayMode",
  "references": [
    "[ProductName].Core",
    "[ProductName].Game",
    "UnityEngine.TestRunner",
    "UnityEditor.TestRunner"
  ],
  "includePlatforms": [],
  "excludePlatforms": [],
  "allowUnsafeCode": false,
  "overrideReferences": true,
  "precompiledReferences": ["nunit.framework.dll"],
  "autoReferenced": false,
  "defineConstraints": ["UNITY_INCLUDE_TESTS"],
  "versionDefines": [],
  "noEngineReferences": false
}
```

---

## .gitignore (Step 7)

```
# Unity generated
[Ll]ibrary/
[Tt]emp/
[Oo]bj/
[Bb]uild/
[Bb]uilds/
[Ll]ogs/
[Mm]emoryCaptures/
[Uu]serSettings/

# Crash reports
sysinfo.txt
crashlytics-build.properties

# Asset meta — NEVER ignore these (breaks serialized references)
# !/[Aa]ssets/**/*.meta

# Visual Studio / Rider
.vs/
*.csproj
*.sln
*.suo
*.user
.idea/

# VS Code (keep .vscode/ for team settings)
.vscode/settings.json

# macOS
.DS_Store

# Secrets
.env
.env.*

# Unity Cloud Build
UnityCloudBuildDetail.json

# unity-kickoff checkpoint
.unity-kickoff/
```

---

## .gitattributes (Step 8)

Unity LFS patterns and YAML merge driver:

```gitattributes
# Unity YAML — merge driver
*.unity merge=unityyamlmerge eol=lf
*.prefab merge=unityyamlmerge eol=lf
*.asset merge=unityyamlmerge eol=lf
*.meta merge=unityyamlmerge eol=lf
*.controller merge=unityyamlmerge eol=lf
*.anim merge=unityyamlmerge eol=lf

# 3D models — LFS
*.fbx filter=lfs diff=lfs merge=lfs -text
*.obj filter=lfs diff=lfs merge=lfs -text
*.blend filter=lfs diff=lfs merge=lfs -text
*.max filter=lfs diff=lfs merge=lfs -text
*.ma filter=lfs diff=lfs merge=lfs -text
*.mb filter=lfs diff=lfs merge=lfs -text

# Textures — LFS
*.png filter=lfs diff=lfs merge=lfs -text
*.jpg filter=lfs diff=lfs merge=lfs -text
*.jpeg filter=lfs diff=lfs merge=lfs -text
*.psd filter=lfs diff=lfs merge=lfs -text
*.tga filter=lfs diff=lfs merge=lfs -text
*.tiff filter=lfs diff=lfs merge=lfs -text
*.gif filter=lfs diff=lfs merge=lfs -text
*.exr filter=lfs diff=lfs merge=lfs -text
*.hdr filter=lfs diff=lfs merge=lfs -text

# Audio — LFS
*.wav filter=lfs diff=lfs merge=lfs -text
*.mp3 filter=lfs diff=lfs merge=lfs -text
*.ogg filter=lfs diff=lfs merge=lfs -text
*.aif filter=lfs diff=lfs merge=lfs -text

# Video — LFS
*.mp4 filter=lfs diff=lfs merge=lfs -text
*.mov filter=lfs diff=lfs merge=lfs -text

# Fonts — LFS
*.ttf filter=lfs diff=lfs merge=lfs -text
*.otf filter=lfs diff=lfs merge=lfs -text

# Other binary — LFS
*.pdf filter=lfs diff=lfs merge=lfs -text
*.zip filter=lfs diff=lfs merge=lfs -text
*.unitypackage filter=lfs diff=lfs merge=lfs -text
*.dll filter=lfs diff=lfs merge=lfs -text
*.so filter=lfs diff=lfs merge=lfs -text
*.dylib filter=lfs diff=lfs merge=lfs -text
```

---

## .editorconfig (Step 9)

```ini
root = true

[*]
indent_style = space
indent_size = 4
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.cs]
dotnet_sort_system_directives_first = true
csharp_new_line_before_open_brace = all
csharp_indent_case_contents = true
csharp_space_after_cast = false
csharp_preserve_single_line_blocks = true
csharp_preserve_single_line_statements = false

[*.{json,yaml,yml,xml}]
indent_size = 2

[Makefile]
indent_style = tab
```

---

## .vscode/settings.json (Step 10)

```json
{
  "editor.formatOnSave": true,
  "omnisharp.useModernNet": true,
  "omnisharp.enableRoslynAnalyzers": true,
  "files.exclude": {
    "**/.DS_Store": true,
    "Library/": true,
    "Temp/": true,
    "Obj/": true,
    "Logs/": true,
    "UserSettings/": true,
    "**/*.meta": false
  }
}
```

---

## Makefile (Step 11)

Replace `[unity_version]` with the actual version from decisions.

```makefile
# Unity project Makefile
# Set UNITY to your Unity Editor path, or it uses the default macOS path
UNITY ?= /Applications/Unity/Hub/Editor/[unity_version]/Unity.app/Contents/MacOS/Unity
PROJECT := $(shell pwd)

.PHONY: open test test-play build-standalone build-android build-webgl build-ios clean

open:
	open -a "Unity Hub" --args --projectPath "$(PROJECT)"

test:
	$(UNITY) -batchmode -projectPath "$(PROJECT)" \
		-runTests -testPlatform EditMode \
		-testResults "$(PROJECT)/Logs/editmode-results.xml" \
		-logFile "$(PROJECT)/Logs/editmode.log" \
		-quit

test-play:
	$(UNITY) -batchmode -projectPath "$(PROJECT)" \
		-runTests -testPlatform PlayMode \
		-testResults "$(PROJECT)/Logs/playmode-results.xml" \
		-logFile "$(PROJECT)/Logs/playmode.log" \
		-quit

build-standalone:
	$(UNITY) -batchmode -projectPath "$(PROJECT)" \
		-buildTarget StandaloneOSX \
		-executeMethod BuildScript.BuildStandalone \
		-logFile "$(PROJECT)/Logs/build-standalone.log" \
		-quit

build-android:
	$(UNITY) -batchmode -projectPath "$(PROJECT)" \
		-buildTarget Android \
		-executeMethod BuildScript.BuildAndroid \
		-logFile "$(PROJECT)/Logs/build-android.log" \
		-quit

build-webgl:
	$(UNITY) -batchmode -projectPath "$(PROJECT)" \
		-buildTarget WebGL \
		-executeMethod BuildScript.BuildWebGL \
		-logFile "$(PROJECT)/Logs/build-webgl.log" \
		-quit

build-ios:
	$(UNITY) -batchmode -projectPath "$(PROJECT)" \
		-buildTarget iOS \
		-executeMethod BuildScript.BuildiOS \
		-logFile "$(PROJECT)/Logs/build-ios.log" \
		-quit

clean:
	rm -rf Library Temp Obj Builds Logs
```
