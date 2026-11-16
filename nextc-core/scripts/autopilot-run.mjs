#!/usr/bin/env node
// Starts (or resumes) an approved autopilot run, and the small commands around it. The user runs
// this from a terminal: it starts `claude` with every permission check off, which no agent should
// do on its own.
//
//   node autopilot-run.mjs <run-id> [--model opus] [--max-budget-usd N] [--dry-run]
//   node autopilot-run.mjs status <run-id>              the run's status.json, one line
//   node autopilot-run.mjs estimate --build-steps N [--margin 1.5]
//                                                       budget proposal from earlier runs
//   node autopilot-run.mjs sandbox-check <repo> [--verify "<cmd>" …] [--excluded "<pattern>" …]
//                                                       excluded commands a plan needs, and what each exposes
//   node autopilot-run.mjs relocate <run-id> <new-repo-path>
//                                                       after the source repo was moved or renamed
//   node autopilot-run.mjs clean [--yes]                list (or, with --yes, delete) finished clones and transcripts
//
// Containment, in layers:
//   - The run works in a local clone with its own .git, so nothing it does to git reaches the
//     user's checkout. The branch is fetched back into the source repo when the run ends.
//   - The OS sandbox confines every shell command and its child processes to the clone, and its
//     network allowlist is the plan's host list.
//   - A guard hook confines the file tools (they run outside the sandbox) to the clone, and
//     parses each shell command to block push, store uploads, publishing and live-service
//     commands, and a deploy step's commands until its compatibility check passed.
//   - Deny rules back up the hook; removed tools take away MCP, web access and outward tools.
//   - Everything the run must not change (approved config, settings, STOP file, counters) lives in
//     ~/.claude/autopilot/<run-id>/, which neither the sandbox nor the guard lets it write.
//   - The launcher's own git commands in the clone run with hooks, fsmonitor and pager disabled,
//     after restoring .git/config if the run changed it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  launchCost, costLine, writeCostLine, commitRunRecords, estimateFromTranscript, budgetLeft, launchSpend,
  safeGitArgs, proposeBudget, createTracker, statusSnapshot, statusLine, MIN_LAUNCH_USD,
} from './autopilot-cost.mjs';
import { formatLedgerEntry, nextLedgerNumber, readDeciderCount, DEFAULT_DECIDER_CAP, TERMINAL, checkCommand } from './autopilot-hooks.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PLUGIN_ROOT = path.dirname(HERE);
export const STATE_ROOT = path.join(os.homedir(), '.claude', 'autopilot');
// MAGIC: 2.1.295 is the first version with hook `onFailure: "block"`; without it a crashed guard
// lets the action through. It also covers the Agent tool's per-call `effort` (2.1.292),
// --permission-prompts (2.1.259) and --append-subagent-system-prompt-file (2.1.261).
export const MIN_CLAUDE = [2, 1, 295];
// MAGIC: how long `claude -p` keeps waiting for background work after its last turn. The default
// (10 minutes) killed workers mid-step in three real runs; workers now run in the foreground, so
// this only bounds a background task that slips through. 60 minutes, not 0, so a hung task can't
// hold the run forever.
export const BG_WAIT_CEILING_MS = 60 * 60 * 1000;
// MAGIC: foreground Bash commands get 10 minutes before they move to the background, enough for a
// Flutter or Go test suite; the 2-minute default moved builds to the background mid-step.
export const BASH_DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

// SECURITY: the guard hook parses each Bash command and blocks outward actions wherever they
// appear in it. These prefix rules are a second layer that holds even if the hook can't run. They
// match only at the start of a command, so they never block an argument such as `git log --grep=push`.
const DENY_RULES = [
  'git push', 'gh pr', 'gh api', 'gh release', 'gh repo', 'gh auth', 'gh workflow', 'gh secret', 'gh gist',
  'fastlane pilot', 'fastlane deliver', 'fastlane supply', 'xcrun altool', 'xcrun notarytool', 'eas submit', 'eas update',
  'npm publish', 'pnpm publish', 'yarn publish', 'yarn npm publish', 'bun publish', 'cargo publish',
  'dart pub publish', 'flutter pub publish', 'twine upload', 'gem push', 'pod trunk push', 'docker push',
  'firebase deploy', 'wrangler deploy', 'wrangler publish', 'supabase db push', 'supabase functions deploy',
  'appwrite push', 'appwrite deploy', 'vercel deploy', 'netlify deploy', 'fly deploy', 'flyctl deploy',
];
// Tools that act outside the sandbox or outlive a turn: web access, publishing, messages to other
// sessions or devices, scheduling, worktrees, background watchers, questions.
export const REMOVED_TOOLS = [
  'AskUserQuestion', 'EnterPlanMode', 'ExitPlanMode', 'WebFetch', 'WebSearch', 'RemoteTrigger', 'CronCreate', 'CronDelete',
  'ScheduleWakeup', 'Monitor', 'Workflow', 'PushNotification', 'SendToProject', 'SendToProjectContext', 'SendUserFile',
  'SendFeedback', 'ShareOnboardingGuide', 'DesignSync', 'EnterWorktree', 'ExitWorktree',
  'Artifact', 'ArtifactData', 'ArtifactComments', 'mcp__*',
];
// SECURITY: credentials stay out of the run unless the plan names them in passEnv. AUTH matches
// only as a whole segment, so GIT_AUTHOR_NAME and GIT_AUTHOR_EMAIL pass through.
export const SECRET_ENV = /TOKEN|SECRET|PASSW|PASSPHRASE|CREDENTIAL|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY|(^|_)KEY$|(^|_)AUTH($|_)|COOKIE|SESSION|(^|_)DSN$|DATABASE_URL|CONNECTION_STRING|^AWS_|^GH_|^GITHUB_|^NPM_|^SSH_|^STRIPE_|^SUPABASE_|^FIREBASE_|^SENTRY_|^APPWRITE_|^GOOGLE_APPLICATION_CREDENTIALS$|^GCLOUD_|^CLOUDSDK_|^AZURE_|^HEROKU_|^VERCEL_|^NETLIFY_|^CLOUDFLARE_|^CF_|^FASTLANE_|^MATCH_|^APP_STORE_CONNECT_|^ASC_|^SLACK_|^TWILIO_|^SENDGRID_|^MAILGUN_|^OPENAI_|^PG(PASSWORD|USER)$|^MYSQL_PWD$|^REDIS_URL$|^MONGO/i;
const CLAUDE_AUTH_ENV = /^(ANTHROPIC_|CLAUDE_CODE_OAUTH)/;
export const SECRET_FILES = [
  '~/.ssh', '~/.aws', '~/.config/gh', '~/.netrc', '~/.docker/config.json', '~/.kube', '~/.gnupg', '~/.git-credentials', '~/.config/git/credentials',
  '~/.npmrc', '~/.yarnrc.yml', '~/.pypirc', '~/.gem/credentials', '~/.cargo/credentials', '~/.cargo/credentials.toml',
  '~/.pub-cache/credentials.json', '~/.config/dart/pub-credentials.json', '~/Library/Application Support/dart/pub-credentials.json',
  '~/.appwrite', '~/.config/gcloud', '~/.config/firebase', '~/.config/configstore', '~/.config/stripe', '~/.supabase',
  '~/.wrangler', '~/.config/.wrangler', '~/.fly', '~/.azure', '~/.terraform.d/credentials.tfrc.json', '~/.m2/settings.xml',
  '~/.fastlane', '~/Library/Keychains',
];

