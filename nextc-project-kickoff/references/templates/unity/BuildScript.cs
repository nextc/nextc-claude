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
