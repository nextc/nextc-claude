# Company rollout kit (optional, advisory)

Templates and guidance an admin MAY adopt to roll nextc-claude out across a company. Nothing here is enforced, installed, or switched on by the plugins. The folder is not read by any plugin, skill, hook, or script; if you ignore it, plugin behavior is unchanged for everyone.

Every settings key in the JSON templates was checked against the official docs on 2026-10-15 (sources per section). JSON cannot hold comments, so all caveats are in this file. Replace every `your-org`, `example.com`, and placeholder before use. Deliver the files via server-managed settings (claude.ai admin console), MDM, or `managed-settings.json` at `/Library/Application Support/ClaudeCode/` (macOS), `/etc/claude-code/` (Linux/WSL), or `C:\Program Files\ClaudeCode\` (Windows) ([managed-settings](https://code.claude.com/docs/en/managed-settings)).

| File | Purpose |
|---|---|
| `managed-settings.example.json` | Distribution only: register marketplace, enable plugins |
| `managed-settings.policy.example.json` | Stricter policy layer (only if you want enforcement) |
| `otel-env.example.json` | OpenTelemetry env block |
| `ci/validate-plugins.example.yml` | PR validation for a fork of this marketplace |
| `ci/claude-code-action.example.yml` | Claude Code in CI with these plugins installed |

## 1. Distribution

**Template:** `managed-settings.example.json`. **What it does:** `extraKnownMarketplaces` registers the marketplace on each machine; `enabledPlugins` (`plugin@marketplace`) force-installs and enables plugins; `autoUpdate` sets background update policy for that marketplace. **When you might want it:** you want nextc-core and nextc-ecc present for everyone without per-developer install steps. **Trade-offs:** force-enabled plugins cannot be disabled by users (managed settings win); nextc-ecc ships hooks, which run with the user's privileges, so review them first (section 7). Domain plugins (flutter, unity, aso, product) are better enabled per repository in that repo's `.claude/settings.json`; repository `extraKnownMarketplaces` apply only after the folder is trusted. Source: [plugins/org](https://code.claude.com/docs/en/plugins/org).

Notes:
- Use your own fork or mirror (`your-org/nextc-claude`) so you control what ships. Registering the upstream `nextc/nextc-claude` directly also works.
- Managed `enabledPlugins` set to `false` blocks a plugin at every scope.
- By default only one managed source applies on a machine (server-managed first, then MDM, then file). `managedSourcesBehavior: "merge"` applies all (verified in the same page; not in the templates).
- The template sets `autoUpdate: false`, which keeps users on what they have and makes the update a deliberate admin action. `true` refreshes in the background. If the managed entry sets the field, users cannot toggle it.

**Pinning and channels** ([host-marketplace](https://code.claude.com/docs/en/plugins/host-marketplace)):
- Users can pin a marketplace to a branch or tag with `owner/repo#<ref>` on `claude plugin marketplace add`.
- A plugin entry's `source` accepts `ref` (branch/tag) and `sha` (commit) for `github`, `url`, and `git-subdir` sources.
- The `github` source in `extraKnownMarketplaces` and `strictKnownMarketplaces` accepts an optional `ref` (allowlist entries must match `ref` exactly or be absent on both sides).
- Updates reach users only when a plugin's computed `version` changes; this repo bumps all plugin versions together on release. Release tags are not verified to exist in this repo this session (unverified, check `git tag`); use whichever tag or branch you actually cut.
- Channels: Claude Code has no channel concept. Host two marketplaces with different `name` values pointing at different refs (for example `nextc-stable` and `nextc-latest`) and give each user group the matching entry. Server-managed settings cannot target groups; use separate endpoint-managed files or a gateway policy.
- The default install path in the root README tells users to run `marketplace update` and reinstall by hand. `claude plugin update <plugin>@<marketplace>` is documented as the shell update command; that wording in the root README was not changed here.

## 2. Policy layer (only if your org wants enforcement)

