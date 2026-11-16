---
type: llm
focus: { source: file, path: docs/architecture.md }
---
PASS if the architecture document is specific to the Tidepool tide puzzle: the feature map ties each MVP feature (level play, tide simulation, barrier placement, level set, progress, settings) to concrete scenes, systems, ScriptableObject or data types, and services; it states how the tide simulation stays deterministic across devices (fixed step or integer grid logic) or lists that as an open question; it describes level data and saved star progress as data; it states a 2D portrait phone target with a 60 fps budget; and every package or module in the Dependencies section has a reason tied to a feature.
FAIL if it reads as a generic Unity architecture that would fit any game, if it adds networking, ads or a level editor (non-goals), or if features lack concrete systems and data.
