---
type: regex
target: { source: file, path: .kickoff/state.json }
pattern: "^(?=[\\s\\S]*\"name\": \"go_router\")(?=[\\s\\S]*\"name\": \"drift\")(?=[\\s\\S]*\"name\": \"freezed\")(?=[\\s\\S]*\"name\": \"flutter_local_notifications\")"
---
The planned dependency list in state holds the packages the user chose.
