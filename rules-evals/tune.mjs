// Propose / probe / select for rule files, after harness2's task-level loop (github.com/google-research/harness2).
// SECURITY: writes under rules/ only with --apply, only a tuned rule file, and only after its winner passes a fresh
// confirmation on bundle copies. ~/.claude/rules links to rules/, so an applied file is live in every new session.
// Usage: node rules-evals/tune.mjs [--target <rule>] [--goal fix|trim] [--k 3] [--runs 2] [--guard-runs 1]
//        [--cases a,b] [--model sonnet] [--proposer sonnet] [--concurrency 4] [--max-spend 15] [--apply] [--confirm-runs 5]
// Without --target it tunes every rule that a selected case covers, one after another, against one shared baseline.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CASES } from './cases.mjs';
import { HERE, REPO, RULES_DIR, parseArgs, makeRunDirs, buildBundle, runCase, ask, pool, logLine } from './lib.mjs';

// MAGIC: rules load into every session, so a fix may grow the file by at most 15% and shrink it by at most 10%;
// a trim may not cut below half, which stops a gutted file from winning on cases that exercise only part of it.
const MAX_GROWTH = 1.15;
const MIN_FIX = 0.9;
const MIN_TRIM = 0.5;
// MAGIC: --apply writes a live rule, so the winner must beat the baseline by 2+ confirmation passes, not 1 lucky one.
const CONFIRM_MARGIN = 2;
// MAGIC: about $0.17 per sonnet run measured on 2026-10-15; only for the "budget too small" warning.
const TYPICAL_RUN_USD = 0.17;
// MAGIC: per-run caps from runCase (--max-budget-usd 0.5) and ask() (1); used only for the worst-case estimate.
const RUN_CAP_USD = 0.5;
const ASK_CAP_USD = 1;

const opts = parseArgs({ target: '', goal: 'fix', k: '3', runs: '2', 'guard-runs': '1', cases: '', model: 'sonnet', proposer: 'sonnet', concurrency: '4', 'max-spend': '15', apply: '', 'confirm-runs': '5' });
const fail = (msg) => { console.error(msg); process.exit(2); };
const posInt = (v, flag) => (/^[1-9]\d*$/.test(String(v)) ? Number(v) : fail(`--${flag} must be a positive integer (got "${v}")`));
if (!['fix', 'trim'].includes(opts.goal)) fail('--goal must be fix or trim');
const K = posInt(opts.k, 'k');
const RUNS = posInt(opts.runs, 'runs');
const GUARD_RUNS = posInt(opts['guard-runs'], 'guard-runs');
const CONCURRENCY = posInt(opts.concurrency, 'concurrency');
const MAX_SPEND = Number(opts['max-spend']);
if (!Number.isFinite(MAX_SPEND) || MAX_SPEND <= 0) fail(`--max-spend must be a positive number (got "${opts['max-spend']}")`);
const APPLY = opts.apply === 'true';
const CONFIRM_RUNS = posInt(opts['confirm-runs'], 'confirm-runs');
const wanted = opts.cases ? opts.cases.split(',') : null;
const unknown = (wanted ?? []).filter((n) => !CASES.some((c) => c.name === n));
if (unknown.length) fail(`unknown case(s): ${unknown.join(', ')}`);
const cases = CASES.filter((c) => !wanted || wanted.includes(c.name));
const STRATEGIES = {
  fix: [
    'Sharpen: make the instruction the agent skipped impossible to miss. Move it up, state it as one direct imperative, cut hedges around it.',
    'Example: add one short, concrete example or red-flag line drawn from the observed failure. Generalize it; do not name the test task.',
    'Restructure: express the relevant guidance as a conditional keyed to an observable predicate, or as a short checklist the agent runs before replying.',
  ],
  trim: [
    'Cut redundancy: remove sentences that repeat another sentence in this file, keeping the strongest phrasing.',
    'Compress: shorten examples and rationale to the minimum that still carries the rule; keep every prohibition and enforcement line.',
    'Merge: fold small sections that say related things into one section with one heading.',
  ],
}[opts.goal];
if (K > STRATEGIES.length) fail(`--k is at most ${STRATEGIES.length}, one candidate per strategy`);
const LESSONS = path.join(HERE, 'LESSONS.md');
const normalize = (s) => s.trimEnd() + '\n';

