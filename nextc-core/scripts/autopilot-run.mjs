#!/usr/bin/env node
// Starts (or resumes) an approved autopilot run. The user runs this from a terminal: it starts
// `claude` with every permission check off, which no agent should do on its own.
//
//   node autopilot-run.mjs <run-id> [--model opus] [--max-budget-usd N] [--dry-run]
//
// Containment, in layers:
//   - The run works in a local clone with its own .git, so nothing it does to git reaches the
//     user's checkout. The branch is fetched back into the source repo when the run ends.
//   - The OS sandbox confines every shell command and its child processes to the clone, and its
//     network allowlist is the plan's host list.
//   - A guard hook confines the file tools (they run outside the sandbox) to the clone, and
//     parses each shell command to block push, gh, store uploads and publishing, and a deploy
//     step's commands until its compatibility check passed.
//   - Temp files go to <clone>/.autopilot-tmp, inside the sandbox's write scope.
//   - Deny rules back up the hook; removed tools take away MCP and web fetches.
//   - Everything the run must not change (approved config, settings, STOP file) lives in
//     ~/.claude/autopilot/<run-id>/, which neither the sandbox nor the guard lets it write.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchCost, costLine, recordCostInReport } from './autopilot-cost.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.dirname(HERE);
const STATE_ROOT = path.join(os.homedir(), '.claude', 'autopilot');
// MAGIC: 2.1.295 is the first version with hook `onFailure: "block"`; without it a crashed guard
// lets the action through. --permission-prompts (2.1.259) and
// --append-subagent-system-prompt-file (2.1.261) are older.
const MIN_CLAUDE = [2, 1, 295];
const TERMINAL = new Set(['done', 'blocked', 'hard-stop', 'skipped']);

// SECURITY: the guard hook parses each Bash command and blocks push, gh, store uploads and
// publishing wherever they appear in it (git -C, env prefixes, sh -c, $(…), aliases). These
// prefix rules are a second layer that holds even if the hook can't run. They match only at the
// start of a command, so they never block an argument such as `git log --grep=push`.
const DENY = [
  'Bash(git push*)', 'Bash(gh pr *)', 'Bash(gh api *)', 'Bash(gh release *)', 'Bash(gh repo *)',
  'Bash(fastlane pilot*)', 'Bash(fastlane deliver*)', 'Bash(fastlane supply*)', 'Bash(xcrun altool*)', 'Bash(eas submit*)',
  'Bash(npm publish*)', 'Bash(pnpm publish*)', 'Bash(yarn publish*)', 'Bash(cargo publish*)',
  'Bash(dart pub publish*)', 'Bash(flutter pub publish*)',
];
// Tools that act outside the sandbox: web fetches, publishing, remote scheduling, questions.
const REMOVED_TOOLS = [
  'AskUserQuestion', 'EnterPlanMode', 'ExitPlanMode', 'WebFetch', 'RemoteTrigger', 'CronCreate', 'CronDelete',
  'Artifact', 'ArtifactData', 'ArtifactComments', 'mcp__*',
];
// SECURITY: credentials stay out of the run unless the plan names them in passEnv.
const SECRET_ENV = /TOKEN|SECRET|PASSW|CREDENTIAL|API_?KEY|ACCESS_KEY|PRIVATE_KEY|AUTH|^AWS_|^GH_|^GITHUB_|^NPM_|^SSH_/i;
const CLAUDE_AUTH_ENV = /^(ANTHROPIC_|CLAUDE_CODE_OAUTH)/;
const SECRET_FILES = ['~/.ssh', '~/.aws', '~/.config/gh', '~/.netrc', '~/.docker/config.json', '~/.kube', '~/.gnupg'];

const BOOLEAN_FLAGS = new Set(['dry-run']);

function parseArgs(argv) {
  const args = { positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { args.positional.push(a); continue; }
    const key = a.slice(2);
    if (BOOLEAN_FLAGS.has(key)) { args[key] = true; continue; }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) fail(`--${key} needs a value`);
    args[key] = next;
    i++;
  }
  return args;
}

