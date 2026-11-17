// Visual proof harness: renders registered screens to PNG with real fonts, no simulator.
// This is a render harness, not a test suite: it asserts nothing and never fails on a layout issue.
// Run it only through /flutter-visual-proof (see screens_test.dart for the command and VP_* options).
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

/// One renderable screen. Add instances to `screens` in screens.dart.
class VisualScreen {
  const VisualScreen({
    required this.id,
    required this.sources,
    required this.home,
    this.router,
    this.wrap,
    this.setUp,
    this.pump = const Duration(milliseconds: 300),
  });

  /// Short unique name; used in file names and in `VP_SCREENS`.
  final String id;

  /// lib/ files this screen is defined in or depends on directly (repo-relative paths).
  /// The skill maps `git diff` files to screens through this list.
  final List<String> sources;

  /// Builds the screen with fixture data. Ignored when [router] is set.
  final Widget Function() home;

  /// For go_router and other router apps: builds the router config, rendered with MaterialApp.router.
  /// A function, because GoRouter(...) initializes the Flutter binding and the registry is built
  /// before the test binding exists.
  final RouterConfig<Object> Function()? router;

  /// Wraps the whole MaterialApp (ProviderScope with overrides, BlocProvider, ...).
  final Widget Function(Widget app)? wrap;

  /// Runs before the screen is built (mock channels, SharedPreferences.setMockInitialValues, ...).
  final Future<void> Function()? setUp;

  /// How long to pump after building. Never use pumpAndSettle here: looping animations hang it.
  final Duration pump;
}

/// Project-wide settings, filled in screens.dart.
class VisualApp {
  const VisualApp({
    this.delegates = const [],
    this.locales = const [Locale('en')],
    this.theme,
  });

  /// e.g. AppLocalizations.localizationsDelegates (the generated list already holds the Global*
  /// delegates). Empty means Flutter's built-in English strings, so an app without
  /// flutter_localizations still renders.
  final List<LocalizationsDelegate<dynamic>> delegates;

  /// e.g. AppLocalizations.supportedLocales
  final List<Locale> locales;

  /// The app's real ThemeData per brightness. When null the harness uses a Roboto Material 3 stand-in.
  final ThemeData Function(Brightness brightness)? theme;
}

/// Options read from --dart-define values, so the skill filters without editing files.
class VisualConfig {
  VisualConfig._(this.screens, this.locales, this.scales, this.wideLocales,
      this.wideScale, this.brightnesses, this.size, this.ratio);

  factory VisualConfig.fromEnvironment(List<Locale> supported) {
    const screens = String.fromEnvironment('VP_SCREENS');
    const locales = String.fromEnvironment('VP_LOCALES', defaultValue: 'all');
    const scales = String.fromEnvironment('VP_SCALES', defaultValue: '1.0');
    const wide = String.fromEnvironment('VP_WIDE_LOCALES');
    const wideScale = String.fromEnvironment('VP_WIDE_SCALE', defaultValue: '1.5');
    const brightness = String.fromEnvironment('VP_BRIGHTNESS', defaultValue: 'light');
    const size = String.fromEnvironment('VP_SIZE', defaultValue: '390x844');
    const ratio = String.fromEnvironment('VP_RATIO', defaultValue: '2');
    List<String> list(String s) =>
        s.split(',').map((e) => e.trim()).where((e) => e.isNotEmpty).toList();
    // en, pt_BR, zh_Hant, zh_Hant_TW; a name with no language in it is dropped.
    Locale? locale(String s) {
      final parts = s.split(RegExp('[-_]')).where((p) => p.isNotEmpty).toList();
      if (parts.isEmpty) return null;
      final script = parts.length > 1 && parts[1].length == 4 ? parts[1] : null;
      final rest = parts.sublist(script == null ? 1 : 2);
      return Locale.fromSubtags(
          languageCode: parts[0], scriptCode: script, countryCode: rest.isEmpty ? null : rest[0]);
    }

    final wh = size.split('x');
    return VisualConfig._(
      list(screens),
      locales == 'all' ? supported : list(locales).map(locale).whereType<Locale>().toList(),
      list(scales).map(double.parse).toList(),
      list(wide).map(locale).whereType<Locale>().toList(),
      double.parse(wideScale),
      brightness == 'both'
          ? Brightness.values
          : [brightness == 'dark' ? Brightness.dark : Brightness.light],
      Size(double.parse(wh[0]), double.parse(wh[1])),
      double.parse(ratio),
    );
  }

  final List<String> screens;
  final List<Locale> locales;
  final List<double> scales;
  final List<Locale> wideLocales;
  final double wideScale;
  final List<Brightness> brightnesses;
  final Size size;
  final double ratio;

