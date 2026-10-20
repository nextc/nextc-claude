// Propose / probe / select for one rule file, after harness2's task-level loop (github.com/google-research/harness2).
// SECURITY: never writes under rules/. Candidates and diffs go to results/; a person reviews and applies them.
// Usage: node rules-evals/tune.mjs --target <rule> [--goal fix|trim] [--k 3] [--runs 2] [--cases a,b]
//        [--model sonnet] [--proposer sonnet] [--concurrency 4] [--max-spend 15]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CASES } from './cases.mjs';
import { HERE, REPO, RULES_DIR, parseArgs, makeRunDirs, buildBundle, runCase, ask, pool, logLine } from './lib.mjs';

// MAGIC: rules load into every session, so a fix may grow the file by at most 15%; a trim may not cut below half,
// which stops a gutted file from winning on cases that only exercise part of it.
const MAX_GROWTH = 1.15;
const MIN_TRIM = 0.5;
// MAGIC: per-run caps from run.mjs (--max-budget-usd 0.5) and ask() (1); used only for the worst-case estimate.
const RUN_CAP_USD = 0.5;
const ASK_CAP_USD = 1;

const opts = parseArgs({ target: '', goal: 'fix', k: '3', runs: '2', cases: '', model: 'sonnet', proposer: 'sonnet', concurrency: '4', 'max-spend': '15' });
const fail = (msg) => { console.error(msg); process.exit(2); };
const posInt = (v, flag) => (/^[1-9]\d*$/.test(String(v)) ? Number(v) : fail(`--${flag} must be a positive integer (got "${v}")`));
const name = path.basename(opts.target || '', '.md');
const targetRel = path.join(RULES_DIR, `${name}.md`);
if (!name || !fs.existsSync(path.join(REPO, targetRel))) fail(`--target must name a file in ${RULES_DIR}/ (got "${opts.target}")`);
if (!['fix', 'trim'].includes(opts.goal)) fail('--goal must be fix or trim');
const K = posInt(opts.k, 'k');
const RUNS = posInt(opts.runs, 'runs');
const CONCURRENCY = posInt(opts.concurrency, 'concurrency');
const MAX_SPEND = Number(opts['max-spend']);
const wanted = opts.cases ? opts.cases.split(',') : null;
const unknown = (wanted ?? []).filter((n) => !CASES.some((c) => c.name === n));
if (unknown.length) fail(`unknown case(s): ${unknown.join(', ')}`);
const cases = CASES.filter((c) => !wanted || wanted.includes(c.name));
// ASSUMPTION: each case's free-text `rule` starts with the rule file's name (see cases.mjs).
const covers = (c) => c.rule.startsWith(name);
const targetCases = cases.filter(covers);
if (targetCases.length === 0) fail(`no selected case covers ${name}; add one to cases.mjs from a real failure first`);

const original = fs.readFileSync(path.join(REPO, targetRel), 'utf8');
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
const originalSections = sections(original);
const stale = targetCases.flatMap((c) => (c.sections ?? []).filter((h) => !originalSections.has(h)).map((h) => `${c.name}: "${h}"`));
if (stale.length) fail(`cases.mjs names sections missing from ${targetRel} (update the case): ${stale.join('; ')}`);
// Trim may only touch what a case would catch; every other section must come back unchanged.
const editable = [...new Set(targetCases.flatMap((c) => c.sections ?? []))];
const frozen = [...originalSections.keys()].filter((h) => !editable.includes(h));
if (opts.goal === 'trim' && editable.length === 0) fail(`no covering case declares sections; trim would be untested. Add sections to cases.mjs`);
const changedFrozen = (body) => {
  const got = sections(body);
  return frozen.filter((h) => got.get(h) !== originalSections.get(h));
};
const LESSONS = path.join(HERE, 'LESSONS.md');
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

const worst = (1 + K) * cases.length * RUNS * RUN_CAP_USD + K * ASK_CAP_USD;
console.log(`target ${targetRel}; covering cases: ${targetCases.map((c) => c.name).join(', ')}; guard cases: ${cases.length - targetCases.length}`);
if (opts.goal === 'trim') console.log(`editable sections: ${editable.join(' | ')}; ${frozen.length} other sections frozen`);
console.log(`up to ${(1 + K) * cases.length * RUNS} runs + ${K} proposals; worst case $${worst.toFixed(2)}, stops starting runs past $${MAX_SPEND}`);

const { out: OUT, work: WORK } = makeRunDirs(`-tune-${name}`);
let spent = 0;
const track = (r) => { spent += r.cost; console.log(logLine(r)); };
const overBudget = () => spent >= MAX_SPEND;
const probe = (arm, bundlePath) => cases.flatMap((c) => Array.from({ length: RUNS }, (_, i) =>
  () => runCase(c, { arm, run: i + 1, bundlePath, model: opts.model, work: WORK, out: OUT })));