function fail(msg) {
  console.error(`autopilot-run: ${msg}`);
  process.exit(1);
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    fail(`could not read ${p}: ${err.message}`);
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

function checkClaudeVersion() {
  let out;
  try {
    out = execFileSync('claude', ['--version'], { encoding: 'utf8' });
  } catch (err) {
    fail(`could not run \`claude --version\`: ${err.message}`);
  }
  const v = (out.match(/(\d+)\.(\d+)\.(\d+)/) ?? []).slice(1).map(Number);
  const cmp = v.length === 3 ? (v[0] - MIN_CLAUDE[0] || v[1] - MIN_CLAUDE[1] || v[2] - MIN_CLAUDE[2]) : -1;
  if (cmp < 0) fail(`Claude Code ${MIN_CLAUDE.join('.')} or later is needed (found ${out.trim()}).`);
}

// Same assembly as rules-evals buildBundle: ~/.claude/CLAUDE.md plus every rule file. The run
// skips user settings (see the spawn below), which keeps these out, so they are passed in.
function buildRulesBundle(runDir) {
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
  parts.push(`You are inside an approved autopilot run. Run folder: ${runDir}. The user approved the plan and is not watching: never wait for an answer from them. The autopilot exceptions in the rules above apply.`);
  return parts.join('\n\n');
}

// User-scope plugins are enabled in ~/.claude/settings.json, which the run doesn't load, so
// each one is passed with --plugin-dir. Project-scope plugins load from the project's settings.
// EXTERNAL: reads Claude Code's ~/.claude/plugins/installed_plugins.json layout.
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
  const dirs = [];
  for (const [id, on] of Object.entries(enabled)) {
    const entries = Array.isArray(installed[id]) ? installed[id] : [];
    const entry = entries.find((e) => e?.scope === 'user') ?? entries[0];
    if (on && entry?.installPath && fs.existsSync(entry.installPath)) dirs.push(entry.installPath);
  }
  // The autopilot skill and hooks must come from this copy of nextc-core, whatever is installed.
  return [...new Set([PLUGIN_ROOT, ...dirs.filter((d) => !d.includes(`${path.sep}nextc-core${path.sep}`))])];
}

const runTmpDir = (clone) => path.join(clone, '.autopilot-tmp');

// Creates the run's temp folder, kept out of git through .git/info/exclude (the run can't edit .git).
function createRunTmpDir(clone) {
  const dir = runTmpDir(clone);
  fs.mkdirSync(dir, { recursive: true });
  const exclude = path.join(clone, '.git', 'info', 'exclude');
  const current = fs.existsSync(exclude) ? fs.readFileSync(exclude, 'utf8') : '';
  if (!current.split('\n').includes('/.autopilot-tmp/')) {
    fs.mkdirSync(path.dirname(exclude), { recursive: true });
    fs.appendFileSync(exclude, `${current && !current.endsWith('\n') ? '\n' : ''}/.autopilot-tmp/\n`);
  }
}

function runEnv(approved, stateDir, runDir, clone) {
  // EXTERNAL: the sandbox lets commands write only inside the clone, so the user's TMPDIR (under
  // /var/folders) makes mktemp fail. A failed mktemp left a worker's "dry run" deploy in the clone.
  const tmp = runTmpDir(clone);
  const pass = new Set(approved.passEnv ?? []);
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (CLAUDE_AUTH_ENV.test(k) || pass.has(k) || !SECRET_ENV.test(k)) env[k] = v;
  }
  return {
    ...env,
    AUTOPILOT_RUN_DIR: runDir,
    AUTOPILOT_ROOT: clone,
    AUTOPILOT_STATE_DIR: stateDir,
    TMPDIR: tmp,
    TMP: tmp,
    TEMP: tmp,
    // EXTERNAL: turns off nextc-ecc's fact-force-guard hook. It asks for the user's verbatim
    // go-ahead before destructive commands; nobody can give one here, and the sandbox already
    // confines those commands to the clone.
    FACT_FORCE_GUARD: 'off',
  };
}

const writePrivate = (p, body) => fs.writeFileSync(p, body, { mode: 0o600 });

