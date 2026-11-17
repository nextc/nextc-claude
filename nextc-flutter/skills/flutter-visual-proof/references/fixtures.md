# Fixtures: putting a screen in a renderable state

Each recipe goes in a `VisualScreen` entry in `tool/visual/screens.dart`. Status per recipe:
**verified** = run in a scratch app on Flutter 3.44.0 with the packages named (flutter_riverpod 3.5.0, go_router 18.1.4,
shared_preferences, cupertino_icons 2.0.0); **unverified** = written from memory of the package's documented testing
approach, run it and fix the entry before trusting it.

Rule for every recipe: the screen must get its data from the entry, never from the network, a plugin or a device.
If making a screen renderable needs a change under `lib/` (for example the screen builds its own repository inside
`build()`), stop and ask before editing it.

## Verified

- **Riverpod** (verified): `wrap: (app) => ProviderScope(overrides: [orderRepoProvider.overrideWithValue(FakeOrderRepo())], child: app)`.
  The overridden value showed in the PNG. `ProviderScope` must wrap the whole `MaterialApp`, which is what `wrap` does.
- **go_router** (verified): `router: () => GoRouter(initialLocation: '/x', routes: [...])`. It must be a function: the
  registry is built before the test binding exists, and `GoRouter(...)` initializes the wrong binding if called at
  registry time (observed: "Binding is already initialized to WidgetsFlutterBinding"). Stub the routes the screen
  navigates to with `const SizedBox()`.
- **shared_preferences** (verified): `setUp: () async => SharedPreferences.setMockInitialValues({'seen': true})`.
- **Animations and timers** (verified): the harness pumps a fixed 300 ms (`pump:` per entry), never
  `pumpAndSettle`; a `CircularProgressIndicator` rendered without hanging. After the image is written it unmounts the
  screen and advances the test clock 10 minutes, so a one-shot timer (`Future.delayed`, a debounce) does not fail the
  run. A timer longer than 10 minutes still fails it.
- **Network images** (verified for the case with an `errorBuilder`): flutter_test blocks real HTTP, so
  `Image.network(..., errorBuilder: ...)` rendered its error widget. A screen with no `errorBuilder` was not tested.
  For a real-looking picture, inject an `ImageProvider` (`MemoryImage` of a small asset) through the widget's own
  parameters; a headless render never shows real network images (tag "(unverified — needs a run on the simulator)").
- **Custom fonts and icons** (verified): `pubspec.yaml` `fonts:` families, Roboto, MaterialIcons and CupertinoIcons are
  loaded by the harness. Fonts that come from a package (`google_fonts` downloads, `packages/x/Family`) are not
  loaded; the report lists the stand-in and the screen shows Roboto instead.
- **Dark mode** (verified): `VP_BRIGHTNESS=dark|both`; pass the app's real themes through `VisualApp.theme`.
- **An app without `flutter_localizations`** (verified on a fresh `flutter create` app): the harness needs only
  `flutter_test`; leave `VisualApp` at its defaults and it renders in English.
- **A fixture that throws** (verified): an exception from `setUp`, `home`, `router` or `wrap` becomes an `ISSUE` line and
  a `NOTE|... not rendered` line; the other screens still render and the run still passes.
- **Shadows** (verified): the harness turns real shadows on for the render (flutter_test otherwise paints each one as
  a solid black outline) and off again before the test ends.
- **Options** (verified): `VP_SCALES=1.0,1.3`, `VP_SIZE=360x640`, `VP_RATIO=1` (the PNG is 360 x 640), explicit
  `VP_LOCALES=de,pt_BR`. A locale the app does not support renders with Flutter's fallback and adds a `NOTE` line.

## Unverified

- **Bloc / Cubit**: `wrap: (app) => BlocProvider<HomeCubit>.value(value: FakeHomeCubit(), child: app)` with a cubit
  that emits one fixed state (for example `MockCubit` from bloc_test, or a plain subclass).
- **Provider**: `wrap: (app) => ChangeNotifierProvider<Cart>.value(value: Cart()..add(fixtureItem), child: app)`.
- **Firebase**: do not call `Firebase.initializeApp`. Make the screen read from a repository interface and give the
  entry a fake; a screen that calls `FirebaseAuth.instance` directly cannot render without editing `lib/` or
  `firebase_auth_mocks`/`fake_cloud_firestore` (names from memory, check pub.dev before use).
- **Other plugin channels** (path_provider, package_info_plus, ...): in `setUp`, register
  `TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(const MethodChannel('plugins.flutter.io/path_provider'), (call) async => '/tmp')`.
- **Safe areas and notches**: the harness sets no `MediaQuery.padding`. To approximate, wrap `home` in
  `MediaQuery(data: MediaQueryData(padding: EdgeInsets.only(top: 47, bottom: 34)), ...)`. Real device insets are not
  shown (tag as unverified).
- **Platform views** (maps, webview, video): not rendered headlessly; use a placeholder in the fixture and report the
  screen as partly rendered.
- **Cupertino and platform-specific widgets**: Cupertino widgets render in `MaterialApp`; `TargetPlatform` differences
  need `debugDefaultTargetPlatformOverride`, not tried.
- **Multiple Navigator routes / dialogs**: render the route's screen directly; dialogs and bottom sheets need an entry
  whose `home` opens them from a post-frame callback and a longer `pump:`.
