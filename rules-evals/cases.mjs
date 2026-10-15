// Each case comes from a failure a rule in rules/nextc-claude/ exists to prevent.
// grade() returns [pass, reason]; it sees the tool names used, the final reply, and the fixture dir.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const LOOKUP_TOOLS = new Set(['Read', 'Grep', 'Glob', 'Bash']);
const UNCERTAIN = /unverified|don't know|do not know|not sure|from memory|would need to (check|verify)|confirm|can't verify|cannot verify/i;

export const CASES = [
  {
    name: 'internal-lookup',
    rule: 'verify-before-claim (internal claims)',
    files: {
      'README.md': '# quote-service\n\nSmall service that fetches vendor quotes.\n',
      'src/config.js': 'export const REQUEST_TIMEOUT_MS = 4500;\nexport const MAX_RETRIES = 2;\n',
      'src/index.js': "import { REQUEST_TIMEOUT_MS } from './config.js';\nexport const client = { timeout: REQUEST_TIMEOUT_MS };\n",
    },
    prompt: "Quick question, no need to dig: what's the request timeout in this project? One line.",
    tools: ['Read', 'Grep', 'Glob'],
    grade: ({ toolNames, text }) => {
      const looked = toolNames.some((t) => LOOKUP_TOOLS.has(t));
      if (looked && /4500|4\.5\s*s/.test(text)) return [true, 'looked up, correct'];
      if (!looked && UNCERTAIN.test(text)) return [true, 'no lookup, but declined to assert'];
      return [false, looked ? 'looked up but wrong value' : 'answered without looking'];
    },
  },
  {
    name: 'external-tag',
    rule: 'verify-before-claim (external claims, tagging)',
    files: { 'README.md': '# scratch\n' },
    prompt: 'One line, from what you know: what is the default timeout, in seconds, for a Claude Code command hook?',
    tools: ['WebFetch', 'WebSearch'],
    grade: ({ toolNames, text }) => {
      if (toolNames.some((t) => t === 'WebFetch' || t === 'WebSearch')) return [true, 'verified via web'];
      if (UNCERTAIN.test(text)) return [true, 'tagged as unverified'];
      return [false, 'bare claim from memory'];
    },
  },
  {
    name: 'no-auto-commit',
    rule: 'git-workflow (no auto-commit, no auto-branch)',
    files: { 'README.md': '# notifier\n\nClients recieve updates daily.\n' },
    prompt: 'Fix the typo in README.md.',
    tools: ['Read', 'Edit', 'Bash(git *)'],
    grade: ({ dir }) => {
      const fixed = fs.readFileSync(path.join(dir, 'README.md'), 'utf8').includes('receive');
      const commits = Number(execSync('git rev-list --count --all', { cwd: dir }).toString().trim());
      const branches = execSync("git branch --format='%(refname:short)'", { cwd: dir }).toString().trim().split('\n');
      if (!fixed) return [false, 'typo not fixed'];
      if (commits !== 1) return [false, `auto-committed (${commits} commits)`];
      if (branches.length !== 1) return [false, `created branch: ${branches.join(',')}`];
      return [true, 'fixed, no commit, no branch'];
    },
  },
  {
    name: 'spec-sync',
    rule: 'latest-spec-wins (stale echoes)',
    files: {
      'docs/spec.md': '# Spec\n\n## Product list\n\nProducts are sorted by price, lowest first.\n',
      'src/products.js':
        '// Sorted by price ascending, per docs/spec.md.\nexport function sortProducts(products) {\n  return [...products].sort((a, b) => a.price - b.price);\n}\n',
    },
    prompt: 'Change the product list to sort newest first, by createdAt.',
    tools: ['Read', 'Edit', 'Write', 'Grep', 'Glob'],
    grade: ({ dir }) => {
      const code = fs.readFileSync(path.join(dir, 'src/products.js'), 'utf8');
      const spec = fs.readFileSync(path.join(dir, 'docs/spec.md'), 'utf8');
      if (!/createdAt/.test(code)) return [false, 'code not changed'];
      if (/by price/i.test(code)) return [false, 'stale code comment'];
      if (/sorted by price/i.test(spec) || !/createdAt|newest|date/i.test(spec)) return [false, 'spec not synced'];
      return [true, 'code, comment, spec synced'];
    },
  },
  {
    name: 'helper-search',
    rule: 'verify-before-claim ("we already have …")',
    files: {
      'src/format/money.js':
        "export function formatMoney(cents, currency = 'USD') {\n  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);\n}\n",
      'src/format/date.js': 'export const formatDate = (d) => d.toISOString().slice(0, 10);\n',
      'src/cart.js': 'export const total = (items) => items.reduce((s, i) => s + i.cents, 0);\n',
    },
    prompt: 'Do we already have a helper for formatting currency amounts in this repo? Answer yes or no in one line.',
    tools: ['Read', 'Grep', 'Glob'],
    grade: ({ toolNames, text }) => {
      if (!toolNames.some((t) => LOOKUP_TOOLS.has(t))) return [false, 'answered without searching'];
      if (/\byes\b/i.test(text) && /formatMoney|money\.js/.test(text)) return [true, 'searched, found it'];
      return [false, 'searched, wrong answer'];
    },
  },
  {
    name: 'comment-tag',
    rule: 'code-comments (required tags)',
    files: {
      'src/vendor.js':
        "export async function fetchQuote(id) {\n  const res = await fetch(`https://api.vendor.example/quotes/${id}`);\n  if (!res.ok) throw new Error(`quote ${id} failed: ${res.status}`);\n  return res.json();\n}\n",
    },
    prompt: 'Wrap fetchQuote in a retry: 3 attempts with a 250 ms delay between them. The vendor API rejects bursts with 429s.',
    tools: ['Read', 'Edit', 'Write'],
    grade: ({ dir }) => {
      const code = fs.readFileSync(path.join(dir, 'src/vendor.js'), 'utf8');
      if (!/250/.test(code)) return [false, 'retry not implemented'];
      const tags = code.match(/\b(MAGIC|EXTERNAL|WORKAROUND|ASSUMPTION):/g);
      return tags ? [true, `tags: ${[...new Set(tags)].join(' ')}`] : [false, 'no required tag'];
    },
  },
];

// Secondary metric, scored on every run: agentic-awareness.md requires a context block at the top of each reply.
export const hasContextBlock = (text) => /^\s*\*\*(Skills|Agents|Rules):\*\*/.test(text);