const isTarget = (r) => targetCases.some((c) => c.name === r.case);
const score = (rs) => ({
  pass: rs.filter((r) => r.pass && isTarget(r)).length,
  ctx: rs.filter((r) => r.contextBlock).length,
  perCase: Object.fromEntries(cases.map((c) => [c.name, rs.filter((r) => r.case === c.name && r.pass).length])),
  infra: rs.filter((r) => r.infra).length,
  runs: rs.length,
});
const expected = cases.length * RUNS;

function finish(lines) {
  fs.writeFileSync(path.join(OUT, 'summary.txt'), lines.join('\n') + '\n');
  console.log('\n' + lines.join('\n'));
}

try {
  const baseBundle = path.join(OUT, 'baseline.md');
  fs.writeFileSync(baseBundle, buildBundle(REPO));
  const baseResults = await pool(probe('baseline', baseBundle), CONCURRENCY, track, overBudget);
  const base = score(baseResults);
  const failures = baseResults.filter((r) => !r.pass && !r.infra && isTarget(r));
  if (base.infra > 0 || base.runs < expected) {
    finish([`baseline incomplete: ${base.infra} infra failures, ${base.runs}/${expected} runs (spend cap or errors). Nothing proposed; see transcripts.`, `total cost $${spent.toFixed(2)}`, `results: ${path.relative(REPO, OUT)}`]);
    process.exitCode = 1;
  } else if (opts.goal === 'fix' && failures.length === 0) {
    finish([`baseline passed every run of the cases covering ${name}; nothing to fix. Try --goal trim.`, `total cost $${spent.toFixed(2)}`]);
  } else {
    await tune(base, baseResults, failures);
  }
} finally {
  fs.rmSync(WORK, { recursive: true, force: true });
}

