---
type: regex
target: { source: file, path: docs/architecture.md }
pattern: "BuildScript\\.BuildAndroid[\\s\\S]*BuildScript\\.BuildIOS|BuildScript\\.BuildIOS[\\s\\S]*BuildScript\\.BuildAndroid"
---
The build section names the two BuildScript methods /unity-build calls.
