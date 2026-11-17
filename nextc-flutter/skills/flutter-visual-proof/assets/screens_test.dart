// Render harness entry point. Run it (never `flutter test` on the whole project) as:
//   flutter test tool/visual/screens_test.dart \
//     --dart-define=VP_SCREENS=home,settings        screen ids, empty = all registered
//     --dart-define=VP_LOCALES=all                  all | en,de,pt_BR
//     --dart-define=VP_SCALES=1.0                   text scales for every locale
//     --dart-define=VP_WIDE_LOCALES=de,fr           locales also rendered at VP_WIDE_SCALE (default 1.5)
//     --dart-define=VP_BRIGHTNESS=light             light | dark | both
//     --dart-define=VP_SIZE=390x844 --dart-define=VP_RATIO=2
// Output: build/visual/latest/*.png and build/visual/latest/report.txt (previous run in build/visual/previous).
import 'package:flutter_test/flutter_test.dart';

import 'render.dart';
import 'screens.dart';

void main() {
  final cfg = VisualConfig.fromEnvironment(visualApp.locales);
  final selected = cfg.screens.isEmpty
      ? screens
      : screens.where((s) => cfg.screens.contains(s.id)).toList();

  setUpAll(() async {
    rotateRuns();
    await loadFonts();
  });
  tearDownAll(writeReport);

  testWidgets('visual proof: selection', (tester) async {
    for (final id in cfg.screens) {
      if (!screens.any((s) => s.id == id)) {
        report.add('NOTE|not rendered: no registry entry for "$id"');
      }
    }
    if (selected.isEmpty) report.add('NOTE|no registered screen matched the selection');
    for (final l in {...cfg.locales, ...cfg.wideLocales}) {
      if (!visualApp.locales.contains(l)) {
        report.add('NOTE|locale "$l" is not in the app\'s supported locales; Flutter shows another one in its place');
      }
    }
  });

  for (final screen in selected) {
    for (final (locale, scale) in cfg.localeScales) {
      for (final brightness in cfg.brightnesses) {
        testWidgets('${screen.id} $locale x$scale ${brightness.name}', (tester) async {
          await renderScreen(tester, screen, visualApp, cfg,
              locale: locale, scale: scale, brightness: brightness);
        });
      }
    }
  }
}
