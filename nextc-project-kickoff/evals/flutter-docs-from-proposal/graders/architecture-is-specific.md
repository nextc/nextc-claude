---
type: llm
focus: { source: file, path: docs/architecture.md }
---
PASS if the architecture document is specific to a shared plant-care app: its feature map ties each MVP feature (adding a plant, watering schedule, today list, care history, households, reminders) to concrete screens or view models, repositories or services and entities; it explains why each listed dependency is needed by naming a feature; it states how marking a plant watered works offline and how two people's edits to the same plant are reconciled or lists that as an open question; and it names a backend decision with a reason (or records it as an assumption).
FAIL if it reads as a generic Flutter architecture template that would be the same for any app, if features are only listed without screens, data and services, or if dependencies are listed without reasons.
