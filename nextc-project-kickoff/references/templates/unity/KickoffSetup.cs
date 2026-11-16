using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.SceneManagement;
using UnityEngine;

// EXTERNAL: invoked once by /unity-kickoff in batch mode:
//   -executeMethod KickoffSetup.Apply -kickoffProductName X -kickoffCompany Y -kickoffBundleId Z [-kickoff2D]
// It stamps the decided identity through PlayerSettings and creates the bootstrap scene through the
// scene API, so no ProjectSettings or scene YAML is hand-written. The kickoff deletes this file afterwards.
public static class KickoffSetup
{
    private const string ScenePath = "Assets/Scenes/Main.unity";

    public static void Apply()
    {
        var args = Environment.GetCommandLineArgs();
        var product = GetArg(args, "-kickoffProductName");
        var company = GetArg(args, "-kickoffCompany");
        var bundleId = GetArg(args, "-kickoffBundleId");
        if (product == null || company == null || bundleId == null)
        {
            Debug.LogError("KickoffSetup: -kickoffProductName, -kickoffCompany and -kickoffBundleId are required");
            EditorApplication.Exit(1);
            return;
        }

        PlayerSettings.productName = product;
        PlayerSettings.companyName = company;
        PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Android, bundleId);
        PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.iOS, bundleId);
        PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Standalone, bundleId);
        if (Array.IndexOf(args, "-kickoff2D") >= 0) EditorSettings.defaultBehaviorMode = EditorBehaviorMode.Mode2D;

        if (!File.Exists(ScenePath))
        {
            Directory.CreateDirectory("Assets/Scenes");
            var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
            EditorSceneManager.SaveScene(scene, ScenePath);
        }
        EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };

        AssetDatabase.SaveAssets();
        EditorApplication.Exit(0);
    }

    private static string GetArg(string[] args, string key)
    {
        for (var i = 0; i < args.Length - 1; i++)
            if (args[i] == key) return args[i + 1];
        return null;
    }
}