// Splits a rule file at its `## ` headings; text before the first one is keyed '(preamble)'.
function sections(text) {
  const map = new Map();
  let key = '(preamble)';
  let buf = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) { map.set(key, buf.join('\n').trimEnd()); key = line.slice(3).trim(); buf = []; }
    buf.push(line);
  }
  map.set(key, buf.join('\n').trimEnd());
  return map;
}

// Returns the rule's tuning context, or { skip } explaining why it can't be tuned in this run.
function prepareRule(name) {
  const rel = path.join(RULES_DIR, `${name}.md`);
  // ASSUMPTION: each case's free-text `rule` starts with the rule file's name (see cases.mjs).
  const covering = cases.filter((c) => c.rule.startsWith(`${name} `) || c.rule === name);
  if (covering.length === 0) return { name, skip: 'no selected case covers it; add one to cases.mjs' };
  const original = fs.readFileSync(path.join(REPO, rel), 'utf8');
  const originalSections = sections(original);
  const stale = covering.flatMap((c) => (c.sections ?? []).filter((h) => !originalSections.has(h)).map((h) => `${c.name}: "${h}"`));
  if (stale.length) fail(`cases.mjs names sections missing from ${rel} (update the case): ${stale.join('; ')}`);
  // Only sections a covering case would catch may change; the rest must come back unchanged (fix may add new ones).
  const editable = [...new Set(covering.flatMap((c) => c.sections ?? []))];
  if (opts.goal === 'trim' && editable.length === 0) return { name, skip: 'no covering case declares sections, so a trim would be untested' };
  // Applying over uncommitted edits would mix them into the result and make `git checkout` an unsafe undo.
  if (APPLY && execFileSync('git', ['status', '--porcelain', '--', rel], { cwd: REPO }).toString().trim()) {
    return { name, skip: `--apply needs ${rel} committed and unchanged; commit or stash your edits first` };
  }
  const frozen = [...originalSections.keys()].filter((h) => !editable.includes(h));
  return { name, rel, original, originalSections, covering, editable, frozen };
}

const allRules = fs.readdirSync(path.join(REPO, RULES_DIR)).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).sort();
let rules;
if (opts.target) {
  const name = path.basename(opts.target, '.md');
  if (!allRules.includes(name)) fail(`--target must name a file in ${RULES_DIR}/ (got "${opts.target}")`);
  const r = prepareRule(name);
  if (r.skip) fail(`${name}: ${r.skip}`);
  rules = [r];
} else {
  const prepared = allRules.map(prepareRule);
  for (const r of prepared.filter((x) => x.skip)) console.log(`skip ${r.name}: ${r.skip}`);
  rules = prepared.filter((r) => !r.skip);
  if (rules.length === 0) fail('no rule can be tuned with the selected cases');
}

