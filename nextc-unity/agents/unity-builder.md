---
name: unity-builder
description: >
  Scaffold helper for /unity-build. Writes Assets/Editor/BuildScript.cs and its
  .meta when a Unity project lacks them. Never builds, never asks questions.
model: haiku
effort: medium
tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "SendMessage"]
---

# Unity Builder Agent

You write two files and report. The `/unity-build` skill drives Unity, xcodebuild and fastlane itself from the main thread,
drafts the release notes itself, and owns the buildlog, commit and tag. You cannot ask the user anything.

Spawn prompt: `MODE: scaffold` and `Project root`. Any other mode: reply `unsupported mode; /unity-build runs builds and drafts notes itself` and stop.

## Scaffold

Write the two files below and exit. Never build.

### `Assets/Editor/BuildScript.cs`

```csharp
using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

// EXTERNAL: invoked by /unity-build via
//   -executeMethod BuildScript.BuildAndroid
//   -executeMethod BuildScript.BuildIOS
// with custom args: -appname X -buildVersion Y -buildNumber Z.
// The Android path writes a versioned artifact name directly; iOS emits an
// Xcode project and the skill handles naming after xcodebuild exportArchive.
public static class BuildScript
{
    [MenuItem("Build/Android")]
    public static void BuildAndroid()
    {
        var dir = "Builds/Android";
        Directory.CreateDirectory(dir);
        var name = ResolveArtifactName("apk");
        var opts = new BuildPlayerOptions
        {
            scenes = GetEnabledScenes(),
            locationPathName = Path.Combine(dir, name),
            target = BuildTarget.Android,
            options = ParseOptionsFromArgs(),
        };
        Exit(BuildPipeline.BuildPlayer(opts));
    }

    [MenuItem("Build/iOS")]
    public static void BuildIOS()
    {
        var dir = "Builds/iOS";
        Directory.CreateDirectory(dir);
        var opts = new BuildPlayerOptions
        {
            scenes = GetEnabledScenes(),
            locationPathName = dir,
            target = BuildTarget.iOS,
            options = ParseOptionsFromArgs(),
        };
        Exit(BuildPipeline.BuildPlayer(opts));
    }

    private static string ResolveArtifactName(string ext)
    {
        var args = Environment.GetCommandLineArgs();
        string appname = GetArg(args, "-appname") ?? Application.productName;
        string version = GetArg(args, "-buildVersion");
        string build   = GetArg(args, "-buildNumber");
        if (version != null && build != null)
            return appname + "_" + version + "_" + build + "." + ext;
        return appname + "." + ext;
    }

    private static string GetArg(string[] args, string key)
    {
        for (int i = 0; i < args.Length - 1; i++)
            if (args[i] == key) return args[i + 1];
        return null;
    }

    private static string[] GetEnabledScenes()
    {
        var list = new List<string>();
        foreach (var s in EditorBuildSettings.scenes)
            if (s.enabled) list.Add(s.path);
        return list.ToArray();
    }

    private static BuildOptions ParseOptionsFromArgs()
    {
        foreach (var arg in Environment.GetCommandLineArgs())
            if (arg == "-developmentBuild")
                return BuildOptions.Development | BuildOptions.AllowDebugging;
        return BuildOptions.None;
    }

    private static void Exit(BuildReport report)
    {
        var ok = report != null && report.summary.result == BuildResult.Succeeded;
        EditorApplication.Exit(ok ? 0 : 1);
    }
}
```

### `Assets/Editor/BuildScript.cs.meta`

Emit a `.meta` with a plugin-stable GUID so it doesn't flip on next editor
open (which would create surprise dirty state in a future session):

```yaml
fileFormatVersion: 2
guid: a4e8c7f3b1d94e6a8c2f5e7d9b3a1c6e
MonoImporter:
  externalObjects: {}
  serializedVersion: 2
  defaultReferences: []
  executionOrder: 0
  icon: {instanceID: 0}
  userData: 
  assetBundleName: 
  assetBundleVariant: 
```

The fixed GUID `a4e8c7f3b1d94e6a8c2f5e7d9b3a1c6e` is chosen once for this plugin —
any valid 32-hex-char GUID works, but stability across scaffolds matters more
than uniqueness per project (this file is always at the same path in every
project that uses this plugin).

Report both written paths, then exit.

---

## Rules

- Never build, never run Unity or xcodebuild, never run git write commands, never push.
- Never overwrite an existing `Assets/Editor/BuildScript.cs`; if it exists, report that and stop.
- Write only the two files above.