// ---------------------------------------------------------------------------------------------
// Pure decisions (unit-tested)

const BOOLEAN_FLAGS = new Set(['dry-run', 'yes']);
const REPEATABLE = new Set(['verify', 'excluded']);

export function parseArgs(argv) {
  const args = { positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { args.positional.push(a); continue; }
    const key = a.slice(2);
    if (BOOLEAN_FLAGS.has(key)) { args[key] = true; continue; }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) throw new Error(`--${key} needs a value`);
    if (REPEATABLE.has(key)) (args[key] ??= []).push(next); else args[key] = next;
    i++;
  }
  return args;
}

// Where the source repo and the clone are now. approved.json may hold `clone` relative to the
// source repo (current plan mode) or absolute (older runs); a moved or renamed repo is reported
// with the command that fixes it.
export function resolveRunPaths(approved, runId, exists = fs.existsSync) {
  const source = approved.sourceRepo;
  if (!source || !path.isAbsolute(source)) throw new Error(`approved.json has no absolute sourceRepo for run ${runId}.`);
  const rel = path.isAbsolute(approved.clone ?? '') ? path.relative(source, approved.clone) : (approved.clone ?? path.join('.claude', 'autopilot-runs', runId));
  if (!exists(source)) {
    throw new Error(`the source repo ${source} no longer exists. If it was moved or renamed, run:\n  node "${fileURLToPath(import.meta.url)}" relocate ${runId} <new-repo-path>`);
  }
  if (rel.startsWith('..')) {
    if (exists(approved.clone)) return { sourceRepo: source, clone: approved.clone };
    throw new Error(`the clone ${approved.clone} is outside ${source} and no longer exists.`);
  }
  const clone = path.join(source, rel);
  if (!exists(clone)) throw new Error(`the clone ${clone} no longer exists (was it cleaned?). The run can't resume without it.`);
  return { sourceRepo: source, clone };
}

// User-scope plugins are enabled in ~/.claude/settings.json, which the run doesn't load, so each
// one is passed with --plugin-dir. The autopilot skill and hooks always come from this copy of
// nextc-core, whatever version is installed.
// EXTERNAL: reads Claude Code's ~/.claude/plugins/installed_plugins.json layout.
export function selectPluginDirs({ enabled, installed, pluginRoot, exists = fs.existsSync }) {
  const dirs = [];
  for (const [id, on] of Object.entries(enabled ?? {})) {
    const entries = Array.isArray(installed?.[id]) ? installed[id] : [];
    const entry = entries.find((e) => e?.scope === 'user') ?? entries[0];
    if (on && entry?.installPath && exists(entry.installPath)) dirs.push(entry.installPath);
  }
  return [...new Set([pluginRoot, ...dirs.filter((d) => !d.includes(`${path.sep}nextc-core${path.sep}`) && !d.endsWith(`${path.sep}nextc-core`))])];
}

// The deny rules, minus any that would block a gated deploy step's own recorded command.
export function denyRules(approved) {
  const deployCmds = (approved.deploys ?? []).flatMap((d) => d.commands ?? []);
  return DENY_RULES.filter((r) => !deployCmds.some((c) => c === r || c.startsWith(`${r} `))).map((r) => `Bash(${r}*)`);
}

export function buildSettings({ approved, hooksScript, authVars }) {
  return {
    sandbox: {
      enabled: true,
      allowUnsandboxedCommands: false,
      failIfUnavailable: true,
      network: { allowedDomains: approved.allowedDomains ?? [], ...(approved.allowLocalBinding ? { allowLocalBinding: true } : {}) },
      excludedCommands: approved.excludedCommands ?? [],
      credentials: {
        files: SECRET_FILES.map((p) => ({ path: p, mode: 'deny' })),
        envVars: authVars.map((name) => ({ name, mode: 'deny' })),
      },
    },
    permissions: { deny: denyRules(approved) },
    // SECURITY: the guard is the only check on file-tool paths; onFailure keeps a crash from
    // letting the write through.
    hooks: {
      PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: `node "${hooksScript}" guard`, onFailure: 'block' }] }],
      Stop: [{ matcher: '', hooks: [{ type: 'command', command: `node "${hooksScript}" stop` }] }],
    },
  };
}

export function buildEnv({ approved, processEnv, stateDir, runDir, clone }) {
  // EXTERNAL: the sandbox lets commands write only inside the clone, so the user's TMPDIR (under
  // /var/folders) makes mktemp fail. A failed mktemp left a worker's "dry run" deploy in the clone.
  const tmp = path.join(clone, '.autopilot-tmp');
  const pass = new Set(approved.passEnv ?? []);
  const env = {};
  for (const [k, v] of Object.entries(processEnv)) {
    if (CLAUDE_AUTH_ENV.test(k) || pass.has(k) || !SECRET_ENV.test(k)) env[k] = v;
  }
  return {
    ...env,
    AUTOPILOT_RUN_DIR: runDir,
    AUTOPILOT_ROOT: clone,
    AUTOPILOT_STATE_DIR: stateDir,
    AUTOPILOT_HOOKS: path.join(HERE, 'autopilot-hooks.mjs'),
    TMPDIR: tmp,
    TMP: tmp,
    TEMP: tmp,
    // EXTERNAL: see BG_WAIT_CEILING_MS and BASH_DEFAULT_TIMEOUT_MS above (code.claude.com/docs/en/headless).
    CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: String(approved.bgWaitCeilingMs ?? BG_WAIT_CEILING_MS),
    BASH_DEFAULT_TIMEOUT_MS: String(BASH_DEFAULT_TIMEOUT_MS),
    // EXTERNAL: turns off nextc-ecc's fact-force-guard hook. It asks for the user's verbatim
    // go-ahead before destructive commands; nobody can give one here, and the sandbox already
    // confines those commands to the clone.
    FACT_FORCE_GUARD: 'off',
  };
}