// A candidate re-runs its own rule's cases at --runs and every other selected case at --guard-runs.
const runsFor = (rule, c) => (rule.covering.includes(c) ? RUNS : GUARD_RUNS);
const probeRuns = (rule) => cases.reduce((n, c) => n + runsFor(rule, c), 0);
// The baseline runs a case at --runs when some tuned rule covers it, else at --guard-runs like the candidates.
const baseRuns = (c) => (rules.some((r) => r.covering.includes(c)) ? RUNS : GUARD_RUNS);
const baseTotal = cases.reduce((n, c) => n + baseRuns(c), 0);
const perRule = (rule) => K * probeRuns(rule) + (APPLY ? 2 * rule.covering.length * CONFIRM_RUNS : 0);
const totalRuns = baseTotal + rules.reduce((n, r) => n + perRule(r), 0);
const worst = totalRuns * RUN_CAP_USD + rules.length * K * ASK_CAP_USD;
console.log(`tuning ${rules.length} rule(s) (${opts.goal}): ${rules.map((r) => r.name).join(', ')}`);
console.log(`up to ${totalRuns} runs + ${rules.length * K} proposals; worst case $${worst.toFixed(2)} at list price, stops starting runs past $${MAX_SPEND}`);
console.log('(on a Pro/Max plan the dollars are a list-price estimate of how much of your usage limit this takes)');
const firstRule = (baseTotal + perRule(rules[0])) * TYPICAL_RUN_USD;
if (firstRule > MAX_SPEND) console.log(`WARNING: the baseline plus one rule typically costs about $${firstRule.toFixed(2)}, over --max-spend $${MAX_SPEND}; the first rule will likely stop half-probed. Raise --max-spend or narrow --cases.`);

const { out: OUT, work: WORK } = makeRunDirs(opts.target ? `-tune-${rules[0].name}` : `-tune-all-${opts.goal}`);
let spent = 0;
const track = (r) => { spent += r.cost; console.log(logLine(r)); };
const overBudget = () => spent >= MAX_SPEND;
const job = (c, arm, run, bundlePath) => () => runCase(c, { arm, run, bundlePath, model: opts.model, work: WORK, out: OUT });

function finish(lines) {
  fs.writeFileSync(path.join(OUT, 'summary.txt'), lines.join('\n') + '\n');
  console.log('\n' + lines.join('\n'));
}

try {
  // ORDER: snapshot before anything is applied, so every rule is tuned and confirmed against the same starting rules.
  const snapshot = path.join(WORK, 'snapshot');
  fs.cpSync(path.join(REPO, RULES_DIR), path.join(snapshot, RULES_DIR), { recursive: true });
  const baseBundle = path.join(OUT, 'baseline.md');
  fs.writeFileSync(baseBundle, buildBundle(snapshot));
  console.log(`\nbaseline: ${baseTotal} runs over ${cases.length} cases`);
  const baseResults = await pool(cases.flatMap((c) => Array.from({ length: baseRuns(c) }, (_, i) => job(c, 'baseline', i + 1, baseBundle))), CONCURRENCY, track, overBudget);
  fs.writeFileSync(path.join(OUT, 'baseline.json'), JSON.stringify(baseResults, null, 2));
  const baseInfra = baseResults.filter((r) => r.infra).length;
  if (baseInfra > 0 || baseResults.length < baseTotal) {
    finish([`baseline incomplete: ${baseInfra} infra failures, ${baseResults.length}/${baseTotal} runs (spend cap or errors). Nothing proposed; see transcripts.`, `total cost $${spent.toFixed(2)}`, `results: ${path.relative(REPO, OUT)}`]);
    process.exitCode = 1;
  } else {
    const basePass = Object.fromEntries(cases.map((c) => [c.name, baseResults.filter((r) => r.case === c.name && r.pass).length]));
    const outcomes = [];
    for (const rule of rules) {
      if (overBudget()) { outcomes.push(`${rule.name}: not reached (spend cap)`); continue; }
      try {
        outcomes.push(await tuneRule(rule, baseResults, basePass, baseBundle, snapshot));
      } catch (e) {
        // One rule's failure must not hide what earlier rules already applied.
        console.error(`[tune] ${rule.name} failed:`, e);
        outcomes.push(`${rule.name}: ERROR ${e.message}`);
      }
    }
    finish([
      `goal=${opts.goal} k=${K} runs=${RUNS} guard-runs=${GUARD_RUNS} model=${opts.model} proposer=${opts.proposer}${APPLY ? ` apply confirm-runs=${CONFIRM_RUNS}` : ''}`,
      `baseline: ${baseResults.filter((r) => r.pass).length}/${baseResults.length} runs pass`,
      '',
      ...outcomes,
      ...(APPLY && rules.length > 1 ? ['', 'Each applied rule was confirmed on its own against the starting rules; how applied rules interact was not tested. Run run.mjs --runs 5 before committing.'] : []),
      `total cost $${spent.toFixed(2)}`,
      `results: ${path.relative(REPO, OUT)}`,
    ]);
  }
} finally {
  fs.rmSync(WORK, { recursive: true, force: true });
}

