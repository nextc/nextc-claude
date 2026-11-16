# Intake

One batched question set at the start of a run. In an interactive run, ask everything missing in a
single AskUserQuestion call (up to four questions; group the rest into an "anything else" free-text
question). In a `--auto` run, take answers from `$ARGUMENTS` and the prompt, fill gaps with the
defaults below, and record every default with `state.mjs assume "<text>"`.

Read before asking: `docs/proposal.md`, `aso/intake.json` from a previous run, and any
`aso/config/app_brief.yaml` or `aso/config/app-marketing-context.md` left by the old pipeline. Show
what you found and ask only for what is missing or stale.

## Questions

| # | Ask | Default under `--auto` |
|---|---|---|
| 1 | **App identity** — App Store id or bundle id; Play package; is the app live? Brand name; seller name | Pre-launch, no ids |
| 2 | **Scope** — storefront countries (two-letter) and locales | `us` / `en-US` |
| 3 | **Decision this run serves** — launch, update, rename, localization, rating problem | `launch` if not live, else `update` |
| 4 | **Competitors** — names or store ids (3–8) | Top results of the seed terms |
| 5 | **Data access available now** — App Store Connect key (path or env var name + key id + issuer id), Play service-account key (path or env var name), a connected keyword-data tool, a Play search export | None |
| 6 | **Constraints** — words that must not appear, title policy (brand only / brand + keyword / keyword first), positioning to keep | Brand + keyword; none |

Never ask the user to paste a key. If they paste one anyway, do not repeat it, do not write it
anywhere, and tell them to rotate it.

## `aso/intake.json`

```json
{
  "app": { "name": "Nestly", "iosId": null, "bundleId": "com.example.nestly", "playPackage": null, "live": false, "seller": null },
  "countries": ["us", "gb"],
  "locales": ["en-US", "en-GB"],
  "decision": "launch",
  "competitors": ["Co-Star", "The Pattern"],
  "access": { "appStoreConnect": false, "googlePlay": false, "keywordProvider": null, "playSearchExport": null },
  "constraints": { "titlePolicy": "brand_plus_keyword", "forbiddenWords": ["CRM"], "keep": [] },
  "seedTerms": ["friendship journal", "relationship app"],
  "recordedAt": "<from state.mjs show>"
}
```

## Mapping old project files

Projects that ran the previous pipeline have `aso/config/app_brief.yaml`, `aso/outputs/*.md` and
`aso/handoffs/`. Read the brief for identity, competitors and constraints. Do not carry forward any
keyword tier, volume or "uncontested" label from `aso/outputs/`: those were estimates. Leave the old
files in place; the new outputs do not overwrite them.