export function buildClaudeArgs({ runId, model, settingsPath, bundlePath, pluginDirs, budgetUsd }) {
  return [
    '-p', `/nextc-core:autopilot run docs/autopilot/${runId}`,
    '--model', model,
    '--permission-mode', 'bypassPermissions',
    // EXTERNAL: a prompt with nobody to answer it is denied instead of hanging the run.
    '--permission-prompts', 'none',
    // EXTERNAL: user settings are left out because their ask rules can't be removed by --settings
    // (permission lists merge across scopes), and with nobody to answer they would deny commands.
    '--setting-sources', 'project,local',
    '--settings', settingsPath,
    '--strict-mcp-config',
    '--append-system-prompt-file', bundlePath,
    '--append-subagent-system-prompt-file', bundlePath,
    '--output-format', 'stream-json', '--verbose',
    ...pluginDirs.flatMap((d) => ['--plugin-dir', d]),
    '--max-budget-usd', budgetUsd.toFixed(2),
    '--disallowedTools', ...REMOVED_TOOLS,
  ];
}

// The run's total budget and what this launch may spend. Throws when the run has none or nothing is left.
export function launchBudget({ approvedTotal, override, launches }) {
  const total = Number(override ?? approvedTotal);
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error('this run has no budget. Plan mode records maxBudgetUsd in approved.json; to set one yourself, pass --max-budget-usd <total for the whole run>.');
  }
  const left = budgetLeft(total, launches);
  if (left.remaining < MIN_LAUNCH_USD) {
    throw new Error(`the run's budget is used up: $${left.spent.toFixed(2)} of $${total.toFixed(2)} spent over ${launches.length} launch(es)${left.estimated ? ` (${left.estimated} estimated)` : ''}. To continue, pass --max-budget-usd with a larger total for the whole run.`);
  }
  return { total, ...left };
}

// Fills in the cost of earlier launches that ended without the launcher recording it (the
// launcher was killed): billed from their result events if any, else estimated from usage.
export function settleLaunches(launches, transcriptText) {
  return launches.map((l, i) => {
    if (typeof l.costUsd === 'number' || typeof l.costEstimateUsd === 'number' || typeof l.transcriptStart !== 'number') return l;
    const end = launches[i + 1]?.transcriptStart ?? transcriptText.length;
    const slice = transcriptText.slice(l.transcriptStart, end);
    const results = slice.split('\n').flatMap((x) => { try { const e = JSON.parse(x); return e.type === 'result' ? [e] : []; } catch { return []; } });
    const billed = launchCost(results);
    if (billed !== null) return { ...l, costUsd: billed, settledLater: true };
    const est = estimateFromTranscript(slice);
    return est.messages ? { ...l, costEstimateUsd: est.usd, settledLater: true } : l;
  });
}

// A lock is stale when neither the launcher nor its claude child is still the process that took it.
// `probe(pid)` returns the process start time in ms, or null when no such process exists.
export function lockIsStale(lockText, probe) {
  let lock;
  try { lock = JSON.parse(lockText); } catch { lock = null; }
  if (!lock || typeof lock !== 'object') lock = { pid: Number(String(lockText).trim()) };
  const same = (pid, startedAt) => {
    if (!pid) return false;
    const started = probe(pid);
    if (started === null) return false;
    // MAGIC: process start times from `ps` have 1 s resolution; 5 s of slack covers the gap
    // between the process starting and it writing the lock.
    return typeof startedAt !== 'number' || Math.abs(started - startedAt) < 5000;
  };
  return !(same(lock.pid, lock.pidStartedAt) || same(lock.childPid, lock.childStartedAt));
}

export function processStartMs(pid) {
  try {
    const out = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const t = Date.parse(out);
    return Number.isNaN(t) ? null : t;
  } catch (err) {
    // ps exits 1 when the pid doesn't exist.
    if (process.env.AUTOPILOT_DEBUG === '1') console.error(`[autopilot-run processStartMs ${pid}] ${err.stack || err}`);
    return null;
  }
}

// What to do with steps a previous launch left in_progress. `dirty` is `git status --porcelain`
// output for the clone. Edits outside the run folder mean a worker got partway: the next worker
// continues from them instead of starting over, so nothing is done twice.
export function recoveryPlan(state, dirty, runDirRel) {
  const files = dirty.split('\n').filter(Boolean).map((l) => l.slice(3)).filter((f) => !f.startsWith(runDirRel) && !f.startsWith('.autopilot-tmp'));
  return (state?.steps ?? []).filter((s) => s.status === 'in_progress').map((s) => ({
    step: s.id,
    files,
    action: files.length ? 'continue-from-edits' : 'redispatch-fresh',
  }));
}

export function recoveryText(plan) {
  if (!plan.length) return '';
  return plan.map((p) => p.action === 'continue-from-edits'
    ? `${p.step} was in_progress when the last launch ended, and the clone has ${p.files.length} uncommitted file(s) outside the run folder (${p.files.slice(0, 8).join(', ')}${p.files.length > 8 ? ', …' : ''}). Before anything else: read git diff for them, decide whether they finish ${p.step}, and dispatch ONE foreground worker to continue from them (or verify and commit if they are complete). Do not start the step over.`
    : `${p.step} was in_progress when the last launch ended, with no uncommitted edits. Dispatch ONE foreground worker for it from the start.`).join('\n');
}