async function tuneRule(rule, baseResults, basePass, baseBundle, snapshot) {
  const { name, rel, original, originalSections, covering, editable, frozen } = rule;
  const isCovering = (r) => covering.some((c) => c.name === r.case);
  const failures = baseResults.filter((r) => !r.pass && !r.infra && isCovering(r));
  const base = { pass: baseResults.filter((r) => r.pass && isCovering(r)).length, ctx: baseResults.filter((r) => r.contextBlock && isCovering(r)).length };
  const tTotal = covering.length * RUNS;
  if (opts.goal === 'fix' && failures.length === 0) return `${name}: nothing to fix (${base.pass}/${tTotal})`;
  // A derived case tests a rule's prohibition without a recorded incident; its failure may come from the case itself.
  const derivedOnly = opts.goal === 'fix'
    && failures.every((r) => /^derived/.test(cases.find((c) => c.name === r.case)?.source ?? ''));
  const derivedNote = derivedOnly ? ' CAUTION: every failure came from a derived case; read its transcript before trusting this fix.' : '';

  const dir = path.join(OUT, name);
  fs.mkdirSync(dir, { recursive: true });
  console.log(`\n== ${name}: covering ${covering.map((c) => c.name).join(', ')}${opts.goal === 'trim' ? `; editable: ${editable.join(' | ')}` : ''}`);

  // ASSUMPTION: lesson headers are the only lines starting "## " in LESSONS.md; tune.mjs writes them that way.
  const pastLessons = fs.existsSync(LESSONS)
    ? fs.readFileSync(LESSONS, 'utf8').split('\n## ').filter((s) => s.split('\n')[0].includes(`\`${name}\``)).slice(-5).join('\n## ')
    : '';
  // MAGIC: 8 failures × 500 reply chars keeps the proposer prompt small while still showing what went wrong.
  const failureText = failures.slice(0, 8).map((r) => {
    const c = cases.find((x) => x.name === r.case);
    return `- task given to the agent: "${c.prompt}"; failed because: ${r.why}; tools used: ${r.tools.join(',') || 'none'}; reply start: ${JSON.stringify(r.text.slice(0, 500))}`;
  }).join('\n');
  const keepPassing = covering.filter((c) => basePass[c.name] === RUNS).map((c) => `"${c.prompt}"`).join('; ') || 'none';
  const maxChars = Math.floor(original.length * MAX_GROWTH);
  const minChars = Math.ceil(original.length * (opts.goal === 'trim' ? MIN_TRIM : MIN_FIX));
  const sizeRule = opts.goal === 'trim'
    ? `The new file MUST be shorter than ${original.length} characters and at least ${minChars}.`
    : `Keep the new file between ${minChars} and ${maxChars} characters. Every rule here is loaded into every session, so length costs on every request.`;
  const changedFrozen = (body) => {
    const got = sections(body);
    return frozen.filter((h) => got.get(h) !== originalSections.get(h));
  };

  const proposerPrompt = (strategy) => [
    `You are editing one file of a rule set that is appended to a coding agent's system prompt in every session. File: ${rel}.`,
    opts.goal === 'fix'
      ? 'Goal: change this file so the agent stops making the failures below, without breaking behavior that currently works.'
      : 'Goal: make this file shorter without changing the behavior it produces.',
    '',
    'Observed failures (from scored test runs):',
    failureText || '(none)',
    '',
    `Tasks the agent currently handles correctly and must keep handling: ${keepPassing}.`,
    pastLessons ? `\nScored results of earlier tuning attempts on this file (unconfirmed small samples; learn from what won and lost):\n## ${pastLessons}` : '',
    '',
    editable.length
      ? `Edit ONLY these sections: ${editable.map((h) => (h === '(preamble)' ? 'the text before the first "## " heading' : `"## ${h}"`)).join(', ')}. Copy every other section${editable.includes('(preamble)') ? '' : ', and the text before the first "## " heading,'} exactly as it is, character for character.${opts.goal === 'fix' ? ' You may add a new "## " section.' : ''}`
      : 'Do not change any existing text. Add one new "## " section with the guidance.',
    `Strategy for this candidate: ${strategy}`,
    'Constraints: change only what the strategy needs; keep the file\'s headings, tags and cross-references unless the strategy requires otherwise; do not mention tests, cases or graders.',
    sizeRule,
    '',
    'Current file:',
    '<<<CURRENT',
    original,
    'CURRENT>>>',
    '',
    'Reply with the complete new file between a line <<<FILE and a line FILE>>>, then one line starting "WHY:" saying what you changed.',
  ].join('\n');

  const askDir = path.join(WORK, `proposer-${name}`);
  fs.mkdirSync(askDir);
  console.log(`proposing ${K} candidates with ${opts.proposer}`);
  const proposals = await Promise.all(STRATEGIES.slice(0, K).map(async (strategy, i) => {
    const r = await ask(proposerPrompt(strategy), { model: opts.proposer, cwd: askDir, budget: String(ASK_CAP_USD) });
    spent += r.cost;
    // ASSUMPTION: a rule file never contains a line "FILE>>>", so the first one closes the block.
    const m = r.text.match(/<<<FILE\n([\s\S]*?)\nFILE>>>/);
    const body = m ? normalize(m[1]) : '';
    const why = m ? ((r.text.slice(m.index + m[0].length).match(/^WHY:\s*(.+)$/m) || [])[1] ?? '') : '';
    const invalid = r.error
      ?? (!m ? 'no <<<FILE block in reply'
        : body === normalize(original) ? 'no change'
          : changedFrozen(body).length ? `changed untested section(s): ${changedFrozen(body).join(' | ')}`
            : opts.goal === 'trim' && (body.length >= original.length || body.length < minChars) ? `size out of range (${body.length} chars)`
              : opts.goal === 'fix' && (body.length > maxChars || body.length < minChars) ? `size out of range (${body.length} chars)`
                : null);
    return { id: i + 1, strategy: strategy.split(':')[0], body, why, invalid };
  }));

  const jobs = [];
  for (const p of proposals) {
    fs.writeFileSync(path.join(dir, `candidate-${p.id}.md`), p.body || `(invalid: ${p.invalid})\n`);
    if (p.invalid) { console.log(`candidate ${p.id} (${p.strategy}) invalid: ${p.invalid}`); continue; }
    const tree = path.join(WORK, `cand-${name}-${p.id}`);
    fs.cpSync(snapshot, tree, { recursive: true });
    fs.writeFileSync(path.join(tree, rel), p.body);
    p.bundle = path.join(dir, `candidate-${p.id}.bundle.md`);
    fs.writeFileSync(p.bundle, buildBundle(tree));
    writeDiff(rel, path.join(dir, `candidate-${p.id}`));
    for (const c of cases) for (let i = 1; i <= runsFor(rule, c); i++) jobs.push(job(c, `${name}-cand${p.id}`, i, p.bundle));
  }
  console.log(`probing ${proposals.filter((p) => !p.invalid).length} candidates`);
  const candResults = await pool(jobs, CONCURRENCY, track, overBudget);
  fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(candResults, null, 2));

  // A winner must pass more covering-case runs than the baseline (trim: as many, shorter), must not fail any run of
  // a case that passed every baseline run, and needs a complete, infra-clean probe.
  for (const p of proposals.filter((x) => !x.invalid)) {
    const rs = candResults.filter((r) => r.arm === `${name}-cand${p.id}`);
    p.pass = rs.filter((r) => r.pass && isCovering(r)).length;
    p.ctx = rs.filter((r) => r.contextBlock && isCovering(r)).length;
    p.chars = p.body.length;
    p.perCase = Object.fromEntries(cases.map((c) => [c.name, rs.filter((r) => r.case === c.name && r.pass).length]));
    p.regressed = cases.filter((c) => !c.noisy && basePass[c.name] === baseRuns(c) && p.perCase[c.name] < runsFor(rule, c)).map((c) => c.name);
    p.incomplete = rs.some((r) => r.infra) || rs.length < probeRuns(rule);
    p.eligible = !p.incomplete && p.regressed.length === 0 && (opts.goal === 'fix'
      ? p.pass > base.pass
      : p.pass >= base.pass && p.chars < original.length);
  }
  const rank = opts.goal === 'trim'
    ? (a, b) => b.pass - a.pass || a.chars - b.chars || b.ctx - a.ctx
    : (a, b) => b.pass - a.pass || b.ctx - a.ctx || a.chars - b.chars;
  const winner = proposals.filter((p) => p.eligible).sort(rank)[0];
  const applied = APPLY && winner ? await confirmAndApply(rule, winner, baseBundle) : null;

  const note = (p) => [p.incomplete ? 'incomplete (infra failure or spend cap)' : '', p.regressed.length ? `regressed: ${p.regressed.join(',')}` : '', p.why].filter(Boolean).join('; ');
  const diffPath = winner && path.relative(REPO, path.join(dir, `candidate-${winner.id}.diff`));
  const verdict = applied?.ok
    ? `${applied.line} Review ${diffPath}, then commit ${rel} and rules-evals/LESSONS.md together. Undo: git checkout ${rel}`
    : applied ? applied.line
      : winner ? `winner (unconfirmed, ${RUNS} runs per case): candidate ${winner.id}. Review ${diffPath}; apply with cp ${path.relative(REPO, path.join(dir, `candidate-${winner.id}.md`))} ${rel}, or re-run with --apply`
        : 'no winner: no candidate beat the baseline cleanly. Rule unchanged.';
  const flagged = winner ? verdict + derivedNote : verdict;
  fs.writeFileSync(path.join(dir, 'summary.txt'), [
    `target=${rel} covering: ${covering.map((c) => c.name).join(', ')}${opts.goal === 'trim' ? `; editable: ${editable.join(' | ')}` : ''}`,
    '',
    'arm | covering pass | context block | chars | note',
    `baseline | ${base.pass}/${tTotal} | ${base.ctx}/${tTotal} | ${original.length} |`,
    ...proposals.map((p) => p.invalid
      ? `cand${p.id} (${p.strategy}) | - | - | - | invalid: ${p.invalid}`
      : `cand${p.id} (${p.strategy}) | ${p.pass}/${tTotal} | ${p.ctx}/${tTotal} | ${p.chars} | ${note(p)}`),
    '',
    flagged,
  ].join('\n') + '\n');

  if (!fs.existsSync(LESSONS)) fs.writeFileSync(LESSONS, '# Tuning lessons\n\nAppended by tune.mjs after each run; the proposer reads the latest entries for its target file. Scores are small samples, not confirmed results.\n');
  fs.appendFileSync(LESSONS, [
    `\n## ${new Date().toISOString().slice(0, 10)} \`${name}\` (${opts.goal}, ${opts.model}, ${RUNS} runs × ${covering.length} covering cases, ${GUARD_RUNS} × ${cases.length - covering.length} guards)`,
    `- baseline: ${base.pass}/${tTotal} covering-case passes; failures: ${[...new Set(failures.map((r) => `${r.case} (${r.why})`))].join('; ') || 'none'}`,
    ...proposals.map((p) => p.invalid
      ? `- ${p.strategy}: invalid (${p.invalid})`
      : `- ${p.strategy}: ${p.pass}/${tTotal}, ${p.chars} chars${p.incomplete ? ', incomplete' : ''}${p.regressed.length ? `, regressed ${p.regressed.join(',')}` : ''}${p === winner ? ' — best (unconfirmed)' : ''}. ${p.why}`),
    `- outcome: ${!winner ? 'no winner' : applied ? applied.lesson : `candidate ${winner.id} offered for review, not applied`}${derivedOnly ? ' (failures from derived cases only)' : ''}`,
  ].join('\n') + '\n');

  return `${name}: ${flagged}`;
}

