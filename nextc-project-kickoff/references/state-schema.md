# .kickoff/state.json (schema_version 1)

Written only by `scripts/kickoff-state.mjs` (atomic write, validated on every write, timestamps from the system clock). Legacy `.flutter-kickoff/decisions.json` and `.unity-kickoff/decisions.json` are read and converted by `kickoff-state.mjs migrate --kind <kind>`; the legacy file is left in place.

```json
{
  "schema_version": 1,
  "kind": "flutter | unity",
  "created_at": "ISO-8601", "updated_at": "ISO-8601",
  "mode": { "auto": false, "docs_only": false },
  "proposal": { "path": "docs/proposal.md", "format": "decision-memo | long | none" },
  "identity": { "product_name": "", "slug": "", "org": "com.acme", "app_id": "com.acme.nestly", "platforms": ["android", "ios"] },
  "decisions": {
    "<key>": { "value": "any JSON", "source": "user | proposal | default | auto", "note": "why", "at": "ISO-8601" }
  },
  "assumptions": [ { "key": "", "value": null, "reason": "", "at": "ISO-8601" } ],
  "options": { "commit": false, "verify": "analyze", "install_dart_flutter": false, "ios_signing_team": null },
  "dependencies": [ { "name": "go_router", "reason": "", "feature_ids": ["F1"], "dev": false } ],
  "steps": { "<step id>": { "status": "pending | running | done | failed | skipped", "started_at": "", "finished_at": "", "evidence": "", "error": "", "log": "" } }
}
```

- `identity.slug`: Dart package name (Flutter) or PascalCase project name (Unity). `app_id`: the one identifier stamped on every platform. Unity also has `company_name`.
- `assumptions`: every decision taken without the user (`--auto`, or `default`/`auto` source while `mode.auto` is true), with the reason. The final report lists them.
- Step ids, in order. Flutter: `preflight extract intake create identity deps verify-static docs-architecture docs-tasks docs-support agent-files ios-signing coverage commit report`. Unity: `preflight extract intake scaffold-files editor-run docs-architecture docs-tasks docs-support agent-files coverage commit report`.
- `next` returns the first step that is `pending`, `running` or `failed` (a step left `running` means the last run stopped inside it).
- Decision keys used by the guides — Flutter: `platforms`, `backend`, `auth`, `local_storage`, `state_management`, `routing`, `monetization`, `analytics`, `l10n`, `target_dir`. Unity: `editor_version`, `target_devices`, `render_pipeline`, `dimension`, `input`, `ui`, `networking`, `di`, `audio`, `save`, `analytics`, `lfs`, `target_dir`. Keys are not enforced beyond `source`; docs refer to them by name.
- The file lives under `.kickoff/`, which the generated `.gitignore` excludes (state and logs are working files, not product).