const args = parseArgs(process.argv.slice(2));
const runId = args.positional[0];
if (!runId || !/^[\w.-]+$/.test(runId)) fail('usage: node autopilot-run.mjs <run-id> [--model opus] [--max-budget-usd N] [--dry-run]');
const STATE_DIR = path.join(STATE_ROOT, runId);
// SECURITY: the approved config is read only from ~/.claude/autopilot/<id>/, which the run can't
// write. Copies inside the clone are for the orchestrator to read, never trusted here.
const approved = readJson(path.join(STATE_DIR, 'approved.json'));
if (approved.id !== runId) fail(`approved.json is for run ${approved.id}, not ${runId}`);
const CLONE = fs.realpathSync(approved.clone);
const branch = `autopilot/${runId}`;
if (!fs.statSync(path.join(CLONE, '.git')).isDirectory()) fail(`${CLONE} is not a standalone clone (its .git is not a directory)`);
const head = execFileSync('git', ['-C', CLONE, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
if (head !== branch) fail(`the clone is on ${head}, expected ${branch}`);
const RUN_DIR = path.join(CLONE, 'docs', 'autopilot', runId);
if (!fs.existsSync(path.join(RUN_DIR, 'state.json'))) fail(`${RUN_DIR}/state.json not found`);
checkClaudeVersion();

const lockFile = path.join(STATE_DIR, 'lock');
if (fs.existsSync(lockFile)) {
  const pid = Number(fs.readFileSync(lockFile, 'utf8'));
  let alive = false;
  try { process.kill(pid, 0); alive = true; } catch { /* ESRCH: no such process, so the lock is stale */ }
  if (alive) fail(`run ${runId} is already running (pid ${pid})`);
}

const hooksScript = path.join(HERE, 'autopilot-hooks.mjs');
const authVars = Object.keys(process.env).filter((k) => CLAUDE_AUTH_ENV.test(k));
const settings = {
  sandbox: {
    enabled: true,
    allowUnsandboxedCommands: false,
    failIfUnavailable: true,
    network: { allowedDomains: approved.allowedDomains ?? [] },
    excludedCommands: approved.excludedCommands ?? [],
    credentials: {
      files: SECRET_FILES.map((p) => ({ path: p, mode: 'deny' })),
      envVars: authVars.map((name) => ({ name, mode: 'deny' })),
    },
  },
  permissions: { deny: DENY },
  // SECURITY: the guard is the only check on file-tool paths; onFailure keeps a crash from
  // letting the write through.
  hooks: {
    PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: `node "${hooksScript}" guard`, onFailure: 'block' }] }],
    Stop: [{ matcher: '', hooks: [{ type: 'command', command: `node "${hooksScript}" stop` }] }],
  },
};
const settingsPath = path.join(STATE_DIR, 'settings.json');
const bundlePath = path.join(STATE_DIR, 'rules-bundle.md');
const budget = args['max-budget-usd'] ?? approved.maxBudgetUsd;
const claudeArgs = [
  '-p', `/nextc-core:autopilot run docs/autopilot/${runId}`,
  '--model', args.model ?? approved.model ?? 'opus',
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
  ...userPluginDirs().flatMap((d) => ['--plugin-dir', d]),
  ...(budget ? ['--max-budget-usd', String(budget)] : []),
  '--disallowedTools', ...REMOVED_TOOLS,
];
const env = runEnv(approved, STATE_DIR, RUN_DIR, CLONE);

console.log(`autopilot ${runId}`);
console.log(`  clone:    ${CLONE} (branch ${branch})`);
console.log(`  hosts:    ${(approved.allowedDomains ?? []).join(', ') || '(none)'}`);
console.log(`  unsandboxed commands: ${(approved.excludedCommands ?? []).join(', ') || '(none)'}`);
console.log(`  env passed through: ${(approved.passEnv ?? []).join(', ') || '(none)'}`);
console.log(`  budget:   ${budget ? `$${budget}` : 'none set (the run has no spend cap)'}`);
if (args['dry-run']) {
  console.log(JSON.stringify({ cwd: CLONE, args: claudeArgs, settings }, null, 2));
  process.exit(0);
}

writePrivate(lockFile, String(process.pid));
createRunTmpDir(CLONE);
fs.rmSync(path.join(STATE_DIR, 'STOP'), { force: true });
fs.rmSync(path.join(STATE_DIR, 'stop-hook.json'), { force: true });
writePrivate(settingsPath, JSON.stringify(settings, null, 2));
writePrivate(bundlePath, buildRulesBundle(RUN_DIR));
const transcriptPath = path.join(STATE_DIR, 'transcript.jsonl');
// Earlier launches of the same run append to this transcript; costs are counted from here on.
const transcriptStart = fs.existsSync(transcriptPath) ? fs.statSync(transcriptPath).size : 0;
const transcript = fs.openSync(transcriptPath, 'a', 0o600);
console.log(`  ledger:   ${path.join(RUN_DIR, 'ledger.md')}`);
console.log(`  stop:     touch "${path.join(STATE_DIR, 'STOP')}"`);
const child = spawn('claude', claudeArgs, { cwd: CLONE, env, stdio: ['ignore', transcript, transcript] });
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => child.kill(sig));