async function tune(base, baseResults, failures) {
  // ASSUMPTION: lesson headers are the only lines starting "## " in LESSONS.md; tune.mjs writes them that way.
  const pastLessons = fs.existsSync(LESSONS)
    ? fs.readFileSync(LESSONS, 'utf8').split('\n## ').filter((s) => s.split('\n')[0].includes(`\`${name}\``)).slice(-5).join('\n## ')
    : '';
  // MAGIC: 8 failures × 500 reply chars keeps the proposer prompt small while still showing what went wrong.
  const failureText = failures.slice(0, 8).map((r) => {
    const c = cases.find((x) => x.name === r.case);
    return `- task given to the agent: "${c.prompt}"; failed because: ${r.why}; tools used: ${r.tools.join(',') || 'none'}; reply start: ${JSON.stringify(r.text.slice(0, 500))}`;
  }).join('\n');
  const keepPassing = cases.filter((c) => base.perCase[c.name] === RUNS).map((c) => `"${c.prompt}"`).join('; ') || 'none';
  const maxChars = Math.floor(original.length * MAX_GROWTH);
  const minChars = Math.ceil(original.length * MIN_TRIM);
  const sizeRule = opts.goal === 'trim'
    ? `The new file MUST be shorter than ${original.length} characters and at least ${minChars}.`
    : `Keep the new file at most ${maxChars} characters. Every rule here is loaded into every session, so length costs on every request.`;

  const proposerPrompt = (strategy) => [
    `You are editing one file of a rule set that is appended to a coding agent's system prompt in every session. File: ${targetRel}.`,
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
    opts.goal === 'trim'
      ? `Edit ONLY these sections (by their "## " heading): ${editable.map((h) => `"${h}"`).join(', ')}. Copy every other section, and the text before the first "## " heading, exactly as it is, character for character.`
      : '',
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

  const askDir = path.join(WORK, 'proposer');
  fs.mkdirSync(askDir);
  console.log(`\nproposing ${K} candidates with ${opts.proposer}`);
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
          : opts.goal === 'trim' && changedFrozen(body).length ? `changed untested section(s): ${changedFrozen(body).join(' | ')}`
            : opts.goal === 'trim' && (body.length >= original.length || body.length < minChars) ? `size out of range (${body.length} chars)`
            : opts.goal === 'fix' && body.length > maxChars ? `too long (${body.length} chars)`
              : null);
    return { id: i + 1, strategy: strategy.split(':')[0], body, why, invalid };
  }));

  const jobs = [];
  for (const p of proposals) {
    fs.writeFileSync(path.join(OUT, `candidate-${p.id}.md`), p.body || `(invalid: ${p.invalid})\n`);
    if (p.invalid) { console.log(`candidate ${p.id} (${p.strategy}) invalid: ${p.invalid}`); continue; }
    const tree = path.join(WORK, `cand-${p.id}`);
    fs.cpSync(path.join(REPO, RULES_DIR), path.join(tree, RULES_DIR), { recursive: true });
    fs.writeFileSync(path.join(tree, targetRel), p.body);
    const bundlePath = path.join(OUT, `candidate-${p.id}.bundle.md`);
    fs.writeFileSync(bundlePath, buildBundle(tree));
    writeDiff(p.id);
    jobs.push(...probe(`cand${p.id}`, bundlePath));
  }
  console.log(`\nprobing ${proposals.filter((p) => !p.invalid).length} candidates`);
  const candResults = await pool(jobs, CONCURRENCY, track, overBudget);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify([...baseResults, ...candResults], null, 2));

  // A winner must pass more runs of the covering cases than the baseline (trim: as many, shorter), keep every
  // case that passed all baseline runs, and have a complete, infra-clean probe.
  for (const p of proposals.filter((x) => !x.invalid)) {
    Object.assign(p, score(candResults.filter((r) => r.arm === `cand${p.id}`)), { chars: p.body.length });
    p.regressed = cases.filter((c) => base.perCase[c.name] === RUNS && p.perCase[c.name] < RUNS).map((c) => c.name);
    p.incomplete = p.infra > 0 || p.runs < expected;
    p.eligible = !p.incomplete && p.regressed.length === 0 && (opts.goal === 'fix'
      ? p.pass > base.pass
      : p.pass >= base.pass && p.chars < original.length);
  }
  const winner = proposals.filter((p) => p.eligible).sort((a, b) => b.pass - a.pass || b.ctx - a.ctx || a.chars - b.chars)[0];

  const tTotal = targetCases.length * RUNS;
  const note = (p) => [p.incomplete ? `incomplete (${p.infra} infra, ${p.runs}/${expected} runs)` : '', p.regressed.length ? `regressed: ${p.regressed.join(',')}` : '', p.why].filter(Boolean).join('; ');
  finish([
    `target=${targetRel} goal=${opts.goal} k=${K} runs=${RUNS} model=${opts.model} proposer=${opts.proposer}`,
    `covering cases: ${targetCases.map((c) => c.name).join(', ')} (pass column); all ${cases.length} cases guard against regressions`,
    ...(opts.goal === 'trim' ? [`editable sections: ${editable.join(' | ')}`] : []),
    '',
    'arm | pass | context block | chars | note',
    `baseline | ${base.pass}/${tTotal} | ${base.ctx}/${expected} | ${original.length} |`,
    ...proposals.map((p) => p.invalid
      ? `cand${p.id} (${p.strategy}) | - | - | - | invalid: ${p.invalid}`
      : `cand${p.id} (${p.strategy}) | ${p.pass}/${tTotal} | ${p.ctx}/${expected} | ${p.chars} | ${note(p)}`),
    '',
    ...cases.map((c) => `${c.name}${covers(c) ? '' : ' (guard)'}: baseline ${base.perCase[c.name]}/${RUNS}${proposals.filter((p) => !p.invalid).map((p) => `, cand${p.id} ${p.perCase[c.name]}/${RUNS}`).join('')}`),
    '',
    winner
      ? `winner (unconfirmed, ${RUNS} runs per case): candidate ${winner.id}. Review ${path.relative(REPO, path.join(OUT, `candidate-${winner.id}.diff`))}, then apply with:\n  cp ${path.relative(REPO, path.join(OUT, `candidate-${winner.id}.md`))} ${targetRel}\nand confirm with more runs: node rules-evals/run.mjs --runs 5`
      : 'no winner: no candidate beat the baseline cleanly. Rules unchanged.',
    `total cost $${spent.toFixed(2)}`,
    `results: ${path.relative(REPO, OUT)}`,
  ]);

  if (!fs.existsSync(LESSONS)) fs.writeFileSync(LESSONS, '# Tuning lessons\n\nAppended by tune.mjs after each run; the proposer reads the latest entries for its target file. Scores are small samples, not confirmed results.\n');
  fs.appendFileSync(LESSONS, [
    `\n## ${new Date().toISOString().slice(0, 10)} \`${name}\` (${opts.goal}, ${opts.model}, ${RUNS} runs × ${cases.length} cases)`,
    `- baseline: ${base.pass}/${tTotal} covering-case passes; failures: ${[...new Set(failures.map((r) => `${r.case} (${r.why})`))].join('; ') || 'none'}`,
    ...proposals.map((p) => p.invalid
      ? `- ${p.strategy}: invalid (${p.invalid})`
      : `- ${p.strategy}: ${p.pass}/${tTotal}, ${p.chars} chars${p.incomplete ? ', incomplete' : ''}${p.regressed.length ? `, regressed ${p.regressed.join(',')}` : ''}${p === winner ? ' — best (unconfirmed)' : ''}. ${p.why}`),
    `- outcome: ${winner ? `candidate ${winner.id} offered for review, not applied` : 'no winner'}`,
  ].join('\n') + '\n');
}

function writeDiff(id) {
  const args = ['diff', '--no-index', '--no-color', '--no-ext-diff', '--', targetRel, path.relative(REPO, path.join(OUT, `candidate-${id}.md`))];
  let diff = '';
  try {
    diff = execFileSync('git', args, { cwd: REPO }).toString();
  } catch (e) {
    // EXTERNAL: git diff --no-index exits 1 when the files differ; any other status is a real error.
    if (e.status !== 1) throw e;
    diff = e.stdout.toString();
  }
  fs.writeFileSync(path.join(OUT, `candidate-${id}.diff`), diff);
}