// Excluded commands a plan needs, from the project's files and the steps' verify commands, with
// what each exposes and warnings about patterns that run everything.
export function sandboxProposal({ files, verifyCommands = [], excluded = [] }) {
  const has = (re) => files.some((f) => re.test(f));
  const proposals = [];
  const add = (pattern, why, exposes) => { if (!proposals.some((p) => p.pattern === pattern)) proposals.push({ pattern, why, exposes }); };
  const flutter = files.some((f) => /(^|\/)pubspec\.yaml$/.test(f)) && (verifyCommands.some((c) => /\bflutter\b/.test(c)) || has(/(^|\/)(android|ios|lib\/main\.dart)(\/|$)/));
  if (flutter) {
    add('flutter *', 'Flutter\'s launcher script writes its engine stamp inside the Flutter SDK, outside the clone ("update_engine_version.sh … Operation not permitted" in the sandbox).', 'every flutter command runs with your full file access and unrestricted network, including package build hooks it runs.');
    add('dart *', 'dart is the same SDK and fails the same way; pub also needs the TLS trust store the sandbox blocks for Dart.', 'every dart command, including `dart run` of any package script, runs with your full access.');
  } else if (has(/(^|\/)pubspec\.yaml$/)) {
    add('dart *', 'pub needs the TLS trust store, which the sandbox blocks for Dart (CERTIFICATE_VERIFY_FAILED in real runs).', 'every dart command, including `dart run` of any package script, runs with your full access.');
  }
  if (has(/(^|\/)go\.mod$/)) {
    add('go *', 'Go writes its build cache under ~/Library/Caches and its TLS check fails inside the sandbox (x509 errors in real runs).', 'every go command, including `go run` and `go generate` of repo code, runs with your full access.');
  }
  const warnings = [];
  const BROAD = /^(node|npx|npm|pnpm|yarn|bun|deno|python[\d.]*|pip[\d.]*|ruby|perl|bash|sh|zsh|make|docker|env|sudo) \*$/;
  for (const p of [...excluded, ...proposals.map((x) => x.pattern)]) {
    if (BROAD.test(p)) warnings.push(`"${p}" runs any script or code unsandboxed with unrestricted network: the run could then do anything you can. Prefer a narrower pattern (for example "npm test *") or allowLocalBinding for test servers.`);
    if (!/ \*$/.test(p) && !p.includes(' ')) warnings.push(`"${p}" has no " *", so it matches only the bare command with no arguments.`);
  }
  for (const c of verifyCommands) {
    if (/(^|&&|;|\|)\s*cd\s/.test(c) || /\$\(|`|(^|[^2&])>\s*[^&]/.test(c)) warnings.push(`verify command "${c}" contains cd, a redirect or a substitution, which keeps the whole call sandboxed even when its tool is excluded. Workers should run the tool on its own (cd in a separate call, or the tool's own -C/--directory option).`);
  }
  const nodeServer = verifyCommands.some((c) => /\b(vite|next dev|playwright|cypress|serve|dev server|supertest|listen)\b/.test(c));
  return { proposals, warnings, suggestLocalBinding: nodeServer };
}

// ---------------------------------------------------------------------------------------------
// Helpers with I/O

class UsageError extends Error {}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    throw new UsageError(`could not read ${p}: ${err.message}`);
  }
}

function readJsonOr(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`autopilot-run: could not read ${p}, starting it fresh: ${err.message}`);
    return fallback;
  }
}

const writePrivate = (p, body) => { fs.writeFileSync(p, body, { mode: 0o600 }); fs.chmodSync(p, 0o600); };

function checkClaudeVersion() {
  let out;
  try {
    out = execFileSync('claude', ['--version'], { encoding: 'utf8' });
  } catch (err) {
    throw new UsageError(`could not run \`claude --version\`: ${err.message}`);
  }
  const v = (out.match(/(\d+)\.(\d+)\.(\d+)/) ?? []).slice(1).map(Number);
  const cmp = v.length === 3 ? (v[0] - MIN_CLAUDE[0] || v[1] - MIN_CLAUDE[1] || v[2] - MIN_CLAUDE[2]) : -1;
  if (cmp < 0) throw new UsageError(`Claude Code ${MIN_CLAUDE.join('.')} or later is needed (found ${out.trim()}).`);
}

// Same assembly as rules-evals buildBundle: ~/.claude/CLAUDE.md plus every rule file. The run
// skips user settings (see buildClaudeArgs), which keeps these out, so they are passed in.
function buildRulesBundle(runDir, extra) {
  const home = path.join(os.homedir(), '.claude');
  const parts = [];
  const globalMd = path.join(home, 'CLAUDE.md');
  if (fs.existsSync(globalMd)) parts.push(`Contents of ${globalMd}:\n\n${fs.readFileSync(globalMd, 'utf8')}`);
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((d) => {
      const p = path.join(dir, d.name);
      let isDir = d.isDirectory();
      if (d.isSymbolicLink()) {
        try { isDir = fs.statSync(p).isDirectory(); } catch (err) {
          console.error(`autopilot-run: skipping broken link ${p}: ${err.message}`);
          return [];
        }
      }
      return isDir ? walk(p) : d.name.endsWith('.md') ? [p] : [];
    });
  const rulesDir = path.join(home, 'rules');
  if (fs.existsSync(rulesDir)) {
    for (const f of walk(rulesDir)) parts.push(`Contents of ${f}:\n\n${fs.readFileSync(f, 'utf8')}`);
  }
  parts.push(`You are inside an approved autopilot run. Run folder: ${runDir}. The user approved the plan and is not watching: never wait for an answer from them. The autopilot exceptions in the rules above apply. Start every subagent with run_in_background: false and wait for it. Write ledger entries with: node "$AUTOPILOT_HOOKS" ledger <kind> <step> "<title>" Field=value … (or - to read Field: value lines from stdin).${extra ? `\n\n${extra}` : ''}`);
  return parts.join('\n\n');
}

function userPluginDirs() {
  const home = path.join(os.homedir(), '.claude');
  let enabled = {};
  let installed = {};
  try { enabled = JSON.parse(fs.readFileSync(path.join(home, 'settings.json'), 'utf8')).enabledPlugins ?? {}; } catch (err) {
    console.error(`autopilot-run: could not read enabledPlugins from ~/.claude/settings.json: ${err.message}`);
  }
  try { installed = JSON.parse(fs.readFileSync(path.join(home, 'plugins', 'installed_plugins.json'), 'utf8')).plugins ?? {}; } catch (err) {
    console.error(`autopilot-run: could not read installed_plugins.json: ${err.message}`);
  }
  return selectPluginDirs({ enabled, installed, pluginRoot: PLUGIN_ROOT });
}

// Creates the run's temp folder, kept out of git through .git/info/exclude (the run can't edit .git).
function createRunTmpDir(clone) {
  const dir = path.join(clone, '.autopilot-tmp');
  fs.mkdirSync(dir, { recursive: true });
  const exclude = path.join(clone, '.git', 'info', 'exclude');
  const current = fs.existsSync(exclude) ? fs.readFileSync(exclude, 'utf8') : '';
  if (!current.split('\n').includes('/.autopilot-tmp/')) {
    fs.mkdirSync(path.dirname(exclude), { recursive: true });
    fs.appendFileSync(exclude, `${current && !current.endsWith('\n') ? '\n' : ''}/.autopilot-tmp/\n`);
  }
}