function writeDiff(rel, stem) {
  const args = ['diff', '--no-index', '--no-color', '--no-ext-diff', '--', rel, path.relative(REPO, `${stem}.md`)];
  let diff = '';
  try {
    diff = execFileSync('git', args, { cwd: REPO }).toString();
  } catch (e) {
    // EXTERNAL: git diff --no-index exits 1 when the files differ; any other status is a real error.
    if (e.status !== 1) throw e;
    diff = e.stdout.toString();
  }
  fs.writeFileSync(`${stem}.diff`, diff);
}

// Re-runs the rule's covering cases for baseline and winner with fresh, larger samples so one lucky pass can't
// decide what goes live, then writes the winner into rules/ only if it holds up. Guards were checked in the probe.
async function confirmAndApply(rule, winner, baseBundle) {
  const { name, rel, original, covering } = rule;
  console.log(`confirming ${name} candidate ${winner.id}: ${CONFIRM_RUNS} fresh runs per covering case, baseline and winner`);
  const jobs = covering.flatMap((c) => Array.from({ length: CONFIRM_RUNS }, (_, i) => [
    job(c, `${name}-confirm-base`, i + 1, baseBundle), job(c, `${name}-confirm-win`, i + 1, winner.bundle)]).flat());
  const rs = await pool(jobs, CONCURRENCY, track, overBudget);
  fs.writeFileSync(path.join(OUT, name, 'confirm.json'), JSON.stringify(rs, null, 2));
  const arm = (a) => rs.filter((r) => r.arm === `${name}-confirm-${a}`);
  const passes = (a) => arm(a).filter((r) => r.pass).length;
  const full = covering.length * CONFIRM_RUNS;
  const scores = `baseline ${passes('base')}/${full}, winner ${passes('win')}/${full}`;
  const regressed = covering.filter((c) => !c.noisy && arm('base').filter((r) => r.case === c.name && r.pass).length === CONFIRM_RUNS
    && arm('win').filter((r) => r.case === c.name && r.pass).length < CONFIRM_RUNS).map((c) => c.name);
  const reason = rs.some((r) => r.infra) || rs.length < 2 * full ? `incomplete (infra failure or spend cap, ${rs.length}/${2 * full} runs)`
    : regressed.length ? `regressed: ${regressed.join(',')}`
      : opts.goal === 'fix' && passes('win') - passes('base') < CONFIRM_MARGIN ? `beats the baseline by less than ${CONFIRM_MARGIN} passes`
        : opts.goal === 'trim' && passes('win') < passes('base') ? 'scores below the baseline'
          : fs.readFileSync(path.join(REPO, rel), 'utf8') !== original ? `${rel} changed during the run`
            : null;
  if (reason) {
    return { ok: false, line: `confirmation failed (${scores}): ${reason}. ${rel} left unchanged.`, lesson: `candidate ${winner.id} failed confirmation (${scores}; ${reason}), not applied` };
  }
  fs.writeFileSync(path.join(REPO, rel), winner.body);
  return { ok: true, line: `confirmed (${scores}) and APPLIED candidate ${winner.id} to ${rel}; it is live in new sessions now.`, lesson: `candidate ${winner.id} confirmed (${scores}) and applied` };
}