  /// (locale, scale) pairs: every locale at every scale, plus the wide locales at the wide scale.
  List<(Locale, double)> get localeScales {
    final pairs = <(Locale, double)>[
      for (final l in locales.toSet())
        for (final s in scales.toSet()) (l, s),
    ];
    for (final l in wideLocales) {
      if (!pairs.any((p) => p.$1 == l && p.$2 == wideScale)) pairs.add((l, wideScale));
    }
    return pairs;
  }
}

// Collects report lines. Format, one per line, fields separated by `|`:
//   IMAGE|path|screen|locale|scale|brightness
//   ISSUE|screen|locale|scale|brightness|first line of the exception
//   FONT|family|loaded|source   or   FONT|family|substituted|reason
//   NOTE|text
class Report {
  final List<String> lines = [];
  void add(String line) => lines.add(line);
  void issue(String screen, Locale l, double s, Brightness b, String message) =>
      add('ISSUE|$screen|$l|$s|${b.name}|${message.split('\n').first.replaceAll('|', '/')}');
}

final report = Report();
const outRoot = 'build/visual';
const outDir = '$outRoot/latest';

/// Keeps the previous run next to the new one: latest -> previous, so before/after can be compared.
void rotateRuns() {
  final latest = Directory(outDir);
  final previous = Directory('$outRoot/previous');
  if (previous.existsSync()) previous.deleteSync(recursive: true);
  if (latest.existsSync()) latest.renameSync(previous.path);
  Directory(outDir).createSync(recursive: true);
}

void writeReport() {
  File('$outDir/report.txt').writeAsStringSync('${report.lines.join('\n')}\n');
  // ignore: avoid_print
  print(report.lines.join('\n'));
}

/// Loads the app's own fonts (pubspec.yaml `fonts:`), then the SDK's Roboto and MaterialIcons,
/// and CupertinoIcons when the package is present. Records what was loaded or substituted.
Future<void> loadFonts() async {
  final root = Platform.environment['FLUTTER_ROOT']!;
  final sdk = '$root/bin/cache/artifacts/material_fonts';

  Future<ByteData> bytes(File f) async => ByteData.sublistView(f.readAsBytesSync());

  for (final entry in _pubspecFonts().entries) {
    final loader = FontLoader(entry.key);
    var count = 0;
    for (final path in entry.value) {
      final file = File(path);
      if (file.existsSync()) {
        loader.addFont(bytes(file));
        count++;
      } else {
        report.add('FONT|${entry.key}|substituted|file missing: $path');
      }
    }
    if (count > 0) {
      await loader.load();
      report.add('FONT|${entry.key}|loaded|pubspec.yaml ($count files)');
    }
  }

  final roboto = FontLoader('Roboto');
  for (final w in ['Regular', 'Medium', 'Bold']) {
    roboto.addFont(bytes(File('$sdk/Roboto-$w.ttf')));
  }
  await roboto.load();
  report.add('FONT|Roboto|loaded|Flutter SDK');
  await (FontLoader('MaterialIcons')..addFont(bytes(File('$sdk/MaterialIcons-Regular.otf'))))
      .load();
  report.add('FONT|MaterialIcons|loaded|Flutter SDK');

  final cupertino = _cupertinoIconsFile();
  if (cupertino != null) {
    await (FontLoader('packages/cupertino_icons/CupertinoIcons')..addFont(bytes(cupertino)))
        .load();
    report.add('FONT|CupertinoIcons|loaded|cupertino_icons package');
  }
}

/// Minimal line-based read of `flutter: fonts:` in pubspec.yaml (no yaml dependency).
/// Handles the standard `- family: X` / `fonts: - asset: path` layout only.
Map<String, List<String>> _pubspecFonts() {
  final fonts = <String, List<String>>{};
  final file = File('pubspec.yaml');
  if (!file.existsSync()) return fonts;
  String? family;
  var inFonts = false;
  for (final raw in file.readAsLinesSync()) {
    final line = raw.replaceFirst(RegExp(r'\s+#.*$'), '');
    if (RegExp(r'^\s{2}fonts:\s*$').hasMatch(line)) {
      inFonts = true;
      continue;
    }
    if (inFonts && RegExp(r'^\S').hasMatch(line)) inFonts = false;
    if (inFonts && RegExp(r'^\s{2}\S').hasMatch(line) && !line.trimLeft().startsWith('-')) {
      inFonts = false;
    }
    if (!inFonts) continue;
    final fam = RegExp(r'family:\s*["\x27]?([^"\x27]+?)["\x27]?\s*$').firstMatch(line);
    if (fam != null) {
      family = fam.group(1);
      fonts.putIfAbsent(family!, () => []);
      continue;
    }
    final asset = RegExp(r'asset:\s*["\x27]?([^"\x27]+?)["\x27]?\s*$').firstMatch(line);
    if (asset != null && family != null) fonts[family]!.add(asset.group(1)!);
  }
  return fonts;
}