**Template:** `managed-settings.policy.example.json`. Everything in this section is optional and goes beyond distribution. Each control reduces developer freedom; adopt individually and delete what you do not want. Source: [managed-settings](https://code.claude.com/docs/en/managed-settings), [plugins/org](https://code.claude.com/docs/en/plugins/org), [managed-mcp](https://code.claude.com/docs/en/managed-mcp), [sandboxing](https://code.claude.com/docs/en/sandboxing), [permission-modes](https://code.claude.com/docs/en/permission-modes), [security](https://code.claude.com/docs/en/security).

| Key in template | Effect | Trade-off |
|---|---|---|
| `permissions.deny` | Blocks matching tool calls (examples: `.env`/secrets reads, force push, `rm -rf`) | Deny rules match the command text as written, so a rewritten command can slip past; pair with the sandbox. The Bash patterns in the template use the documented `Bash(cmd *)` form; test them on one machine first |
| `permissions.disableBypassPermissionsMode: "disable"` | Nobody can enter `bypassPermissions` mode | Blocks a mode some automation uses |
| `allowManagedPermissionRulesOnly` | Only managed permission rules apply; users' own allow rules in user/project/local files and `--allowedTools` are ignored | Developers lose their personal allowlists, causing more prompts |
| `sandbox.enabled` / `failIfUnavailable` / `allowUnsandboxedCommands: false` | OS-level filesystem and network isolation for Bash; refuse to start if the sandbox cannot; forbid the unsandboxed retry | Runs on macOS, Linux, WSL2 only (native Windows runs unsandboxed, so `failIfUnavailable` would stop sessions there). Covers shell commands only; file tools, MCP servers, and hooks run outside it. Some tools need `sandbox.filesystem.allowWrite` or `network.allowedDomains` additions |
| `strictKnownMarketplaces` | Allowlist of marketplace sources (`your-org/*` wildcard needs Claude Code v2.1.223+; alias `allowedMarketplaces` needs v2.1.232+). `[]` blocks everything incl. the official marketplace | Installed plugins from non-allowed sources stop loading. The `skills-dir` entry keeps skills-directory plugins loading. Does not register anything; `extraKnownMarketplaces` does that, and must itself pass the allowlist. Add `{ "source": "github", "repo": "anthropics/claude-plugins-official" }` if you want the official marketplace |
| `disableSideloadFlags` | Rejects `--plugin-dir`, `--plugin-url`, `--agents`, SDK `plugins`, non-SDK `--mcp-config` | Plugin authors on your team cannot test locally with those flags. It does not restrict `.mcp.json` or `claude mcp add`; hence the MCP lock below |
| `allowManagedMcpServersOnly` + `allowedMcpServers` | Only the managed MCP allowlist applies (needs v2.1.273+ to read the lock across sources). Entries match by `serverUrl`, `serverCommand`, or `serverName` | The placeholder `https://mcp.example.com/*` allows only that host. Plugin-provided servers (for example Context7 shipped by a plugin) are also checked, so add the entries you actually approve. `serverName` is not a security control. `allowManagedMcpServersOnly` is separate from `allowManagedPermissionRulesOnly` |

Not in the template (valid keys, bigger trade-offs): `permissions.disableAutoMode: "disable"` (removes auto mode; the permission-modes page documents `permissions.disableAutoMode`, the settings page lists a top-level `disableAutoMode`, so check which your version reads), `allowManagedHooksOnly` (restricts which hooks run; the docs state it does not trust hooks from plugins users enable themselves, so test before combining with nextc-ecc), `strictPluginOnlyCustomization`, `blockedMarketplaces`, `availableModels` (section 4).

Validate on one machine first: run `/status` and look for `Enterprise managed settings` in the `Setting sources` line. A managed file that is not valid JSON stops Claude Code from starting.

## 3. Observability

**Template:** `otel-env.example.json` (merge its `env` block into your managed settings). **What it does:** turns on OpenTelemetry metrics and events to your collector. `OTEL_LOG_TOOL_DETAILS=1` makes tool, MCP, and third-party plugin/skill names appear unredacted, so nextc skills show up by name in `plugin_installed`/`plugin_loaded` events and tool events. `OTEL_RESOURCE_ATTRIBUTES` tags team/department (values cannot contain spaces). **When you might want it:** you need usage and cost visibility or want to know which nextc skills people actually use. **Trade-offs:** tool details can include Bash commands and tool arguments, so treat the backend as sensitive. Prompt logging (`OTEL_LOG_USER_PROMPTS`) is deliberately left unset (default disabled); `OTEL_LOG_RAW_API_BODIES` also stays off, since bodies include the entire conversation. `OTEL_EXPORTER_OTLP_PROTOCOL` has no default and must be set. Claude Code ignores `OTEL_*` exporter variables in a repository's `.claude/settings.json`, so set them in managed settings, your shell, or user settings. The `tool-awareness` hook in nextc-ecc writes to stderr only; it is UX, not an audit log. Source: [monitoring-usage](https://code.claude.com/docs/en/monitoring-usage), [plugins/org](https://code.claude.com/docs/en/plugins/org#audit-and-review), [managed-mcp](https://code.claude.com/docs/en/managed-mcp#monitor-mcp-usage).

## 4. Cost

Guidance only (no template needed). Source: [costs](https://code.claude.com/docs/en/costs).
- The docs state an enterprise average of about $13 per developer per active day and $150-250 per developer per month, below $30 per active day for 90% of users. Pilot with a small group to get your own baseline.
- Teams/Enterprise: usage draws on a per-seat allowance; cap extra spend by turning on usage credits and setting limits at organization, group, or member level in the admin console. Console (API) orgs use workspace spend limits and the TPM/RPM per-user table on the costs page.
- `modelPricing` (managed setting, v2.1.242+) makes reported costs match contracted rates; it changes reporting, not billing.
- `availableModels` (array of model aliases or IDs, managed to enforce) restricts selectable models, for example `["sonnet", "haiku"]` as in the settings docs. Which aliases cover this repo's fable/opus agents was not verified, so it is not in the template. Note that restricting models affects agents that pin `model:`; test your pipelines.
- Agent teams: disabled by default, enabled with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. The docs say teams use approximately 7x more tokens than standard sessions when teammates run in plan mode, and recommend Sonnet teammates and small teams. This repo's `/team-feature-dev` and `/idea-explore` fan out many agents, and `idea-explore` also uses a fable-tier synthesizer, so expect higher spend on those.

## 5. Data and MCP policy

- Use organization accounts (Team/Enterprise or API) rather than personal ones. The security docs say Commercial Terms apply to Team, Enterprise, and API users and Consumer Terms to Free, Pro, and Max; retention and training terms depend on that plan, so confirm with your contract and the [Privacy Center](https://privacy.anthropic.com/en/articles/10023548-how-long-do-you-store-my-data) ([security](https://code.claude.com/docs/en/security)).
- MCP servers are not security-audited by Anthropic. Cloud-backed MCP servers (Supabase, Stripe, Appwrite, Context7, claude.ai connectors) receive whatever Claude sends them, which can include repo contents and queries. Restrict with `allowedMcpServers`, `deniedMcpServers`, `managed-mcp.json` (fixed set, cannot be delivered via server-managed settings), or `managedMcpServers` ([managed-mcp](https://code.claude.com/docs/en/managed-mcp)).
- Onboarding note for developers: the Context7 MCP server may expose only an `authenticate` tool until you complete its auth flow; run `/mcp` and authenticate it there.

## 6. CI examples

Both files are `.example.yml` and live outside `.github/workflows`, so nothing runs unless you copy them.
- `ci/validate-plugins.example.yml`: runs `node nextc-claude-toolbox/scripts/validate.js` and `claude plugin validate` on the marketplace and each plugin, without `--strict` because the marketplace currently carries two accepted warnings (see the file's comment). `claude plugin validate <path> [--strict] [--json]` is documented at [cli-reference](https://code.claude.com/docs/en/plugins/cli-reference) (exit 0/1/2). The file marks the CLI install package name as unverified.
- `ci/claude-code-action.example.yml`: `anthropics/claude-code-action@v1` with `plugin_marketplaces`, `plugins`, `prompt`, and `claude_args` (`--max-turns`). Plugin names use `plugin@marketplace` with the marketplace name from its manifest. The default Claude GitHub App holds a broad permission set; the docs describe a custom app limited to Contents, Issues, and Pull requests, and workload identity federation (`anthropic_federation_rule_id`, `anthropic_organization_id`, optional `anthropic_service_account_id` and `anthropic_workspace_id`, plus `id-token: write`) to avoid a long-lived key. Pin the action to a commit SHA per your own policy (docs examples use `@v1`). Source: [github-actions](https://code.claude.com/docs/en/github-actions).

## 7. Third-party marketplace review checklist

This repo depends on third-party marketplaces (see the root README). Plugins can run hooks, monitors, MCP servers, and executables with the user's privileges, outside the sandbox. Before allowlisting one ([plugins/security](https://code.claude.com/docs/en/plugins/security), not fetched this session; checklist items follow `plugins/org` and general practice):
- [ ] Owner and repository are known; prefer forking into your org and allowlisting `your-org/*`.
- [ ] Pin `ref` or `sha`; do not follow a moving default branch.
- [ ] Read `hooks/hooks.json`, `.mcp.json`, any `bin/` directory, and every hook script.
- [ ] List MCP servers and the data they would receive.
- [ ] Check for network calls and `npx`/remote code at runtime. nextc-ecc's hooks run local `node` scripts and fetch nothing.
- [ ] Re-review on every version bump you accept.
- [ ] Record the approval and the pinned ref.

## 8. What this repo's rules and hooks are

The rules in `rules/nextc-claude/` and the hooks in nextc-ecc are advisory guard-rails for cooperative developers, not security controls. Rules are text the model is asked to follow and are symlinked to a mutable clone by `setup-rules.sh`. Hooks can be switched off by environment variables in the developer's shell (for example `FACT_FORCE_GUARD=off`, `PRECOMMIT_QUALITY=off`, `SKIP_VALIDATE=1` for the repo git hook). The destructive-command check is pattern-based. If you need guarantees, use the managed policy layer in section 2 and branch protection/rulesets in your git host. Some rules (for example no-auto-branch, no-auto-commit) are one person's workflow preferences and may conflict with a PR-based company flow; decide which rules your company adopts before distributing them.