// SECURITY: .git/config can name programs git runs (fsmonitor, filters, pager, ssh). The first
// launch saves it; later the launcher restores that copy before running git in the clone itself.
// Returns a warning when it had to restore.
export function guardGitConfig(clone, stateDir) {
  const live = path.join(clone, '.git', 'config');
  const saved = path.join(stateDir, 'git-config.saved');
  const current = fs.readFileSync(live, 'utf8');
  if (!fs.existsSync(saved)) { writePrivate(saved, current); return null; }
  const original = fs.readFileSync(saved, 'utf8');
  if (original === current) return null;
  fs.writeFileSync(live, original);
  writePrivate(path.join(stateDir, `git-config.changed-${Date.now()}`), current);
  return 'the run changed .git/config; the launcher restored the approved copy (the changed one is saved in the state folder)';
}

function appendLedger(runDir, kind, step, title, fields) {
  const file = path.join(runDir, 'ledger.md');
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const entry = formatLedgerEntry({ n: nextLedgerNumber(text), at: new Date(), kind, step, title, fields });
  fs.appendFileSync(file, `${text.endsWith('\n') || !text ? '' : '\n'}\n${entry}\n`);
}

// ---------------------------------------------------------------------------------------------
// Commands

function loadRun(runId) {
  if (!runId || !/^[\w.-]+$/.test(runId)) throw new UsageError('usage: node autopilot-run.mjs <run-id> [--model opus] [--max-budget-usd N] [--dry-run]');
  const stateDir = path.join(STATE_ROOT, runId);
  // SECURITY: the approved config is read only from ~/.claude/autopilot/<id>/, which the run can't
  // write. Copies inside the clone are for the orchestrator to read, never trusted here.
  const approved = readJson(path.join(stateDir, 'approved.json'));
  if (approved.id !== runId) throw new UsageError(`approved.json is for run ${approved.id}, not ${runId}`);
  let paths;
  try { paths = resolveRunPaths(approved, runId); } catch (err) { throw new UsageError(err.message); }
  const clone = fs.realpathSync(paths.clone);
  return { stateDir, approved, sourceRepo: paths.sourceRepo, clone, runDir: path.join(clone, 'docs', 'autopilot', runId) };
}

function cmdStatus(runId) {
  const { stateDir } = loadRun(runId);
  const s = readJsonOr(path.join(stateDir, 'status.json'), null);
  if (!s) { console.log(`no status.json yet for ${runId} (written while the run is going)`); return 0; }
  console.log(statusLine(s));
  console.log(JSON.stringify(s, null, 2));
  return 0;
}

function historyRuns(skipped = []) {
  const runs = [];
  for (const id of fs.existsSync(STATE_ROOT) ? fs.readdirSync(STATE_ROOT) : []) {
    const dir = path.join(STATE_ROOT, id);
    const result = readJsonOr(path.join(dir, 'result.json'), null);
    const approved = readJsonOr(path.join(dir, 'approved.json'), null);
    if (!result?.launches?.length || !approved) continue;
    let state = null;
    try {
      const { clone, sourceRepo } = resolveRunPaths(approved, id);
      state = readJsonOr(path.join(clone, 'docs', 'autopilot', id, 'state.json'), null) ?? readJsonOr(path.join(sourceRepo, 'docs', 'autopilot', id, 'state.json'), null);
    } catch (err) {
      if (process.env.AUTOPILOT_DEBUG === '1') console.error(`[autopilot-run history ${id}] ${err.message}`);
    }
    const buildSteps = approved.buildSteps ?? state?.steps?.filter((s) => s.kind === 'build').length ?? 0;
    if (!buildSteps) { skipped.push(`${id}: step count unknown (repo moved or clone cleaned; relocate it to include it)`); continue; }
    const costUsd = result.launches.reduce((a, l) => a + launchSpend(l).usd, 0);
    const single = result.launches.length === 1;
    const start = result.launches[0].startedAt ?? (single ? approved.approvedAt : null);
    const minutes = start && single ? (Date.parse(result.launches[0].endedAt) - Date.parse(start)) / 60000 : null;
    runs.push({ id, costUsd, buildSteps, minutes: minutes > 0 ? minutes : null });
  }
  return runs;
}

function cmdEstimate(args) {
  const steps = Number(args['build-steps']);
  if (!(steps > 0)) throw new UsageError('usage: node autopilot-run.mjs estimate --build-steps N [--margin 1.5]');
  const skipped = [];
  const runs = historyRuns(skipped);
  const p = proposeBudget(runs, steps, Number(args.margin ?? 1.5));
  console.log(JSON.stringify({ ...p, note: 'minutes are approval-to-end for single-launch runs, so they include any wait before the launch', skipped, from: runs.map((r) => ({ id: r.id, costUsd: Math.round(r.costUsd * 100) / 100, buildSteps: r.buildSteps, minutes: r.minutes && Math.round(r.minutes) })) }, null, 2));
  return 0;
}

