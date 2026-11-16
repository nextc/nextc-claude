#!/usr/bin/env node
// Sets one version across .claude-plugin/marketplace.json (metadata.version) and every
// nextc-*/.claude-plugin/plugin.json. No dependencies.
//
//   node scripts/bump-version.mjs patch|minor|major|<x.y.z> [--dry-run] [--force] [--root <dir>]
//
// Refuses when the files do not all carry the same version, unless --force (the bump is then
// computed from the marketplace version). Edits only the version value, so formatting is kept.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEMVER = /^\d+\.\d+\.\d+$/;
const VERSION_FIELD = /("version"\s*:\s*")(\d+\.\d+\.\d+)(")/;

export function bumpVersion(current, target) {
  if (SEMVER.test(target)) return target;
  const [major, minor, patch] = current.split('.').map(Number);
  if (target === 'patch') return `${major}.${minor}.${patch + 1}`;
  if (target === 'minor') return `${major}.${minor + 1}.0`;
  if (target === 'major') return `${major + 1}.0.0`;
  throw new Error(`Unknown target "${target}": use patch, minor, major or x.y.z`);
}

// Returns [{ file, label, version }] for the marketplace and every plugin manifest.
export function collectManifests(root) {
  const manifests = [];
  const marketplace = join(root, '.claude-plugin', 'marketplace.json');
  if (!existsSync(marketplace)) throw new Error(`Missing ${marketplace}`);
  manifests.push({
    file: marketplace,
    label: 'marketplace metadata.version',
    version: JSON.parse(readFileSync(marketplace, 'utf8')).metadata?.version,
    pattern: /("metadata"\s*:\s*\{[^}]*?"version"\s*:\s*")(\d+\.\d+\.\d+)(")/,
  });
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('nextc-')) continue;
    const file = join(root, entry.name, '.claude-plugin', 'plugin.json');
    if (!existsSync(file)) continue;
    manifests.push({ file, label: entry.name, version: JSON.parse(readFileSync(file, 'utf8')).version, pattern: VERSION_FIELD });
  }
  return manifests;
}

export function run({ root, target, dryRun = false, force = false }) {
  const manifests = collectManifests(root);
  const versions = [...new Set(manifests.map((m) => m.version))];
  if (versions.length !== 1 && !force) {
    const listing = manifests.map((m) => `  ${m.label}: ${m.version}`).join('\n');
    throw new Error(`Versions are out of sync (use --force to override):\n${listing}`);
  }
  const base = manifests[0].version;
  if (!SEMVER.test(base ?? '')) throw new Error(`Marketplace version "${base}" is not x.y.z`);
  const next = bumpVersion(base, target);
  const changed = [];
  for (const m of manifests) {
    const text = readFileSync(m.file, 'utf8');
    if (!m.pattern.test(text)) throw new Error(`No version field found in ${m.file}`);
    const updated = text.replace(m.pattern, `$1${next}$3`);
    if (updated !== text) {
      if (!dryRun) writeFileSync(m.file, updated);
      changed.push(m.file);
    }
  }
  return { from: base, to: next, changed, dryRun };
}

function main(argv) {
  const args = argv.filter((a) => !a.startsWith('--'));
  const flag = (name) => argv.includes(name);
  const rootIdx = argv.indexOf('--root');
  const root = resolve(rootIdx >= 0 ? argv[rootIdx + 1] : join(dirname(fileURLToPath(import.meta.url)), '..'));
  const target = args.find((a) => a !== argv[rootIdx + 1]);
  if (!target) {
    console.error('Usage: node scripts/bump-version.mjs patch|minor|major|<x.y.z> [--dry-run] [--force]');
    process.exit(2);
  }
  try {
    const result = run({ root, target, dryRun: flag('--dry-run'), force: flag('--force') });
    console.log(`${result.dryRun ? '[dry run] would bump' : 'Bumped'} ${result.from} -> ${result.to}`);
    for (const f of result.changed) console.log(`  ${relative(root, f)}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
