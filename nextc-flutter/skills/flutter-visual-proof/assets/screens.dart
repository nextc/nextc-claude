// The registry: every screen /flutter-visual-proof can render, with the fixture data it needs.
// Edit this file by hand or let the skill add entries. Commit it: it is shared knowledge about
// how to put each screen in a renderable state without network, plugins or a device.
// ignore: unused_import, needed as soon as the registry has an entry or a theme
import 'package:flutter/material.dart';

import 'render.dart';
// Add imports for the app here, for example:
// import 'package:my_app/l10n/app_localizations.dart';
// import 'package:my_app/features/home/home_screen.dart';

/// Project-wide settings. Replace the defaults with the app's own:
///   delegates: AppLocalizations.localizationsDelegates,
///   locales:   AppLocalizations.supportedLocales,
///   theme:     (b) => b == Brightness.dark ? AppTheme.dark : AppTheme.light,
final visualApp = const VisualApp();

/// Add one entry per screen. How to add a screen:
///  1. `id`: short and unique (used in file names and in VP_SCREENS).
///  2. `sources`: the lib/ files the screen is built from (its own file and the widgets it
///     uses directly); the skill maps changed files to screens through this list.
///  3. `home`: build the screen with fixture data. Give it fake repositories or providers so it
///     never touches the network or a plugin. Recipes: references/fixtures.md of the skill
///     (Riverpod overrides via `wrap`, Bloc, go_router via `router`, Firebase,
///     SharedPreferences and other plugin channels via `setUp`, network images, animations).
///  4. Run the skill again; a screen that throws shows up as an ISSUE line, not a failed run.
final List<VisualScreen> screens = [
  // VisualScreen(
  //   id: 'home',
  //   sources: ['lib/features/home/home_screen.dart', 'lib/widgets/order_card.dart'],
  //   home: () => const HomeScreen(),
  //   // Riverpod: wrap: (app) => ProviderScope(overrides: [orderRepoProvider.overrideWithValue(FakeOrderRepo())], child: app),
  //   // Plugins:  setUp: () async { SharedPreferences.setMockInitialValues({'seen_intro': true}); },
  // ),
];