function cmdSandboxCheck(args) {
  const repo = args.positional[1];
  if (!repo || !fs.existsSync(repo)) throw new UsageError('usage: node autopilot-run.mjs sandbox-check <repo> [--verify "<cmd>" …] [--excluded "<pattern>" …]');
  const files = execFileSync('git', ['-C', repo, 'ls-files'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean);
  const out = sandboxProposal({ files, verifyCommands: args.verify ?? [], excluded: args.excluded ?? [] });
  const ctx = { root: repo, runDir: repo, stateDir: repo, env: process.env, deploys: [], gitAlias: () => null };
  out.guardDenies = (args.verify ?? []).flatMap((c) => { const r = checkCommand(c, ctx); return r ? [{ command: c, reason: r }] : []; });
  console.log(JSON.stringify(out, null, 2));
  return 0;
}

function cmdRelocate(args) {
  const [, runId, newRepo] = args.positional;
  if (!runId || !newRepo) throw new UsageError('usage: node autopilot-run.mjs relocate <run-id> <new-repo-path>');
  const file = path.join(STATE_ROOT, runId, 'approved.json');
  const approved = readJson(file);
  const repo = fs.realpathSync(newRepo);
  const rel = path.isAbsolute(approved.clone ?? '') ? path.relative(approved.sourceRepo, approved.clone) : approved.clone;
  if (rel.startsWith('..')) throw new UsageError(`the clone ${approved.clone} was not inside the old repo, so it can't be relocated with it.`);
  if (!fs.existsSync(path.join(repo, rel, '.git'))) throw new UsageError(`${path.join(repo, rel)} is not the run's clone (no .git there).`);
  writePrivate(file, JSON.stringify({ ...approved, sourceRepo: repo, clone: rel, relocatedFrom: approved.sourceRepo }, null, 2));
  console.log(`run ${runId} now points at ${repo} (clone ${rel}).`);
  return 0;
}

function dirSize(p) {
  try { return Number(execFileSync('du', ['-sk', p], { encoding: 'utf8' }).split('\t')[0]) * 1024; } catch (err) {
    if (process.env.AUTOPILOT_DEBUG === '1') console.error(`[autopilot-run dirSize ${p}] ${err.message}`);
    return 0;
  }
}

function cmdClean(args) {
  const rows = [];
  for (const id of fs.existsSync(STATE_ROOT) ? fs.readdirSync(STATE_ROOT) : []) {
    const dir = path.join(STATE_ROOT, id);
    const approved = readJsonOr(path.join(dir, 'approved.json'), null);
    if (!approved) continue;
    if (fs.existsSync(path.join(dir, 'lock')) && !lockIsStale(fs.readFileSync(path.join(dir, 'lock'), 'utf8'), processStartMs)) { rows.push({ id, skip: 'running' }); continue; }
    let clone = null;
    let fetched = false;
    try {
      const p = resolveRunPaths(approved, id);
      clone = p.clone;
      const tip = execFileSync('git', ['-C', clone, ...safeGitArgs(path.join(dir, 'empty-hooks')), 'rev-parse', `autopilot/${id}`], { encoding: 'utf8', stdio: 'pipe' }).trim();
      // The branch must already be in the source repo, at or past the clone's tip, before the clone may go.
      execFileSync('git', ['-C', p.sourceRepo, 'merge-base', '--is-ancestor', tip, `autopilot/${id}`], { stdio: 'pipe' });
      fetched = true;
    } catch (err) {
      if (process.env.AUTOPILOT_DEBUG === '1') console.error(`[autopilot-run clean ${id}] ${err.message}`);
    }
    const transcript = path.join(dir, 'transcript.jsonl');
    rows.push({ id, clone: clone && fs.existsSync(clone) ? clone : null, cloneBytes: clone && fs.existsSync(clone) ? dirSize(clone) : 0, fetched, transcript: fs.existsSync(transcript) ? transcript : null, transcriptBytes: fs.existsSync(transcript) ? fs.statSync(transcript).size : 0 });
  }
  const mb = (b) => `${(b / 1e6).toFixed(1)} MB`;
  let freed = 0;
  for (const r of rows) {
    if (r.skip) { console.log(`${r.id}: ${r.skip}, left alone`); continue; }
    const cloneNote = !r.clone ? 'no clone' : r.fetched ? `clone ${mb(r.cloneBytes)}` : `clone ${mb(r.cloneBytes)} KEPT (branch not in the source repo yet; fetch it first)`;
    console.log(`${r.id}: ${cloneNote}; transcript ${mb(r.transcriptBytes)}`);
    if (!args.yes) continue;
    if (r.clone && r.fetched) { fs.rmSync(r.clone, { recursive: true, force: true }); freed += r.cloneBytes; }
    if (r.transcript) { fs.rmSync(r.transcript, { force: true }); freed += r.transcriptBytes; }
  }
  console.log(args.yes ? `\nfreed ${mb(freed)}. approved.json, result.json and status.json are kept, so cost history stays.` : '\nnothing deleted. Run again with --yes to delete the clones listed (only those whose branch is in the source repo) and the transcripts.');
  return 0;
}

// The launch itself. Returns only through process exit, when the child ends.
function cmdLaunch(args) {
  const runId = args.positional[0];
  const { stateDir, approved, sourceRepo, clone, runDir } = loadRun(runId);
  const branch = `autopilot/${runId}`;
  if (!fs.statSync(path.join(clone, '.git')).isDirectory()) throw new UsageError(`${clone} is not a standalone clone (its .git is not a directory)`);
  if (!fs.existsSync(path.join(runDir, 'state.json'))) throw new UsageError(`${runDir}/state.json not found`);
  const emptyHooks = path.join(stateDir, 'empty-hooks');
  fs.mkdirSync(emptyHooks, { recursive: true });
  const gitArgs = safeGitArgs(emptyHooks);
  const git = (...a) => execFileSync('git', ['-C', clone, ...gitArgs, ...a], { encoding: 'utf8', stdio: 'pipe' });
  const head = git('rev-parse', '--abbrev-ref', 'HEAD').trim();
  if (head !== branch) throw new UsageError(`the clone is on ${head}, expected ${branch}`);
  checkClaudeVersion();

  const lockFile = path.join(stateDir, 'lock');
  if (fs.existsSync(lockFile) && !lockIsStale(fs.readFileSync(lockFile, 'utf8'), processStartMs)) {
    throw new UsageError(`run ${runId} is already running (${fs.readFileSync(lockFile, 'utf8').trim()})`);
  }
  const configWarning = args['dry-run'] ? null : guardGitConfig(clone, stateDir);

  const resultFile = path.join(stateDir, 'result.json');
  const transcriptPath = path.join(stateDir, 'transcript.jsonl');
  const transcriptStart = fs.existsSync(transcriptPath) ? fs.statSync(transcriptPath).size : 0;
  const prior = readJsonOr(resultFile, { launches: [] });
  const launches = settleLaunches(prior.launches ?? [], transcriptStart ? fs.readFileSync(transcriptPath, 'utf8') : '');
  let budget;
  try { budget = launchBudget({ approvedTotal: approved.maxBudgetUsd, override: args['max-budget-usd'], launches }); } catch (err) { throw new UsageError(err.message); }

  const state = readJsonOr(path.join(runDir, 'state.json'), null);
  const runDirRel = path.relative(clone, runDir);
  const recovery = launches.length ? recoveryPlan(state, git('status', '--porcelain'), runDirRel) : [];
  const deciderCap = Number(approved.deciderCap ?? DEFAULT_DECIDER_CAP);
  const extra = [
    recovery.length ? `Recovery from the previous launch:\n${recoveryText(recovery)}` : '',
    `Decider calls this run: ${readDeciderCount(stateDir).used} of ${deciderCap}. Budget left for this launch: $${budget.remaining.toFixed(2)} of $${budget.total.toFixed(2)}.`,
  ].filter(Boolean).join('\n\n');

  const settingsPath = path.join(stateDir, 'settings.json');
  const bundlePath = path.join(stateDir, 'rules-bundle.md');
  const authVars = Object.keys(process.env).filter((k) => CLAUDE_AUTH_ENV.test(k));
  const settings = buildSettings({ approved, hooksScript: path.join(HERE, 'autopilot-hooks.mjs'), authVars });
  const model = args.model ?? approved.model ?? 'opus';
  const claudeArgs = buildClaudeArgs({ runId, model, settingsPath, bundlePath, pluginDirs: userPluginDirs(), budgetUsd: budget.remaining });
  const env = buildEnv({ approved, processEnv: process.env, stateDir, runDir, clone });

  let stdoutOpen = true;
  const say = (line) => {
    if (!stdoutOpen) return;
    try { process.stdout.write(`${line}\n`); } catch (err) {
      stdoutOpen = false;
      if (process.env.AUTOPILOT_DEBUG === '1') console.error(`[autopilot-run say] ${err.message}`);
    }
  };
  // EXTERNAL: a closed terminal turns writes into EPIPE errors; the run carries on without output.
  for (const s of [process.stdout, process.stderr]) s.on('error', (err) => { if (err.code === 'EPIPE') stdoutOpen = false; });

  say(`autopilot ${runId}`);
  say(`  clone:    ${clone} (branch ${branch})`);
  say(`  hosts:    ${(approved.allowedDomains ?? []).join(', ') || '(none)'}`);
  say(`  unsandboxed commands: ${(approved.excludedCommands ?? []).join(', ') || '(none)'}`);
  say(`  env passed through: ${(approved.passEnv ?? []).join(', ') || '(none)'}`);
  say(`  budget:   $${budget.remaining.toFixed(2)} for this launch ($${budget.spent.toFixed(2)} of $${budget.total.toFixed(2)} spent before${budget.estimated ? `, ${budget.estimated} launch(es) estimated` : ''})`);
  say(`  decider:  ${readDeciderCount(stateDir).used}/${deciderCap} calls used`);
  if (configWarning) say(`  warning:  ${configWarning}`);
  for (const r of recovery) say(`  resume:   ${r.step} ${r.action === 'continue-from-edits' ? `continues from ${r.files.length} uncommitted file(s)` : 'starts over (no edits found)'}`);
  if (args['dry-run']) {
    say(JSON.stringify({ cwd: clone, args: claudeArgs, settings, env: Object.fromEntries(Object.entries(env).filter(([k]) => /^(AUTOPILOT_|CLAUDE_CODE_PRINT|BASH_DEFAULT|TMPDIR)/.test(k))) }, null, 2));
    return 0;
  }

  createRunTmpDir(clone);
  fs.rmSync(path.join(stateDir, 'STOP'), { force: true });
  fs.rmSync(path.join(stateDir, 'stop-hook.json'), { force: true });
  writePrivate(settingsPath, JSON.stringify(settings, null, 2));
  writePrivate(bundlePath, buildRulesBundle(runDir, extra));
  if (configWarning) appendLedger(runDir, 'WARN', '-', configWarning, {});
  for (const r of recovery) {
    appendLedger(runDir, 'R', r.step, `launch ${launches.length + 1} found ${r.step} in_progress`, {
      Found: r.files.length ? `${r.files.length} uncommitted file(s): ${r.files.slice(0, 12).join(', ')}` : 'no uncommitted edits',
      Action: r.action === 'continue-from-edits' ? 'inspect the diff, then one worker continues from these edits (attempts unchanged)' : 'one worker starts the step again (attempts unchanged)',
    });
  }
  const startedAt = new Date().toISOString();
  const thisLaunch = { startedAt, budgetUsd: Math.round(budget.remaining * 100) / 100, transcriptStart };
  // ORDER: recorded before the child starts, so a launcher killed mid-run still leaves the launch
  // (and its cap) in result.json for the next launch's budget.
  const record = (fields) => {
    const all = [...launches, { ...thisLaunch, ...fields }];
    writePrivate(resultFile, JSON.stringify({ budgetUsd: budget.total, launches: all, totalCostUsd: all.reduce((a, l) => a + launchSpend(l).usd, 0) }, null, 2));
    return all;
  };
  record({});

  const transcript = fs.openSync(transcriptPath, 'a', 0o600);
  say(`  ledger:   ${path.join(runDir, 'ledger.md')}`);
  say(`  status:   ${path.join(stateDir, 'status.json')}`);
  say(`  stop:     touch "${path.join(stateDir, 'STOP')}"`);
  // SECURITY: its own process group, so a closed terminal's SIGHUP doesn't end the unattended run
  // and a forwarded signal reaches every command the run started.
  const child = spawn('claude', claudeArgs, { cwd: clone, env, stdio: ['ignore', transcript, transcript], detached: true });
  writePrivate(lockFile, JSON.stringify({ pid: process.pid, pidStartedAt: processStartMs(process.pid), childPid: child.pid, childStartedAt: child.pid ? processStartMs(child.pid) : null, startedAt }));
  let signal = null;
  const forward = (sig) => {
    signal ??= sig;
    try { process.kill(-child.pid, sig); } catch (err) {
      if (process.env.AUTOPILOT_DEBUG === '1') console.error(`[autopilot-run forward ${sig}] ${err.message}`);
    }
  };
  process.on('SIGINT', () => forward('SIGINT'));
  process.on('SIGTERM', () => forward('SIGTERM'));
  process.on('SIGHUP', () => { stdoutOpen = false; });

  const ledger = path.join(runDir, 'ledger.md');
  const tracker = createTracker();
  let transcriptPos = transcriptStart;
  let shown = fs.existsSync(ledger) ? fs.readFileSync(ledger, 'utf8').split('\n').length : 0;
  let lastLedgerMtime = 0;
  let lastStatusWrite = 0;
  let lastLine = Date.now();
  const tick = () => {
    try {
      const size = fs.statSync(transcriptPath).size;
      if (size > transcriptPos) {
        const fd = fs.openSync(transcriptPath, 'r');
        const buf = Buffer.alloc(size - transcriptPos);
        fs.readSync(fd, buf, 0, buf.length, transcriptPos);
        fs.closeSync(fd);
        transcriptPos = size;
        tracker.ingest(buf.toString('utf8'));
      }
      const mtime = fs.existsSync(ledger) ? fs.statSync(ledger).mtimeMs : 0;
      const text = mtime ? fs.readFileSync(ledger, 'utf8') : '';
      if (mtime !== lastLedgerMtime) {
        const lines = text.split('\n');
        // The file tools rewrite the whole file, so track lines, not bytes; skip the unfinished last line.
        for (const line of lines.slice(Math.min(shown, lines.length), -1)) if (line.startsWith('### ')) say(`  ${line.slice(4)}`);
        shown = Math.max(lines.length - 1, 0);
      }
      const now = Date.now();
      // MAGIC: status.json on every ledger change and at least every 30 s; a summary line each minute.
      if (mtime !== lastLedgerMtime || now - lastStatusWrite >= 30000) {
        const status = statusSnapshot({
          runId, pid: child.pid, launch: launches.length + 1, state: readJsonOr(path.join(runDir, 'state.json'), null), ledgerText: text, ledgerMtimeMs: mtime,
          decider: { ...readDeciderCount(stateDir), cap: deciderCap }, budget: { totalUsd: budget.total, spentBefore: budget.spent }, tracker, now,
        });
        writePrivate(path.join(stateDir, 'status.json'), JSON.stringify(status, null, 2));
        lastStatusWrite = now;
        if (now - lastLine >= 60000) { say(`  ${statusLine(status)}`); lastLine = now; }
      }
      lastLedgerMtime = mtime;
    } catch (err) {
      console.error(`autopilot-run: status update failed: ${err.stack || err.message}`);
    }
  };
  const timer = setInterval(tick, 5000);

  const finish = (code) => {
    clearInterval(timer);
    tick();
    fs.rmSync(lockFile, { force: true });
    let open = [{ id: '(state.json unreadable)' }];
    try {
      open = JSON.parse(fs.readFileSync(path.join(runDir, 'state.json'), 'utf8')).steps.filter((s) => !TERMINAL.has(s.status));
    } catch (err) {
      console.error(`autopilot-run: could not read state.json: ${err.message}`);
    }
    const report = path.join(runDir, 'report.md');
    let slice = '';
    try { slice = fs.readFileSync(transcriptPath, 'utf8').slice(transcriptStart); } catch (err) {
      console.error(`autopilot-run: could not read the transcript: ${err.message}`);
    }
    const results = slice.split('\n').flatMap((x) => { try { const e = JSON.parse(x); return e.type === 'result' ? [e] : []; } catch { return []; } });
    const cost = launchCost(results);
    const estimate = cost === null ? estimateFromTranscript(slice) : null;
    let all = [];
    try {
      all = record({ endedAt: new Date().toISOString(), exitCode: code, costUsd: cost, ...(estimate?.messages ? { costEstimateUsd: estimate.usd } : {}) });
    } catch (err) {
      console.error(`autopilot-run: could not write result.json: ${err.stack || err.message}`);
    }
    if (open.length || !fs.existsSync(report)) {
      // The session is gone, so nobody else can record why the run ended early.
      const result = results.at(-1);
      const stopped = fs.existsSync(path.join(stateDir, 'STOP'));
      const label = stopped ? 'STOP' : signal ? 'Interrupted' : 'Ended';
      const why = stopped ? 'user STOP file'
        : signal ? `${signal}${signal === 'SIGINT' ? ' (Ctrl-C)' : ''}`
          : result ? `session ended: ${result.subtype ?? 'unknown'}${result.is_error ? ' (error)' : ''}${result.subtype === 'error_max_budget_usd' ? ' (launch budget reached)' : ''}` : `claude exited with code ${code}`;
      try {
        fs.appendFileSync(path.join(runDir, 'ledger.md'), `\n### [end] ${new Date().toISOString().slice(0, 16)}Z ${label}: ${why}; open steps: ${open.map((s) => s.id).join(', ') || 'none'}${fs.existsSync(report) ? '' : '; no report.md'}\n`);
      } catch (err) {
        console.error(`autopilot-run: could not append the end entry: ${err.message}`);
      }
    }
    const costText = costLine(cost, all, resultFile);
    if (fs.existsSync(report)) {
      try { writeCostLine(report, costText); } catch (err) {
        console.error(`autopilot-run: could not write the cost into report.md: ${err.stack || err.message}`);
      }
    }
    let restored = null;
    try { restored = guardGitConfig(clone, stateDir); } catch (err) {
      console.error(`autopilot-run: could not check .git/config: ${err.stack || err.message}`);
    }
    if (restored) say(`  warning:  ${restored}`);
    // ORDER: before the branch is fetched back, so the fetched branch carries the run's records.
    try {
      commitRunRecords({ clone, runDir, message: `docs: autopilot ${runId} run records`, gitArgs });
    } catch (err) {
      console.error(`autopilot-run: could not commit the run folder: ${String(err.stderr || '').trim() || err.stack || err.message}`);
    }
    let fetched = '';
    try {
      execFileSync('git', ['-C', sourceRepo, 'fetch', '--quiet', clone, `${branch}:${branch}`], { stdio: 'pipe' });
      fetched = `  branch ${branch} is now in ${sourceRepo}`;
    } catch (err) {
      fetched = `  could not fetch ${branch} into ${sourceRepo}: ${String(err.stderr || err.message).trim()}\n  fetch it by hand: git -C "${sourceRepo}" fetch "${clone}" ${branch}:${branch}`;
    }
    say(`\nautopilot ${runId} ended (exit ${code}).`);
    say(fs.existsSync(report) ? `  report: ${report}` : '  no report.md; see the ledger and transcript.jsonl');
    say(`  cost:     ${costText}`);
    say(fetched);
    if (stdoutOpen) say('\x07');
    process.exit(code ?? 1);
  };

  child.on('error', (err) => {
    console.error(`autopilot-run: could not start claude: ${err.stack || err.message}`);
    finish(1);
  });
  child.on('exit', (code) => finish(code));
  return null;
}

export function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
    const cmd = args.positional[0];
    if (cmd === 'status') return cmdStatus(args.positional[1]);
    if (cmd === 'estimate') return cmdEstimate(args);
    if (cmd === 'sandbox-check') return cmdSandboxCheck(args);
    if (cmd === 'relocate') return cmdRelocate(args);
    if (cmd === 'clean') return cmdClean(args);
    return cmdLaunch(args);
  } catch (err) {
    if (err instanceof UsageError || /needs a value/.test(err.message)) { console.error(`autopilot-run: ${err.message}`); return 1; }
    console.error(`autopilot-run: ${err.stack || err.message}`);
    return 1;
  }
}

const isMain = (() => {
  try { return fs.realpathSync(process.argv[1] ?? '') === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isMain) {
  const code = main(process.argv.slice(2));
  if (code !== null) process.exit(code);
}