const ledger = path.join(RUN_DIR, 'ledger.md');
let shown = fs.existsSync(ledger) ? fs.readFileSync(ledger, 'utf8').split('\n').length : 0;
const tick = setInterval(() => {
  if (!fs.existsSync(ledger)) return;
  const lines = fs.readFileSync(ledger, 'utf8').split('\n');
  // The file tools rewrite the whole file, so track lines, not bytes; skip the unfinished last line.
  for (const line of lines.slice(Math.min(shown, lines.length), -1)) if (line.startsWith('### ')) console.log(`  ${line.slice(4)}`);
  shown = Math.max(lines.length - 1, 0);
}, 5000);

// The `result` events this launch wrote, oldest first.
function launchResults() {
  let text;
  try {
    text = fs.readFileSync(transcriptPath, 'utf8').slice(transcriptStart);
  } catch (err) {
    console.error(`autopilot-run: could not read the transcript: ${err.message}`);
    return [];
  }
  const results = [];
  for (const line of text.split('\n')) {
    try {
      const ev = JSON.parse(line);
      if (ev.type === 'result') results.push(ev);
    } catch { /* stderr lines interleave with the JSON stream */ }
  }
  return results;
}

// Appends this launch to result.json in the state folder. The run can't record its own cost,
// because it ends before its last turn is billed, so the launcher records it.
function recordLaunch(code, cost) {
  const file = path.join(STATE_DIR, 'result.json');
  const launches = readJsonOr(file, { launches: [] }).launches;
  const all = [...launches, { endedAt: new Date().toISOString(), exitCode: code, costUsd: cost }];
  writePrivate(file, JSON.stringify({ launches: all, totalCostUsd: all.reduce((a, l) => a + (l.costUsd ?? 0), 0) }, null, 2));
  return all;
}

function finish(code) {
  clearInterval(tick);
  fs.rmSync(lockFile, { force: true });
  let open = [{ id: '(state.json unreadable)' }];
  try {
    open = JSON.parse(fs.readFileSync(path.join(RUN_DIR, 'state.json'), 'utf8')).steps.filter((s) => !TERMINAL.has(s.status));
  } catch (err) {
    console.error(`autopilot-run: could not read state.json: ${err.message}`);
  }
  const report = path.join(RUN_DIR, 'report.md');
  const results = launchResults();
  const cost = launchCost(results);
  let launches = [];
  try {
    launches = recordLaunch(code, cost);
  } catch (err) {
    console.error(`autopilot-run: could not write result.json: ${err.stack || err.message}`);
  }
  if (open.length || !fs.existsSync(report)) {
    // The session is gone, so nobody else can record why the run ended early.
    const result = results.at(-1);
    const why = fs.existsSync(path.join(STATE_DIR, 'STOP')) ? 'user STOP file'
      : result ? `session ended: ${result.subtype ?? 'unknown'}${result.is_error ? ' (error)' : ''}` : `claude exited with code ${code}`;
    fs.appendFileSync(ledger, `\n### [end] STOP: ${why}; open steps: ${open.map((s) => s.id).join(', ') || 'none'}${fs.existsSync(report) ? '' : '; no report.md'}\n`);
  }
  const costText = costLine(cost, launches, path.join(STATE_DIR, 'result.json'));
  // ORDER: before the branch is fetched back, so the fetched branch carries the cost.
  if (fs.existsSync(report)) {
    try {
      recordCostInReport({ report, clone: CLONE, line: costText, message: `docs: autopilot ${runId} cost` });
    } catch (err) {
      console.error(`autopilot-run: could not write the cost into report.md: ${String(err.stderr || '').trim() || err.stack || err.message}`);
    }
  }
  let fetched = '';
  try {
    execFileSync('git', ['-C', approved.sourceRepo, 'fetch', '--quiet', CLONE, `${branch}:${branch}`], { stdio: 'pipe' });
    fetched = `  branch ${branch} is now in ${approved.sourceRepo}`;
  } catch (err) {
    fetched = `  could not fetch ${branch} into ${approved.sourceRepo}: ${String(err.stderr || err.message).trim()}\n  fetch it by hand: git -C "${approved.sourceRepo}" fetch "${CLONE}" ${branch}:${branch}`;
  }
  console.log(`\nautopilot ${runId} ended (exit ${code}).`);
  console.log(fs.existsSync(report) ? `  report: ${report}` : '  no report.md; see the ledger and transcript.jsonl');
  console.log(`  cost:     ${costText}`);
  console.log(fetched);
  process.stdout.write('\x07');
  process.exit(code ?? 1);
}

child.on('error', (err) => {
  console.error(`autopilot-run: could not start claude: ${err.stack || err.message}`);
  finish(1);
});
child.on('exit', (code) => finish(code));
