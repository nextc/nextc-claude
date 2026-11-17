---
name: flutter-visual-proof
description: Render the Flutter screens a change touched to PNG without a simulator, per locale and text scale, so Claude can look at them. Use when a UI change needs a visual check or translations may overflow.
when_to_use: |
  Use when a UI change needs to be seen, a layout or design.md match is in question, or translated text may overflow. Triggers: "show me the screen", "visual proof", "render the screens", "check overflow in all locales", "does this match the design", "/flutter-visual-proof". Arguments: screen ids, `--locales`, `--scales`, `--dark`, `--size`, `--all`. Skip for Unity projects, for anything that needs real device behavior (platform views, real network images, device safe areas, gestures), for performance, and for projects whose goal is a test suite (use the project's tests).
argument-hint: "[screen-id ...] [--locales en,de] [--scales 1.0,1.5] [--dark] [--size 390x844] [--all]"
user-invocable: true
allowed-tools: Bash Read Edit Write Glob Grep
paths: ["**/pubspec.yaml"]
---

# /flutter-visual-proof

Renders registered screens to PNG with `flutter test`, using the app's real fonts, icons, locales and themes. No simulator,
no emulator, no `flutter run`, no product build. You then Read the images. Invoking this skill is the user's approval to
add the render harness to the project (step 2) and to run it. It writes no assertions, so it is a render harness, not a
test suite; say that when you add it.

Harness files (copy verbatim): `${CLAUDE_PLUGIN_ROOT}/skills/flutter-visual-proof/assets/render.dart`, `screens.dart`
(the registry), `screens_test.dart`. Fixture recipes with verified/unverified status: `references/fixtures.md`.

Never edit `lib/` to make a screen renderable without saying what and getting a yes. Never commit images. Never start a
simulator, emulator, `flutter run` or a build.

## Step 1: Read state

In parallel: `pubspec.yaml` (is it Flutter; package `name:`; `environment: sdk:`; `flutter_localizations` present; `fonts:`), `git diff --name-only HEAD`
plus `git ls-files --others --exclude-standard` (changed files), `tool/visual/screens.dart` (registered ids and `sources`),
`docs/design.md`, `l10n.yaml` and `lib/l10n/*.arb`, `git check-ignore build/`.
Not a Flutter project: stop and say so. An `sdk:` lower bound below 3.0: stop and say the harness needs Dart 3 (it uses
records), because copying it in would break the project's `flutter analyze`. `build/` not ignored: add `/build/` to `.gitignore`.

## Step 2: Install the harness if missing

When `tool/visual/` does not exist: copy the three asset files into `tool/visual/`, then edit `screens.dart` only: add imports,
set `visualApp` to the app's `AppLocalizations.localizationsDelegates`, `supportedLocales` and real `ThemeData` (look for
`AppTheme` or `ThemeData` in `lib/`). If the app has no `flutter_localizations` or `l10n.yaml`, leave the defaults (English
only, no delegates); the harness itself needs only `flutter_test`. Tell the user what was added. Then propose entries for the screens in the diff (step 3), build each
fixture with `references/fixtures.md`, and add them.

## Step 3: Pick screens

From arguments first (screen ids; `--all` = every entry). Otherwise from the changed `lib/` files: a screen is selected when a
changed file is in its `sources`, or when a changed file is imported (one level, `grep -l "<changed file name>" lib -r`) by
a file in its `sources`. Report every changed file that is a screen or page widget without an entry as
"not rendered: no registry entry" and offer to add the entry; never skip silently. No changed screens: say so and stop.

## Step 4: Run (one file, filtered)

Locales: all supported ones at scale 1.0. Wide locales = the two with the largest total length of ARB string values
(none if there are no ARB files):

```bash
python3 - <<'PY'
import json, glob, os, re
d = 'lib/l10n'
if os.path.exists('l10n.yaml'):
    m = re.search(r'^arb-dir:\s*(\S+)', open('l10n.yaml').read(), re.M)
    if m: d = m.group(1)
sizes = []
for f in glob.glob(os.path.join(d, '*.arb')):
    arb = json.load(open(f)); base = os.path.basename(f)[:-4]
    locale = arb.get('@@locale') or (base.split('_', 1)[1] if '_' in base else '')
    if locale: sizes.append((sum(len(v) for k, v in arb.items() if not k.startswith('@') and isinstance(v, str)), locale))
print(','.join(l for _, l in sorted(sizes, reverse=True)[:2]))
PY
```

```bash
time flutter test tool/visual/screens_test.dart --dart-define=VP_SCREENS=<ids> --dart-define=VP_WIDE_LOCALES=<wide>
```

Options by `--dart-define`: `VP_LOCALES` (`all` or `en,pt_BR`), `VP_SCALES` (`1.0,1.5`), `VP_WIDE_SCALE` (1.5),
`VP_BRIGHTNESS` (`light`, `dark`, `both`; `--dark` = `both`), `VP_SIZE` (`390x844`), `VP_RATIO` (2). Run only this file,
never the project's whole test suite. Time it: when one run takes over 60 seconds, say so and treat further runs as heavy
under the heavy-commands rule (follow the asking level). A run that fails to compile: read the error,
fix the registry entry (not `lib/`), run again; after two diagnosed failures stop and report.

## Step 5: Read the results

`build/visual/latest/report.txt`, one line per item, fields separated by `|`:
`IMAGE|path|screen|locale|scale|brightness`, `ISSUE|screen|locale|scale|brightness|message` (layout exceptions, all of them,
not only the first, and a fixture that threw), `FONT|family|loaded|source` or `FONT|family|substituted|reason`, `NOTE|text`.
Read every `IMAGE` file with the Read tool. A layout issue or a fixture that throws never fails the run, so the report
is the only signal; each message is listed once per render, at most six. After the image is written the harness
unmounts the screen and runs the test clock 10 minutes, so a debounce or splash timer does not fail the run; a timer
longer than that still does (shorten it in the fixture).

## Step 6: Compare

Open the longest locales and the largest text scale first. Check against `docs/design.md` when it exists (colors, spacing,
type, components) and against the ui-ux-design rule (neutral borders, one accent per screen, sans-serif,
at most 3 font sizes). Look for: overflow stripes (yellow/black), clipped or ellipsized text, boxes instead of glyphs
(a missing font), empty areas where data should be, wrong theme in dark mode.

## Step 7: Before and after

Each run moves `build/visual/latest` to `build/visual/previous` first. To compare a change with the state before it, run
once before editing and once after (render, edit, render again; no stash needed), then Read the same file name from both folders.
A filtered run replaces `previous` with the last run's output, so say when `previous` holds different screens.

## Step 8: Report

Table or list, in this order: images looked at (paths); what each was compared against; layout issues with screen,
locale and scale; fonts substituted (from `FONT|...|substituted` lines and any family the app uses that the harness could
not load, such as `google_fonts`); screens not rendered and why; the render time. Tag anything a headless render cannot
show with "(unverified — needs a run on the simulator)": platform views, real network images, device safe areas and
notches, gestures, animations beyond the first 300 ms, plugin behavior. The images live under `build/visual/` and stay
uncommitted; the registry in `tool/visual/` is committed work: mention it as a change the user may commit.
