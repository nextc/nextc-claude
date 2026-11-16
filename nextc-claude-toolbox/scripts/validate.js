#!/usr/bin/env node

/**
 * Structural validator for nextc-claude marketplace.
 * Zero npm dependencies — uses only Node.js built-ins.
 *
 * Usage:
 *   node validate.js --root <marketplace-root> [--plugin <name>] [--check <scope>]
 *
 * Scopes: all (default), skills, agents, hooks, manifests, rules
 * Output: JSON to stdout
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  VALID_SKILL_FIELDS,
  VALID_AGENT_FIELDS,
  PLUGIN_IGNORED_AGENT_FIELDS,
  VALID_HOOK_EVENTS,
  VALID_HOOK_TYPES,
  VALID_MODEL_SHORTHANDS,
  MODEL_ID_PATTERN,
  VALID_EFFORTS,
  VALID_COLORS,
  VALID_PERMISSION_MODES,
  VALID_ISOLATION_VALUES,
  VALID_MEMORY_SCOPES,
  BUILTIN_AGENT_TYPES,
  HOOK_MODULE_EXTENSIONS,
  ROSTER_RELATIVE_PATH,
  CONTENT_ANTIPATTERNS,
  KEBAB_CASE_PATTERN,
  SKILL_NAME_PATTERN,
  SEMVER_PATTERN,
} = require('./schema');
const { formatTable, formatSummary, formatJSON } = require('./reporters');

const NUMBERED_PLACEHOLDER = '{{ARGUMENTS}}';

// ─── CLI arg parsing ───────────────────────────────────────────────

const VALID_SCOPES = new Set(['all', 'skills', 'agents', 'hooks', 'manifests', 'rules']);

function parseArgs(argv) {
  const args = { root: '.', plugin: null, check: 'all', json: false, rulesDir: null, audit: false };
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--root': args.root = argv[++i]; break;
      case '--plugin': args.plugin = argv[++i]; break;
      case '--check': args.check = argv[++i]; break;
      case '--json': args.json = true; break;
      case '--rules-dir': args.rulesDir = argv[++i]; break;
      case '--audit': args.audit = true; break;
    }
  }
  if (!VALID_SCOPES.has(args.check)) {
    process.stderr.write(`Error: unknown --check scope "${args.check}". Valid: ${[...VALID_SCOPES].join(', ')}\n`);
    process.exit(2);
  }
  return args;
}

// ─── YAML frontmatter parser (simple, no deps) ────────────────────

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;

  const yaml = match[1];
  const fields = {};
  let currentKey = null;
  let listMode = false;

  for (const line of yaml.split('\n')) {
    // Continuation of multi-line value using >
    if (currentKey && /^\s/.test(line) && !listMode) {
      const trimmed = line.trim();
      if (trimmed) {
        fields[currentKey] = ((fields[currentKey] || '') + ' ' + trimmed).trim();
      }
      continue;
    }

    // List item
    if (listMode && /^\s+-\s+/.test(line)) {
      const val = line.replace(/^\s+-\s+/, '').trim();
      if (!Array.isArray(fields[currentKey])) fields[currentKey] = [];
      fields[currentKey].push(val);
      continue;
    }

    // New key-value pair
    const kvMatch = line.match(/^([a-zA-Z][a-zA-Z0-9_-]*)\s*:\s*(.*)/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      let value = kvMatch[2].trim();
      listMode = false;

      if (value === '' || value === '>') {
        fields[currentKey] = '';
        if (value !== '>') listMode = true;
        continue;
      }

      // Inline array: [item1, item2]
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',').map(s => s.replace(/['"]/g, '').trim()).filter(Boolean);
        fields[currentKey] = value;
        continue;
      }

      // Strip quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      // Boolean coercion
      if (value === 'true') value = true;
      else if (value === 'false') value = false;

      fields[currentKey] = value;
    }
  }

  return fields;
}

// ─── Result helpers ────────────────────────────────────────────────

function result(plugin, component, name, id, level, message) {
  return { plugin, component, name, id, level, message };
}

function pass(plugin, component, name, id, message) {
  return result(plugin, component, name, id, 'PASS', message);
}

function warn(plugin, component, name, id, message) {
  return result(plugin, component, name, id, 'WARN', message);
}

function fail(plugin, component, name, id, message) {
  return result(plugin, component, name, id, 'FAIL', message);
}

// ─── Content antipattern scanner ───────────────────────────────────

// Strip YAML frontmatter so scanner only looks at the body.
function stripFrontmatter(content) {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

// Scan body text for capability-restriction and repeated-fetch antipatterns.
// Inline code (`...`) and fenced code blocks (```...```) are stripped before
// scanning — these are literal examples, not instructions to Claude.
// Authors can suppress false positives on legitimate documentation lines with
// an HTML comment: <!-- validate:ignore --> on the same line, or wrap a block
// between <!-- validate:ignore-start --> and <!-- validate:ignore-end -->.
// Returns a list of WARN result objects. One warning per (antipattern, first match).
function scanContentAntipatterns(content, plugin, component, name) {
  const results = [];
  const body = stripFrontmatter(content);
  const rawLines = body.split('\n');

  // Per-line strip: track fenced code blocks and ignore blocks; blank out inline code within prose lines.
  // We preserve line indices so reported line numbers match the source.
  const scannable = [];
  let inFence = false;
  let inIgnoreBlock = false;
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (/<!--\s*validate:ignore-start\s*-->/.test(line)) { inIgnoreBlock = true; scannable.push(''); continue; }
    if (/<!--\s*validate:ignore-end\s*-->/.test(line)) { inIgnoreBlock = false; scannable.push(''); continue; }
    if (inIgnoreBlock) { scannable.push(''); continue; }
    if (/^\s*```/.test(line)) { inFence = !inFence; scannable.push(''); continue; }
    if (inFence) { scannable.push(''); continue; }
    if (/<!--\s*validate:ignore\s*-->/.test(line)) { scannable.push(''); continue; }
    scannable.push(line.replace(/`[^`\n]*`/g, ''));
  }

  for (const ap of CONTENT_ANTIPATTERNS) {
    let firstHit = null;
    for (let i = 0; i < scannable.length && !firstHit; i++) {
      for (const rx of ap.patterns) {
        const m = scannable[i].match(rx);
        if (m) {
          firstHit = { line: i + 1, text: rawLines[i].trim().slice(0, 120), match: m[0] };
          break;
        }
      }
    }
    if (firstHit) {
      const snippet = firstHit.text.length === 120 ? firstHit.text + '…' : firstHit.text;
      results.push(warn(
        plugin,
        component,
        name,
        ap.id,
        `${ap.label} at line ${firstHit.line}: "${firstHit.match}" — ${ap.hint}. Context: ${snippet}`
      ));
    }
  }
  return results;
}

// ─── Spawn and substitution checks ─────────────────────────────────

// Index of the paren closing the one that opens at `open`, or -1.
function matchingParen(text, open, limit = 2000) {
  let depth = 0;
  for (let i = open; i < Math.min(text.length, open + limit); i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// Flags text a skill or agent body should not contain: the unsubstituted {{ARGUMENTS}} token,
// legacy Task( spawns, and Agent( spawns of built-in agent types without `model`.
// Unlike the antipattern scanner this reads code fences too, because spawn examples live there.
function scanSpawnIssues(content, plugin, component, name) {
  const results = [];
  const body = stripFrontmatter(content);
  const lines = body.split('\n');
  const lineOf = (index) => body.slice(0, index).split('\n').length;
  const ignored = (index) => /validate:ignore/.test(lines[lineOf(index) - 1] || '');

  const argIdx = body.indexOf(NUMBERED_PLACEHOLDER);
  if (argIdx !== -1 && !ignored(argIdx)) {
    results.push(warn(plugin, component, name, 'K01',
      `${NUMBERED_PLACEHOLDER} at line ${lineOf(argIdx)} is not substituted by Claude Code; use $ARGUMENTS`));
  }

  const taskMatch = /\bTask\(/.exec(body);
  if (taskMatch && !ignored(taskMatch.index)) {
    results.push(warn(plugin, component, name, 'K02',
      `legacy Task( spawn at line ${lineOf(taskMatch.index)}; the tool is Agent(`));
  }

  const spawn = /\bAgent\(/g;
  let m;
  while ((m = spawn.exec(body))) {
    const open = m.index + m[0].length - 1;
    const close = matchingParen(body, open);
    if (close === -1) continue;
    const inner = body.slice(open + 1, close);
    if (!/\b(subagent_type|prompt)\b/.test(inner)) continue;
    if (ignored(m.index)) continue;
    const typeMatch = inner.match(/subagent_type\s*[:=]\s*["']([^"']+)["']/);
    const type = typeMatch ? typeMatch[1] : null;
    const isBuiltin = type === null || BUILTIN_AGENT_TYPES.has(type);
    if (isBuiltin && !/\bmodel\s*[:=]/.test(inner)) {
      results.push(warn(plugin, component, name, 'K03',
        `Agent( spawn at line ${lineOf(m.index)} of ${type || 'the default type'} has no model; it inherits the parent's (often the most expensive) model`));
    }
  }
  return results;
}

// ─── Roster (single source of truth for model/effort) ─────────────

// Parses `| \`agent\` | model | effort |` rows from the roster's assignments table.
function loadRoster(rootDir) {
  const rosterPath = path.join(rootDir, ROSTER_RELATIVE_PATH);
  if (!fs.existsSync(rosterPath)) return null;
  const roster = {};
  let inTable = false;
  for (const line of fs.readFileSync(rosterPath, 'utf8').split('\n')) {
    if (/^##\s+Model \+ effort assignments/i.test(line)) { inTable = true; continue; }
    if (inTable && /^##\s/.test(line)) break;
    if (!inTable) continue;
    const row = line.match(/^\|\s*`([^`]+)`\s*\|\s*([a-z]+)\s*\|\s*([a-z]+)/i);
    if (row) roster[row[1]] = { model: row[2].toLowerCase(), effort: row[3].toLowerCase() };
  }
  return roster;
}

// ─── Discovery ─────────────────────────────────────────────────────

function discoverPlugins(rootDir) {
  const marketplacePath = path.join(rootDir, '.claude-plugin', 'marketplace.json');
  if (!fs.existsSync(marketplacePath)) return [];

  let marketplace;
  try {
    marketplace = JSON.parse(fs.readFileSync(marketplacePath, 'utf8'));
  } catch (err) {
    process.stderr.write(`[discoverPlugins] Failed to parse marketplace.json: ${err.message}\n`);
    return [];
  }
  return (marketplace.plugins || []).map(p => ({
    name: p.name,
    source: path.resolve(rootDir, p.source),
    marketplaceName: p.name,
  }));
}

// ─── Validators ────────────────────────────────────────────────────

// Skills with high enough invocation traffic that an evals/evals.json file
// is recommended for description-optimization via skill-creator's run_loop.
const HIGH_TRAFFIC_SKILLS = new Set([
  'feature-dev', 'bug-fix', 'cleanup', 'clarify',
  'team-feature-dev', 'product-explore',
]);

// Audit-mode threshold: warn when MUST/ALWAYS/NEVER count exceeds this.
const IMPERATIVE_DENSITY_LIMIT = 5;

function validateSkills(pluginName, pluginDir, options = {}) {
  const audit = !!options.audit;
  const results = [];
  const skillsDir = path.join(pluginDir, 'skills');
  if (!fs.existsSync(skillsDir)) return results;

  const dirs = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter(d => d.isDirectory());

  for (const dir of dirs) {
    const skillPath = path.join(skillsDir, dir.name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;

    const content = fs.readFileSync(skillPath, 'utf8');
    const fm = parseFrontmatter(content);

    // S01: Frontmatter parseable
    if (!fm) {
      results.push(fail(pluginName, 'skill', dir.name, 'S01', 'Frontmatter missing or unparseable'));
      continue;
    }

    results.push(pass(pluginName, 'skill', dir.name, 'S01', 'Valid frontmatter'));

    // S02: Unknown fields
    for (const key of Object.keys(fm)) {
      if (!VALID_SKILL_FIELDS.has(key)) {
        results.push(warn(pluginName, 'skill', dir.name, 'S02', `Unknown frontmatter field: "${key}"`));
      }
    }

    // S03: Name matches directory
    if (fm.name && fm.name !== dir.name) {
      results.push(warn(pluginName, 'skill', dir.name, 'S03', `Name "${fm.name}" does not match directory "${dir.name}"`));
    }

    // S07: Name valid characters
    const skillName = fm.name || dir.name;
    if (!SKILL_NAME_PATTERN.test(skillName)) {
      results.push(fail(pluginName, 'skill', dir.name, 'S07', `Name "${skillName}" has invalid characters (allowed: lowercase, numbers, hyphens, max 64)`));
    }

    // S04: Description exists
    if (!fm.description) {
      results.push(warn(pluginName, 'skill', dir.name, 'S04', 'Description missing'));
    } else {
      results.push(pass(pluginName, 'skill', dir.name, 'S04', 'Has description'));

      // S13: portable description (purpose + "Use when ...", at most 1024 chars). The Agent Skills
      // spec has no when_to_use, so other tools read only `description` (skill-authoring.md).
      const desc = typeof fm.description === 'string' ? fm.description : '';
      if (!/\buse when\b/i.test(desc)) {
        results.push(warn(pluginName, 'skill', dir.name, 'S13',
          'description has no "Use when ..." trigger clause (other Agent Skills tools read only description)'));
      }
      if (desc.length > 1024) {
        results.push(warn(pluginName, 'skill', dir.name, 'S13',
          `description is ${desc.length} chars (Agent Skills spec max: 1024)`));
      }

      // S12: description + when_to_use are truncated together at 1536 chars in the skill listing
      const wtu = typeof fm.when_to_use === 'string' ? fm.when_to_use : '';
      if (desc.length + wtu.length > 1536) {
        results.push(warn(pluginName, 'skill', dir.name, 'S12',
          `description + when_to_use is ${desc.length + wtu.length} chars (listing truncates at 1536). Trim or move detail to the body.`));
      }
    }

    // S06: File length
    const lineCount = content.split('\n').length;
    if (lineCount > 500) {
      results.push(warn(pluginName, 'skill', dir.name, 'S06', `SKILL.md is ${lineCount} lines (recommended: under 500)`));
    }

    // Validate effort if present
    if (fm.effort && !VALID_EFFORTS.has(fm.effort)) {
      results.push(warn(pluginName, 'skill', dir.name, 'S02', `Invalid effort value: "${fm.effort}" (expected: ${[...VALID_EFFORTS].join(', ')})`));
    }

    // Validate context if present
    if (fm.context && fm.context !== 'fork') {
      results.push(warn(pluginName, 'skill', dir.name, 'S02', `Invalid context value: "${fm.context}" (expected: "fork")`));
    }

    // S08 (C01 / C02): Content antipatterns in skill body
    results.push(...scanContentAntipatterns(content, pluginName, 'skill', dir.name));
    // K01-K03: unsubstituted tokens, legacy spawns, spawns without model
    results.push(...scanSpawnIssues(content, pluginName, 'skill', dir.name));

    // ─── Audit-mode checks (gated by --audit flag) ───────────────
    if (audit) {
      // S09: when_to_use coverage — recommended for triggering accuracy
      if (!fm.when_to_use && fm.description) {
        const desc = typeof fm.description === 'string' ? fm.description : '';
        const hasInlineTriggers = /\b(use\s+(when|after|before|to|for)|triggers?:|when user says|invoke when|use this skill)\b/i.test(desc);
        if (!hasInlineTriggers) {
          results.push(warn(pluginName, 'skill', dir.name, 'S09',
            'No when_to_use field and no inline trigger phrases in description (combat undertriggering per skill-creator best practice)'));
        }
      }

      // S10: MUST/ALWAYS/NEVER density in skill body
      const body = stripFrontmatter(content);
      const imperatives = (body.match(/\b(MUST|ALWAYS|NEVER)\b/g) || []).length;
      if (imperatives > IMPERATIVE_DENSITY_LIMIT) {
        results.push(warn(pluginName, 'skill', dir.name, 'S10',
          `${imperatives} MUST/ALWAYS/NEVER occurrences (target: ≤${IMPERATIVE_DENSITY_LIMIT}). Reframe stylistic imperatives as prose with explained "why".`));
      }

      // S11: evals/evals.json existence for high-traffic skills
      if (HIGH_TRAFFIC_SKILLS.has(dir.name)) {
        const evalsPath = path.join(skillsDir, dir.name, 'evals', 'evals.json');
        if (!fs.existsSync(evalsPath)) {
          results.push(warn(pluginName, 'skill', dir.name, 'S11',
            'High-traffic skill missing evals/evals.json (recommended for skill-creator run_loop description optimization)'));
        }
      }
    }
  }

  return results;
}

function validateAgents(pluginName, pluginDir, roster = null) {
  const results = [];
  const agentsDir = path.join(pluginDir, 'agents');
  if (!fs.existsSync(agentsDir)) return results;

  const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));

  for (const file of files) {
    const agentPath = path.join(agentsDir, file);
    const agentName = file.replace(/\.md$/, '');
    const content = fs.readFileSync(agentPath, 'utf8');
    const fm = parseFrontmatter(content);

    if (!fm) {
      results.push(fail(pluginName, 'agent', agentName, 'A01', 'Frontmatter missing or unparseable'));
      continue;
    }

    // A01: name required
    if (!fm.name) {
      results.push(fail(pluginName, 'agent', agentName, 'A01', 'Missing required "name" field'));
    } else {
      results.push(pass(pluginName, 'agent', agentName, 'A01', 'Has name field'));
    }

    // A02: description required
    if (!fm.description) {
      results.push(fail(pluginName, 'agent', agentName, 'A02', 'Missing required "description" field'));
    } else {
      results.push(pass(pluginName, 'agent', agentName, 'A02', 'Has description field'));
    }

    // A03: Unknown fields
    for (const key of Object.keys(fm)) {
      if (!VALID_AGENT_FIELDS.has(key)) {
        results.push(warn(pluginName, 'agent', agentName, 'A03', `Unknown frontmatter field: "${key}"`));
      }
    }

    // A04: Valid model value
    if (fm.model) {
      const modelStr = String(fm.model);
      if (!VALID_MODEL_SHORTHANDS.has(modelStr) && !MODEL_ID_PATTERN.test(modelStr)) {
        results.push(warn(pluginName, 'agent', agentName, 'A04', `Invalid model value: "${modelStr}"`));
      }
    }

    // A05: Plugin agent uses ignored fields
    for (const field of PLUGIN_IGNORED_AGENT_FIELDS) {
      if (fm[field]) {
        results.push(warn(pluginName, 'agent', agentName, 'A05', `Field "${field}" is ignored for plugin agents (security restriction)`));
      }
    }

    // A06: model field required (repo rule)
    if (!fm.model) {
      results.push(fail(pluginName, 'agent', agentName, 'A06', 'Missing "model" field (required for teammates; see rules-references/agent-teams.md)'));
    }

    // A08: effort required (repo rule agents.md: model AND effort)
    if (!fm.effort) {
      results.push(fail(pluginName, 'agent', agentName, 'A08', 'Missing "effort" field (required for teammates; see rules-references/agent-teams.md)'));
    }

    // A10: tools list must include SendMessage (a split-pane teammate or subagent reports only through it).
    // An omitted tools field inherits every tool, so only an explicit list is checked.
    if (fm.tools !== undefined) {
      const tools = Array.isArray(fm.tools) ? fm.tools : String(fm.tools).split(/[,\s]+/).filter(Boolean);
      if (!tools.includes('SendMessage')) {
        results.push(fail(pluginName, 'agent', agentName, 'A10', 'tools list does not include SendMessage (required for teammates; see rules-references/agent-teams.md)'));
      }
    }

    // A07 / A11: roster mismatch. The roster is the single source of truth.
    const resolvedName = fm.name || agentName;
    if (roster) {
      const expected = roster[resolvedName];
      if (!expected) {
        results.push(warn(pluginName, 'agent', agentName, 'A07', 'Agent is not in rules-references/agents-roster.md'));
      } else {
        if (fm.model && String(fm.model) !== expected.model) {
          results.push(warn(pluginName, 'agent', agentName, 'A07', `Model "${fm.model}" does not match roster (expected: "${expected.model}")`));
        }
        if (fm.effort && String(fm.effort) !== expected.effort) {
          results.push(warn(pluginName, 'agent', agentName, 'A11', `Effort "${fm.effort}" does not match roster (expected: "${expected.effort}")`));
        }
      }
    }

    // Validate effort if present
    if (fm.effort && !VALID_EFFORTS.has(fm.effort)) {
      results.push(warn(pluginName, 'agent', agentName, 'A03', `Invalid effort value: "${fm.effort}"`));
    }

    // Validate color if present
    if (fm.color && !VALID_COLORS.has(fm.color)) {
      results.push(warn(pluginName, 'agent', agentName, 'A03', `Invalid color value: "${fm.color}"`));
    }

    // Validate permissionMode if present
    if (fm.permissionMode && !VALID_PERMISSION_MODES.has(fm.permissionMode)) {
      results.push(warn(pluginName, 'agent', agentName, 'A03', `Invalid permissionMode: "${fm.permissionMode}"`));
    }

    // Validate isolation if present
    if (fm.isolation && !VALID_ISOLATION_VALUES.has(fm.isolation)) {
      results.push(warn(pluginName, 'agent', agentName, 'A03', `Invalid isolation value: "${fm.isolation}"`));
    }

    // Validate memory if present
    if (fm.memory && !VALID_MEMORY_SCOPES.has(fm.memory)) {
      results.push(warn(pluginName, 'agent', agentName, 'A03', `Invalid memory scope: "${fm.memory}"`));
    }

    // A09 (C01 / C02): Content antipatterns in agent body
    results.push(...scanContentAntipatterns(content, pluginName, 'agent', agentName));
    results.push(...scanSpawnIssues(content, pluginName, 'agent', agentName));
  }

  return results;
}

function validateHooks(pluginName, pluginDir) {
  const results = [];
  const hooksPath = path.join(pluginDir, 'hooks', 'hooks.json');
  if (!fs.existsSync(hooksPath)) return results;

  // H01: Valid JSON
  let hooksData;
  try {
    hooksData = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  } catch (err) {
    results.push(fail(pluginName, 'hook', 'hooks.json', 'H01', `Invalid JSON: ${err.message}`));
    return results;
  }
  results.push(pass(pluginName, 'hook', 'hooks.json', 'H01', 'Valid JSON'));

  // H08: mod hooks modules ("modules": ["./register.tsx"], paths relative to hooks.json)
  if (hooksData.modules !== undefined) {
    if (!Array.isArray(hooksData.modules) || hooksData.modules.length === 0) {
      results.push(fail(pluginName, 'hook', 'hooks.json', 'H08', '"modules" must be a non-empty array of paths'));
    } else {
      for (const mod of hooksData.modules) {
        const ext = typeof mod === 'string' ? path.extname(mod) : '';
        if (!HOOK_MODULE_EXTENSIONS.has(ext)) {
          results.push(fail(pluginName, 'hook', String(mod), 'H08', `Module path must end in ${[...HOOK_MODULE_EXTENSIONS].join(', ')}`));
        } else if (!fs.existsSync(path.resolve(path.dirname(hooksPath), mod))) {
          results.push(fail(pluginName, 'hook', mod, 'H08', `Module file does not exist: ${mod}`));
        } else {
          results.push(pass(pluginName, 'hook', mod, 'H08', 'Module file exists'));
        }
      }
    }
  }

  // H02: Has hooks key (optional when the file declares modules)
  const hookMap = hooksData.hooks;
  if (!hookMap || typeof hookMap !== 'object') {
    if (hooksData.modules === undefined) {
      results.push(fail(pluginName, 'hook', 'hooks.json', 'H02', 'Missing "hooks" top-level key'));
    }
    return results;
  }
  results.push(pass(pluginName, 'hook', 'hooks.json', 'H02', 'Has "hooks" key'));

  for (const [eventName, entries] of Object.entries(hookMap)) {
    // H03: Valid event type
    if (!VALID_HOOK_EVENTS.has(eventName)) {
      results.push(warn(pluginName, 'hook', eventName, 'H03', `Unknown hook event type: "${eventName}"`));
    }

    if (!Array.isArray(entries)) continue;

    for (const entry of entries) {
      if (!Array.isArray(entry.hooks)) continue;

      for (const handler of entry.hooks) {
        const scriptName = (handler.command || '').match(/([\w.-]+\.(?:js|mjs|cjs|ts|tsx|sh|py))/)?.[1] || handler.command || handler.type;
        const hookId = `${eventName}/${entry.matcher || '*'}/${scriptName}`;

        // H04: Valid hook type
        if (!VALID_HOOK_TYPES.has(handler.type)) {
          results.push(warn(pluginName, 'hook', hookId, 'H04', `Unknown hook handler type: "${handler.type}"`));
        }

        // H05 + H06 + H07: Script checks for command hooks
        if (handler.type === 'command' && handler.command) {
          const cmd = handler.command;

          // H07: Hardcoded absolute paths
          if (/\/Users\/|\/home\/|\/opt\//.test(cmd) && !cmd.includes('${CLAUDE_PLUGIN_ROOT}')) {
            results.push(warn(pluginName, 'hook', hookId, 'H07', 'Command uses hardcoded absolute path instead of ${CLAUDE_PLUGIN_ROOT}'));
          }

          // H05: Check referenced script exists (only for local scripts using CLAUDE_PLUGIN_ROOT)
          const scriptMatch = cmd.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/(.+?)(?:\s|"|$)/);
          if (scriptMatch) {
            const scriptPath = path.join(pluginDir, scriptMatch[1]);
            if (!fs.existsSync(scriptPath)) {
              results.push(warn(pluginName, 'hook', hookId, 'H05', `Referenced script does not exist: ${scriptMatch[1]}`));
            } else {
              // H06: Check executable bit
              try {
                const stat = fs.statSync(scriptPath);
                // Node.js scripts invoked via `node script.js` don't need +x
                if (!/^(node|tsx|bun|deno)\b/.test(cmd) && !(stat.mode & 0o111)) {
                  results.push(warn(pluginName, 'hook', hookId, 'H06', `Script not executable: ${scriptMatch[1]}`));
                }
              } catch (_) {
                // skip stat errors
              }
            }
          }
        }
      }
    }
  }

  return results;
}

function validateWorkflows(pluginName, pluginDir) {
  const results = [];
  const dir = path.join(pluginDir, 'workflows');
  if (!fs.existsSync(dir)) return results;
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    // Leading blank lines and comments are allowed before the meta export.
    const code = text.replace(/^(?:\s+|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, '');
    if (code.startsWith('export const meta =')) {
      results.push(pass(pluginName, 'workflow', file, 'W01', 'Starts with export const meta ='));
    } else {
      results.push(fail(pluginName, 'workflow', file, 'W01', 'Workflow script must start with `export const meta =`'));
    }
  }
  return results;
}

function validateManifest(pluginName, pluginDir, marketplaceVersion) {
  const results = [];
  const manifestPath = path.join(pluginDir, '.claude-plugin', 'plugin.json');
  if (!fs.existsSync(manifestPath)) {
    results.push(warn(pluginName, 'manifest', 'plugin.json', 'P01', 'No plugin.json found (optional but recommended)'));
    return results;
  }

  // P01: Valid JSON
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    results.push(fail(pluginName, 'manifest', 'plugin.json', 'P01', `Invalid JSON: ${err.message}`));
    return results;
  }
  results.push(pass(pluginName, 'manifest', 'plugin.json', 'P01', 'Valid JSON'));

  // P02: name field
  if (!manifest.name) {
    results.push(fail(pluginName, 'manifest', 'plugin.json', 'P02', 'Missing required "name" field'));
  } else {
    results.push(pass(pluginName, 'manifest', 'plugin.json', 'P02', 'Has name field'));

    // P03: kebab-case
    if (!KEBAB_CASE_PATTERN.test(manifest.name)) {
      results.push(warn(pluginName, 'manifest', 'plugin.json', 'P03', `Name "${manifest.name}" is not kebab-case`));
    }
  }

  // P04: Valid semver
  if (manifest.version) {
    if (!SEMVER_PATTERN.test(manifest.version)) {
      results.push(warn(pluginName, 'manifest', 'plugin.json', 'P04', `Invalid semver: "${manifest.version}"`));
    }
  }

  // P06: engines, when present, maps tool names to version-range strings
  if (manifest.engines !== undefined) {
    const e = manifest.engines;
    const ok = e && typeof e === 'object' && !Array.isArray(e) && Object.values(e).every(x => typeof x === 'string');
    if (!ok) {
      results.push(fail(pluginName, 'manifest', 'plugin.json', 'P06', '"engines" must be an object mapping names to version-range strings'));
    }
  }

  // P05: Version matches marketplace
  if (manifest.version && marketplaceVersion && manifest.version !== marketplaceVersion) {
    results.push(warn(pluginName, 'manifest', 'plugin.json', 'P05', `Version "${manifest.version}" does not match marketplace version "${marketplaceVersion}"`));
  }

  return results;
}

function validateMarketplace(rootDir) {
  const results = [];
  const mpPath = path.join(rootDir, '.claude-plugin', 'marketplace.json');
  if (!fs.existsSync(mpPath)) {
    results.push(fail('(global)', 'marketplace', 'marketplace.json', 'M01', 'marketplace.json not found'));
    return results;
  }

  let mp;
  try {
    mp = JSON.parse(fs.readFileSync(mpPath, 'utf8'));
  } catch (err) {
    results.push(fail('(global)', 'marketplace', 'marketplace.json', 'M01', `Invalid JSON: ${err.message}`));
    return results;
  }

  const names = new Set();
  for (const plugin of (mp.plugins || [])) {
    // M01: Source path exists
    const sourcePath = path.resolve(rootDir, plugin.source);
    if (!fs.existsSync(sourcePath)) {
      results.push(fail('(global)', 'marketplace', plugin.name, 'M01', `Source path does not exist: "${plugin.source}"`));
    } else {
      results.push(pass('(global)', 'marketplace', plugin.name, 'M01', 'Source path exists'));

      // M02: Name matches plugin.json
      const pjPath = path.join(sourcePath, '.claude-plugin', 'plugin.json');
      if (fs.existsSync(pjPath)) {
        try {
          const pj = JSON.parse(fs.readFileSync(pjPath, 'utf8'));
          if (pj.name && pj.name !== plugin.name) {
            results.push(warn('(global)', 'marketplace', plugin.name, 'M02', `Marketplace name "${plugin.name}" does not match plugin.json name "${pj.name}"`));
          }
        } catch (_) {
          // plugin.json parse errors are caught by validateManifest
        }
      }
    }

    // M03: Duplicate names
    if (names.has(plugin.name)) {
      results.push(warn('(global)', 'marketplace', plugin.name, 'M03', `Duplicate plugin name: "${plugin.name}"`));
    }
    names.add(plugin.name);
  }

  return results;
}

function validateRules(rootDir, rulesDir) {
  const results = [];
  if (!rulesDir) {
    // Auto-discover: look for rules/ directory with subdirectories
    const defaultRulesBase = path.join(rootDir, 'rules');
    if (fs.existsSync(defaultRulesBase)) {
      const subdirs = fs.readdirSync(defaultRulesBase, { withFileTypes: true })
        .filter(d => d.isDirectory());
      if (subdirs.length === 1) {
        rulesDir = path.join(defaultRulesBase, subdirs[0].name);
      } else if (subdirs.length > 1) {
        // Validate all rule subdirectories
        for (const subdir of subdirs) {
          results.push(...validateRules(rootDir, path.join(defaultRulesBase, subdir.name)));
        }
        return results;
      }
    }
  }
  if (!rulesDir || !fs.existsSync(rulesDir)) return results;

  const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.md'));

  for (const file of files) {
    const filePath = path.join(rulesDir, file);
    const content = fs.readFileSync(filePath, 'utf8').trim();
    const ruleName = file.replace(/\.md$/, '');

    // R01: Non-empty
    if (content.length === 0) {
      results.push(warn('(global)', 'rule', ruleName, 'R01', 'Rule file is empty'));
    } else {
      results.push(pass('(global)', 'rule', ruleName, 'R01', 'Non-empty rule file'));
    }

    // R02 / R03 (C01 / C02): Content antipatterns
    results.push(...scanContentAntipatterns(content, '(global)', 'rule', ruleName));
  }

  return results;
}

// ─── Main ──────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv);
  const rootDir = path.resolve(args.root);
  const allResults = [];
  const scope = args.check;

  // Read marketplace version for cross-checks
  let marketplaceVersion = null;
  const mpPath = path.join(rootDir, '.claude-plugin', 'marketplace.json');
  if (fs.existsSync(mpPath)) {
    try {
      const mp = JSON.parse(fs.readFileSync(mpPath, 'utf8'));
      marketplaceVersion = mp.metadata && mp.metadata.version;
    } catch (_) {
      // handled in validateMarketplace
    }
  }

  // Marketplace-level checks
  if (scope === 'all' || scope === 'manifests') {
    allResults.push(...validateMarketplace(rootDir));
  }

  // Rule-level checks
  if (scope === 'all' || scope === 'rules') {
    const rulesDir = args.rulesDir ? path.resolve(args.rulesDir) : null;
    allResults.push(...validateRules(rootDir, rulesDir));
  }

  const roster = loadRoster(rootDir);

  // Per-plugin checks
  const plugins = discoverPlugins(rootDir);
  for (const plugin of plugins) {
    if (args.plugin && plugin.name !== args.plugin) continue;
    if (!fs.existsSync(plugin.source)) continue;

    if (scope === 'all' || scope === 'skills') {
      allResults.push(...validateSkills(plugin.name, plugin.source, { audit: args.audit }));
    }
    if (scope === 'all' || scope === 'agents') {
      allResults.push(...validateAgents(plugin.name, plugin.source, roster));
    }
    if (scope === 'all' || scope === 'hooks') {
      allResults.push(...validateHooks(plugin.name, plugin.source));
    }
    if (scope === 'all' || scope === 'hooks') {
      allResults.push(...validateWorkflows(plugin.name, plugin.source));
    }
    if (scope === 'all' || scope === 'manifests') {
      allResults.push(...validateManifest(plugin.name, plugin.source, marketplaceVersion));
    }
  }

  // Roster entries with no agent file (only for a full run, where every agent was seen)
  if (roster && scope === 'all' && !args.plugin) {
    const seenAgents = new Set(allResults.filter(r => r.component === 'agent').map(r => r.name));
    const seenNames = new Set();
    for (const plugin of plugins) {
      const dir = path.join(plugin.source, 'agents');
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.md'))) {
        const fm = parseFrontmatter(fs.readFileSync(path.join(dir, f), 'utf8'));
        seenNames.add((fm && fm.name) || f.replace(/\.md$/, ''));
      }
    }
    for (const name of Object.keys(roster)) {
      if (!seenNames.has(name) && !seenAgents.has(name)) {
        allResults.push(warn('(global)', 'roster', name, 'A12', 'Roster lists an agent that has no agent file'));
      }
    }
  }

  // Summary
  const summary = { pass: 0, warn: 0, fail: 0 };
  for (const r of allResults) {
    if (r.level === 'PASS') summary.pass++;
    else if (r.level === 'WARN') summary.warn++;
    else if (r.level === 'FAIL') summary.fail++;
  }

  if (args.json) {
    process.stdout.write(formatJSON(allResults, summary) + '\n');
  } else {
    process.stdout.write(formatTable(allResults));
    process.stdout.write(formatSummary(summary) + '\n');
  }

  // Exit with non-zero if any FAILs
  process.exit(summary.fail > 0 ? 1 : 0);
}

main();
