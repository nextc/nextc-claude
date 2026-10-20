// Shared by run.mjs (before/after) and tune.mjs (propose/probe/select).
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hasContextBlock } from './cases.mjs';

export const HERE = path.dirname(new URL(import.meta.url).pathname);
export const REPO = path.dirname(HERE);
export const RULES_DIR = 'rules/nextc-claude';

// A flag followed by another flag, or by nothing, is a boolean and reads as 'true'.
export function parseArgs(defaults) {
  const opts = { ...defaults };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) opts[key] = 'true';
    else { opts[key] = next; i++; }
  }
  return opts;
}

export function makeRunDirs(suffix = '') {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = path.join(HERE, 'results', stamp + suffix);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'nextc-rules-evals-'));
  fs.mkdirSync(path.join(out, 'transcripts'), { recursive: true });
  return { out, work };
}

export function extractRules(ref, dest) {
  fs.mkdirSync(dest, { recursive: true });
  execSync(`git archive ${JSON.stringify(ref)} ${RULES_DIR} | tar -x -C ${JSON.stringify(dest)}`, { cwd: REPO });
}

// The bundle mirrors what a session loads: every .md under rules/nextc-claude/ (subfolders too),
// plus the user's global CLAUDE.md when present, identical in every arm.
export function buildBundle(rulesRoot) {
  const globalMd = path.join(os.homedir(), '.claude', 'CLAUDE.md');
  const parts = fs.existsSync(globalMd) ? [fs.readFileSync(globalMd, 'utf8')] : [];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((d) =>
    d.isDirectory() ? walk(path.join(dir, d.name)) : d.name.endsWith('.md') ? [path.join(dir, d.name)] : []);
  for (const f of walk(path.join(rulesRoot, RULES_DIR))) {
    parts.push(`Contents of ${path.relative(rulesRoot, f)}:\n\n${fs.readFileSync(f, 'utf8')}`);
  }
  return parts.join('\n\n');
}

function setupFixture(dir, files) {
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  }
  execSync('git init -q -b main && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm init', { cwd: dir });
}

function parseEvents(out) {
  return out.split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
}

// Runs one case against one rules bundle in a fresh fixture repo and grades it.
export function runCase(c, { arm, run, bundlePath, model, work, out }) {
  const id = `${c.name}-${arm}-${run}`;
  const dir = path.join(work, id);
  setupFixture(dir, c.files);
  // EXTERNAL: `--setting-sources project`, run from a fixture with no CLAUDE.md, keeps ~/.claude/rules/ out of the
  // child, so the appended bundle is the only rule text it sees (checked with Claude Code 2.1.300).
  const args = [
    '-p', '--model', model, '--setting-sources', 'project', '--no-session-persistence',
    '--output-format', 'stream-json', '--verbose', '--max-budget-usd', '0.5',
    '--append-system-prompt-file', bundlePath,
    '--allowedTools', ...c.tools,
  ];
  return new Promise((resolve) => {
    const child = spawn('claude', args, { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    // ORDER: the prompt goes on stdin; a variadic flag such as --allowedTools would swallow a trailing prompt argument.
    child.stdin.end(c.prompt);
    child.on('close', (code) => {
      fs.writeFileSync(path.join(out, 'transcripts', `${id}.jsonl`), stdout);
      const events = parseEvents(stdout);
      const toolNames = events
        .filter((e) => e.type === 'assistant')
        .flatMap((e) => e.message?.content ?? [])
        .filter((b) => b.type === 'tool_use')
        .map((b) => b.name);
      const result = events.find((e) => e.type === 'result');
      const text = result?.result ?? '';
      // infra marks runs that say nothing about the rules (crash, budget cap, rate limit, broken grader).
      let verdict;
      let infra = false;
      try {
        verdict = result ? c.grade({ toolNames, text, dir }) : [false, `no result (exit ${code}): ${stderr.slice(0, 200)}`];
        infra = !result;
      } catch (e) {
        verdict = [false, `grader error: ${e.message}`];
        infra = true;
      }
      resolve({ case: c.name, arm, run, pass: verdict[0], why: verdict[1], infra, contextBlock: hasContextBlock(text), tools: toolNames, cost: result?.total_cost_usd ?? 0, text });
    });
    child.on('error', (e) => resolve({ case: c.name, arm, run, pass: false, why: `spawn failed: ${e.message}`, infra: true, contextBlock: false, tools: [], cost: 0, text: '' }));
  });
}

// One tool-less `claude -p` call that returns plain text, for proposing edits.
// EXTERNAL: relies on Claude Code's `--output-format json` result shape (result, total_cost_usd, is_error) and on
// `--tools ""` disabling every tool (claude --help, Claude Code 2.1.304).
export function ask(prompt, { model, cwd, budget = '1' }) {
  const args = ['-p', '--model', model, '--setting-sources', 'project', '--no-session-persistence',
    '--output-format', 'json', '--max-budget-usd', budget, '--tools', ''];
  return new Promise((resolve) => {
    const child = spawn('claude', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.stdin.end(prompt);
    child.on('close', (code) => {
      try {
        const r = JSON.parse(stdout);
        resolve({ text: r.result ?? '', cost: r.total_cost_usd ?? 0, error: r.is_error ? r.result : null });
      } catch {
        resolve({ text: '', cost: 0, error: `no JSON result (exit ${code}): ${stderr.slice(0, 200)}` });
      }
    });
    child.on('error', (e) => resolve({ text: '', cost: 0, error: `spawn failed: ${e.message}` }));
  });
}

// shouldStop() is checked before each job, so a spend cap stops new runs but lets running ones finish.
export async function pool(jobs, concurrency, onDone, shouldStop = () => false) {
  const results = [];
  let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < jobs.length && !shouldStop()) {
      const r = await jobs[next++]();
      results.push(r);
      onDone?.(r);
    }
  }));
  return results;
}

export const frac = (rs, pred) => `${rs.filter(pred).length}/${rs.length}`;
export const logLine = (r) => `${r.pass ? 'PASS' : 'FAIL'} ${r.case} ${r.arm}#${r.run} — ${r.why} [${r.tools.join(',')}] $${r.cost.toFixed(3)}`;
