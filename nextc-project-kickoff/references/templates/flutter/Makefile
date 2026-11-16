# Flutter project Makefile. config/app_config.json holds NON-secret runtime config only:
# everything passed to --dart-define-from-file is embedded in the shipped binary.
# Release builds are normally made with /flutter-build; these targets are for quick local use.
DEFINES := --dart-define-from-file=config/app_config.json

.PHONY: run analyze format test gen watch l10n build-apk build-aab clean

run:
	flutter run $(DEFINES)

analyze:
	flutter analyze

format:
	dart format .

test:
	flutter test

# Keep gen/watch only when build_runner is a dev dependency.
gen:
	dart run build_runner build --delete-conflicting-outputs

watch:
	dart run build_runner watch --delete-conflicting-outputs

# Keep l10n only when localization is enabled.
l10n:
	flutter gen-l10n

build-apk:
	flutter build apk --release $(DEFINES) --obfuscate --split-debug-info=build/debug-info

build-aab:
	flutter build appbundle --release $(DEFINES) --obfuscate --split-debug-info=build/debug-info

clean:
	flutter clean
