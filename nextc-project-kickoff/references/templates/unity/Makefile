# Unity project Makefile. The editor version is read from ProjectSettings/ProjectVersion.txt.
# Heavy targets (tests, builds) start the Unity editor in batch mode: close any open editor on this project first.
# Build targets call the same methods /unity-build calls: BuildScript.BuildAndroid and BuildScript.BuildIOS.
UNITY_VERSION := $(shell awk '/m_EditorVersion:/ {print $$2}' ProjectSettings/ProjectVersion.txt)
UNITY ?= /Applications/Unity/Hub/Editor/$(UNITY_VERSION)/Unity.app/Contents/MacOS/Unity
PROJECT := $(shell pwd)
APPNAME ?= __PRODUCT_NAME__
VERSION ?= 0.1.0
BUILD ?= 1

.PHONY: open test test-play build-android build-ios compile-check clean

open:
	open -a "Unity Hub"

# -quit is omitted from test targets on purpose: with -runTests it ends the editor before tests finish.
test:
	mkdir -p Logs
	$(UNITY) -batchmode -nographics -projectPath "$(PROJECT)" \
		-runTests -testPlatform EditMode \
		-testResults "$(PROJECT)/Logs/editmode-results.xml" \
		-logFile "$(PROJECT)/Logs/editmode.log"

test-play:
	mkdir -p Logs
	$(UNITY) -batchmode -nographics -projectPath "$(PROJECT)" \
		-runTests -testPlatform PlayMode \
		-testResults "$(PROJECT)/Logs/playmode-results.xml" \
		-logFile "$(PROJECT)/Logs/playmode.log"

compile-check:
	mkdir -p Logs
	$(UNITY) -batchmode -nographics -quit -projectPath "$(PROJECT)" \
		-logFile "$(PROJECT)/Logs/compile-check.log"

build-android:
	mkdir -p Builds/logs
	$(UNITY) -batchmode -quit -nographics -projectPath "$(PROJECT)" \
		-buildTarget Android \
		-executeMethod BuildScript.BuildAndroid \
		-logFile "$(PROJECT)/Builds/logs/android.log" \
		-appname "$(APPNAME)" -buildVersion "$(VERSION)" -buildNumber "$(BUILD)"

build-ios:
	mkdir -p Builds/logs
	$(UNITY) -batchmode -quit -nographics -projectPath "$(PROJECT)" \
		-buildTarget iOS \
		-executeMethod BuildScript.BuildIOS \
		-logFile "$(PROJECT)/Builds/logs/ios-unity.log"

clean:
	rm -rf Library Temp Obj Logs
