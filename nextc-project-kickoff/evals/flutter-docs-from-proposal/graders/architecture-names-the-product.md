---
type: regex
target: { source: file, path: docs/architecture.md }
pattern: "^(?=[\\s\\S]*\\bPlant\\b)(?=[\\s\\S]*\\bHousehold\\b)(?=[\\s\\S]*(CareEvent|Care event|WateringEvent|Watering event))"
---
The architecture file names the product's entities (Plant, Household, a care/watering event).
