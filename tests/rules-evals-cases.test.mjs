// rules-evals cases name the rule file and the `## ` sections they exercise; tune.mjs refuses to run when a
// named section is missing, so a renamed heading should fail here, offline, instead of mid-run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CASES } from '../rules-evals/cases.mjs';

const RULES = fileURLToPath(new URL('../nextc-core/rules/nextc-claude/', import.meta.url));

function headings(text) {
  const found = new Set(['(preamble)']);
  for (const line of text.split('\n')) if (line.startsWith('## ')) found.add(line.slice(3).trim());
  return found;
}

const ruleOf = (c) => c.rule.split(/[ ,(]/)[0];

test('every eval case names an existing rule file', () => {
  const missing = CASES.filter((c) => !existsSync(`${RULES}${ruleOf(c)}.md`)).map((c) => `${c.name} -> ${ruleOf(c)}.md`);
  assert.deepEqual(missing, []);
});

test('every section an eval case claims is a heading in its rule', () => {
  const stale = [];
  for (const c of CASES) {
    const file = `${RULES}${ruleOf(c)}.md`;
    if (!existsSync(file)) continue;
    const found = headings(readFileSync(file, 'utf8'));
    for (const s of c.sections ?? []) if (!found.has(s)) stale.push(`${c.name}: "${s}" not in ${ruleOf(c)}.md`);
  }
  assert.deepEqual(stale, []);
});