File? _cupertinoIconsFile() {
  final cfg = File('.dart_tool/package_config.json');
  if (!cfg.existsSync()) return null;
  final packages = (jsonDecode(cfg.readAsStringSync())['packages'] as List);
  for (final p in packages) {
    if (p['name'] == 'cupertino_icons') {
      final dir = Directory.fromUri(cfg.parent.uri.resolve(p['rootUri'] as String));
      final f = File('${dir.path}/assets/CupertinoIcons.ttf');
      return f.existsSync() ? f : null;
    }
  }
  return null;
}

/// Renders one screen under one locale, text scale and brightness to a PNG. Never throws on layout issues.
Future<void> renderScreen(
  WidgetTester tester,
  VisualScreen screen,
  VisualApp app,
  VisualConfig cfg, {
  required Locale locale,
  required double scale,
  required Brightness brightness,
}) async {
  // A screen id may hold anything; a file name may not.
  final tag =
      '${screen.id.replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '_')}__${locale}__x${scale}__${brightness.name}';
  tester.view.physicalSize = cfg.size * cfg.ratio;
  tester.view.devicePixelRatio = cfg.ratio;
  addTearDown(tester.view.reset);

  final errors = <String>[];
  var isRendering = true;
  final previousHandler = FlutterError.onError;
  // WORKAROUND: flutter_test paints every shadow as a solid black outline (debugDisableShadows is
  // true in tests). Real shadows are turned on for the render and off again before the test ends,
  // because the test binding fails a test that leaves a debug variable changed.
  debugDisableShadows = false;
  FlutterError.onError = (d) {
    if (isRendering) errors.add(d.exceptionAsString());
  };
  final key = GlobalKey();
  try {
    // A fixture that throws (theme, setUp, home, router, wrap) becomes an ISSUE line like a layout error.
    try {
      final theme = app.theme?.call(brightness) ??
          ThemeData(brightness: brightness, fontFamily: 'Roboto', useMaterial3: true);
      Widget builder(BuildContext c, Widget? child) => MediaQuery(
            data: MediaQuery.of(c).copyWith(textScaler: TextScaler.linear(scale)),
            child: child!,
          );
      final delegates = app.delegates.isEmpty ? null : app.delegates;
      await screen.setUp?.call();
      Widget materialApp = screen.router != null
          ? MaterialApp.router(
              debugShowCheckedModeBanner: false,
              routerConfig: screen.router!(),
              locale: locale,
              supportedLocales: app.locales,
              localizationsDelegates: delegates,
              theme: theme,
              builder: builder)
          : MaterialApp(
              debugShowCheckedModeBanner: false,
              home: screen.home(),
              locale: locale,
              supportedLocales: app.locales,
              localizationsDelegates: delegates,
              theme: theme,
              builder: builder);
      if (screen.wrap != null) materialApp = screen.wrap!(materialApp);
      await tester.pumpWidget(RepaintBoundary(key: key, child: materialApp));
      await tester.pump(screen.pump);
    } catch (e) {
      errors.add('$e');
    }
    final pending = tester.takeException();
    if (pending != null) errors.add('$pending');

    final context = key.currentContext;
    if (context == null) {
      report.add('NOTE|$tag not rendered: widget tree did not build');
    } else {
      try {
        await tester.runAsync(() async {
          final boundary = context.findRenderObject()! as RenderRepaintBoundary;
          final image = await boundary.toImage(pixelRatio: cfg.ratio);
          final data = await image.toByteData(format: ui.ImageByteFormat.png);
          final path = '$outDir/$tag.png';
          File(path).writeAsBytesSync(data!.buffer.asUint8List());
          report.add('IMAGE|$path|${screen.id}|$locale|$scale|${brightness.name}');
        });
      } catch (e) {
        errors.add('image not written: $e');
      }
    }
    isRendering = false;
    // ORDER: unmount, then let the fake clock run. A one-shot timer the screen started (a debounce,
    // a splash delay, a retry) is cancelled or fires here; one still pending when the test ends
    // fails the test. What a timer does to a screen that is gone is not a finding about the screen.
    try {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(minutes: 10));
    } catch (_) {
      // Already unmounted; nothing to report.
    }
    tester.takeException();
  } finally {
    FlutterError.onError = previousHandler;
    debugDisableShadows = true;
  }

  // One broken layout raises the same exception many times; each message is listed once.
  final unique = errors.map((e) => e.split('\n').first).toSet().toList();
  for (final e in unique.take(_maxIssuesPerRender)) {
    report.issue(screen.id, locale, scale, brightness, e);
  }
  if (unique.length > _maxIssuesPerRender) {
    report.add('NOTE|$tag has ${unique.length - _maxIssuesPerRender} more issues not listed');
  }
}

const _maxIssuesPerRender = 6;
