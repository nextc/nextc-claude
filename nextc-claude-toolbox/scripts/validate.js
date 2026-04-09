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
  MODEL_TIER_TABLE,
  KEBAB_CASE_PATTERN,
  SKILL_NAME_PATTERN,
  SEMVER_PATTERN,
} = require('./schema');
const { formatTable, formatSummary, formatJSON } = require('./reporters');

// ─── CLI arg parsing ───────────────────────────────────────────────

const VALID_SCOPES = new Set(['all', 'skills', 'agents', 'hooks', 'manifests', 'rules']);

function parseArgs(argv) {
  const args = { root: '.', plugin: null, check: 'all', json: false, rulesDir: null };
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--root': args.root = argv[++i]; break;
      case '--plugin': args.plugin = argv[++i]; break;
      case '--check': args.check = argv[++i]; break;
      case '--json': args.json = true; break;
      case '--rules-dir': args.rulesDir = argv[++i]; break;
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

function validateSkills(pluginName, pluginDir) {
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
      // S05: Description length
      const desc = typeof fm.description === 'string' ? fm.description : '';
      if (desc.length > 250) {
        results.push(warn(pluginName, 'skill', dir.name, 'S05', `Description is ${desc.length} chars (recommended: under 250 for listing display)`));
      }
    }

    // S06: File length
    const lineCount = content.split('\n').length;
    if (lineCount > 500) {
      results.push(warn(pluginName, 'skill', dir.name, 'S06', `SKILL.md is ${lineCount} lines (recommended: under 500)`));
    }

    // Validate effort if present
    if (fm.effort && !VALID_EFFORTS.has(fm.effort)) {
      results.push(warn(pluginName, 'skill', dir.name, 'S02', `Invalid effort value: "${fm.effort}" (expected: low, medium, high, max)`));
    }

    // Validate context if present
    if (fm.context && fm.context !== 'fork') {
      results.push(warn(pluginName, 'skill', dir.name, 'S02', `Invalid context value: "${fm.context}" (expected: "fork")`));
    }
  }

  return results;
}

function validateAgents(pluginName, pluginDir) {
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
      results.push(fail(pluginName, 'agent', agentName, 'A06', 'Missing "model" field (required by repo rule agents.md)'));
    }

    // A07: Model tier mismatch
    const resolvedName = fm.name || agentName;
    if (fm.model && MODEL_TIER_TABLE[resolvedName]) {
      const expected = MODEL_TIER_TABLE[resolvedName];
      const actual = String(fm.model);
      if (actual !== expected) {
        results.push(warn(pluginName, 'agent', agentName, 'A07', `Model "${actual}" does not match tier table (expected: "${expected}")`));
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

  // H02: Has hooks key
  const hookMap = hooksData.hooks;
  if (!hookMap || typeof hookMap !== 'object') {
    results.push(fail(pluginName, 'hook', 'hooks.json', 'H02', 'Missing "hooks" top-level key'));
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
      const hookId = entry.id || `${eventName}/${entry.matcher || '*'}`;

      if (!Array.isArray(entry.hooks)) continue;

      for (const handler of entry.hooks) {
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
                if (!cmd.startsWith('node ') && !(stat.mode & 0o111)) {
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

  // Per-plugin checks
  const plugins = discoverPlugins(rootDir);
  for (const plugin of plugins) {
    if (args.plugin && plugin.name !== args.plugin) continue;
    if (!fs.existsSync(plugin.source)) continue;

    if (scope === 'all' || scope === 'skills') {
      allResults.push(...validateSkills(plugin.name, plugin.source));
    }
    if (scope === 'all' || scope === 'agents') {
      allResults.push(...validateAgents(plugin.name, plugin.source));
    }
    if (scope === 'all' || scope === 'hooks') {
      allResults.push(...validateHooks(plugin.name, plugin.source));
    }
    if (scope === 'all' || scope === 'manifests') {
      allResults.push(...validateManifest(plugin.name, plugin.source, marketplaceVersion));
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
