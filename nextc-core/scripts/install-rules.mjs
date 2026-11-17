#!/usr/bin/env node
// Installs the nextc rules for whoever installs this plugin, so nobody has to link them by
// hand. Runs at session start. It copies the rule files this plugin ships into
// <config dir>/rules/nextc-claude/ and their long-form references into
// ~/.claude/nextc-claude-references/, and refreshes them when the plugin updates.
//
// WORKAROUND: Claude Code has no plugin component for always-loaded rules (a CLAUDE.md in a
// plugin is not loaded), and a cached plugin holds only its own folder. User rules under
// the config dir's rules/ are the one place that loads in every session and reaches subagents.
//
// What it will not touch:
// - a destination that is a symbolic link (a developer's checkout linked by setup-rules.sh);
// - a file the person edited after it was installed (its content no longer matches the
//   record of what was written), or one that was there before with other content.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// EXTERNAL: setup-rules.sh links the same two destinations for a developer checkout.
// EXTERNAL: the rule files cite their references as ~/.claude/nextc-claude-references/<file>,
// and nextc-hud reads agents-roster.md from there, so the references always go under
// ~/.claude, also for a person who moved the config dir with CLAUDE_CONFIG_DIR.
export const TARGETS = [
  { src: 'rules/nextc-claude', base: 'config', dest: ['rules', 'nextc-claude'] },
  { src: 'rules-references', base: 'home', dest: ['nextc-claude-references'] },
];
export const RECORD = '.nextc-installed.json';

const sha = (text) => createHash('sha256').update(text).digest('hex');
const isLink = (p) => {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    // Nothing there: not a link.
    return false;
  }
};
const debug = (what, err) => {
  if (process.env.NODE_ENV !== 'production') process.stderr.write(`nextc-core install-rules: ${what}: ${err?.stack ?? err}\n`);
};
// SECURITY: a record entry is used as a file name to delete, so only a bare rule file name
// counts. Anything with a path in it (a tampered or synced record) is ignored.
const isRuleName = (name) => typeof name === 'string' && name === path.basename(name) && name.endsWith('.md') && !name.startsWith('.');

function readRecord(file) {
  // SECURITY: a record that is a link is neither read nor written, so it cannot point the
  // installer at a file outside the folder.
  if (isLink(file)) return { version: null, files: {}, kept: [] };
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const files = data && typeof data === 'object' && data.files && typeof data.files === 'object' ? data.files : {};
    return {
      version: typeof data?.version === 'string' ? data.version : null,
      files: Object.fromEntries(Object.entries(files).filter(([name, hash]) => isRuleName(name) && typeof hash === 'string')),
      kept: Array.isArray(data?.kept) ? data.kept.filter(isRuleName) : [],
    };
  } catch {
    // No record yet, or an unreadable one: nothing is known to be ours.
    return { version: null, files: {}, kept: [] };
  }
}

// Whether version a is newer than b; false when either is not x.y.z.
export function isNewer(a, b) {
  const parts = (v) => (/^\d+\.\d+\.\d+$/.test(String(v)) ? String(v).split('.').map(Number) : null);
  const [x, y] = [parts(a), parts(b)];
  if (x === null || y === null) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

// ORDER: write to a name that does not end in .md, then rename. A session that is killed
// mid-write leaves no half-written rule, which would otherwise read as "edited" for good.
function writeAtomic(file, text) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  try {
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

const nothing = (state) => ({ state, written: 0, writtenFiles: [], kept: [], newlyKept: [], removed: 0 });

// Installs one folder. Returns what happened: 'linked' (left alone), or counts.
export function installFolder(srcDir, destDir, version) {
  if (!fs.existsSync(srcDir)) return nothing('missing-source');
  // A linked destination belongs to a checkout: leave it alone.
  if (isLink(destDir)) return nothing('linked');
  const names = fs.readdirSync(srcDir).filter(isRuleName).sort();
  // A plugin folder caught half-copied ships nothing: do not read that as "every rule was dropped".
  if (names.length === 0) return nothing('missing-source');
  fs.mkdirSync(destDir, { recursive: true });
  const recordFile = path.join(destDir, RECORD);
  const record = readRecord(recordFile);
  // Two projects can hold different versions of this plugin (project-scope installs). The older
  // one must not put its rules back over the newer one's each time a session starts there.
  if (isNewer(record.version, version)) return nothing('newer-installed');
  const files = {};
  const kept = [];
  const writtenFiles = [];
  let removed = 0;
  for (const name of names) {
    const dest = path.join(destDir, name);
    try {
      const text = fs.readFileSync(path.join(srcDir, name), 'utf8');
      const want = sha(text);
      if (isLink(dest)) {
        kept.push(name);
        continue;
      }
      const have = fs.existsSync(dest) ? sha(fs.readFileSync(dest, 'utf8')) : null;
      if (have === want) {
        files[name] = want;
        continue;
      }
      // A file that differs from what was last written here was edited by the person (or was
      // there before this plugin): it is kept, and stays out of the record.
      if (have !== null && have !== record.files[name]) {
        kept.push(name);
        continue;
      }
      writeAtomic(dest, text);
      files[name] = want;
      writtenFiles.push(name);
    } catch (err) {
      // One unreadable entry (a folder named like a rule, a permission problem) must not stop the rest.
      debug(`${name} left as it is`, err);
      kept.push(name);
      // A file that only failed this once is still ours: keeping its hash lets the next run update it.
      if (record.files[name]) files[name] = record.files[name];
    }
  }
  // A rule this plugin installed earlier and no longer ships is removed, unless it was edited.
  for (const [name, hash] of Object.entries(record.files)) {
    if (names.includes(name)) continue;
    const dest = path.join(destDir, name);
    try {
      if (!isLink(dest) && fs.existsSync(dest) && sha(fs.readFileSync(dest, 'utf8')) === hash) {
        fs.rmSync(dest);
        removed++;
      }
    } catch (err) {
      debug(`${name} not removed`, err);
    }
  }
  if (!isLink(recordFile)) {
    const next = JSON.stringify({ version, files, kept }, null, 2) + '\n';
    if (!fs.existsSync(recordFile) || fs.readFileSync(recordFile, 'utf8') !== next) writeAtomic(recordFile, next);
  }
  return { state: 'installed', written: writtenFiles.length, writtenFiles, kept, newlyKept: kept.filter((k) => !record.kept.includes(k)), removed };
}

export function install({ pluginRoot, claudeDir, homeClaudeDir = claudeDir, version }) {
  return TARGETS.map((t) => {
    const destDir = path.join(t.base === 'home' ? homeClaudeDir : claudeDir, ...t.dest);
    const base = { target: t.dest.join('/'), destDir, isRules: t.base === 'config' };
    try {
      return { ...base, ...installFolder(path.join(pluginRoot, t.src), destDir, version) };
    } catch (err) {
      debug(`${base.target} not installed`, err);
      return { ...base, ...nothing('failed') };
    }
  });
}

// SECURITY: the message is shown in the session, so text that comes from files (a version
// string, file names) is cut to plain printable characters first.
const plain = (text, max = 60) => String(text).replace(/[^\x20-\x7e]/g, '?').slice(0, max);
const tilde = (dir) => {
  const home = os.homedir();
  return plain(dir.startsWith(home + path.sep) ? `~${dir.slice(home.length)}` : dir, 120);
};

// A rule whose frontmatter has `paths:` loads only for matching files, so it is not read up front.
function loadsEverySession(file) {
  try {
    const front = fs.readFileSync(file, 'utf8').slice(0, 2000).match(/^---\r?\n([\s\S]*?)\r?\n---/);
    return !(front && /^paths:/m.test(front[1]));
  } catch {
    // Unreadable now: leave it out of the note; it loads next session like the rest.
    return false;
  }
}

// WORKAROUND: Claude Code reads the rules folder before this hook runs, so rules written now
// are not in this session. This note goes into the session's context and asks Claude to read
// them first. Null when no always-loaded rule was written.
export function readNow(results) {
  const files = results.filter((r) => r.isRules).flatMap((r) => r.writtenFiles.map((name) => path.join(r.destDir, name))).filter(loadsEverySession);
  if (files.length === 0) return null;
  return [
    'nextc-core installed or updated these rule files while this session was starting, so this session did not load them.',
    'They are the user\'s mandatory rules. Before doing anything else, read each file in full and follow it for the rest of the session.',
    'Where a file differs from a rule that is already loaded, the file is the current version.',
    ...files,
  ].join('\n');
}

// What to tell the person, or null when there is nothing new to say. Rules load when a
// session starts, so files written now load by themselves from the next one. A file that is
// kept is named once, the first time it is kept.
export function message(results, version) {
  const written = results.reduce((n, r) => n + r.written, 0);
  const removed = results.reduce((n, r) => n + r.removed, 0);
  const kept = results.flatMap((r) => r.kept.map((k) => `${r.target}/${k}`));
  const newlyKept = results.flatMap((r) => r.newlyKept.map((k) => `${r.target}/${k}`));
  const failed = results.filter((r) => r.state === 'failed').map((r) => r.target);
  if (written === 0 && removed === 0 && newlyKept.length === 0 && failed.length === 0) return null;
  const where = results.filter((r) => r.state === 'installed').map((r) => tilde(r.destDir)).join(' and ');
  const parts = [];
  if (written > 0 || removed > 0) parts.push(`nextc-core ${plain(version, 20)} installed its rules in ${where} (${written} file${written === 1 ? '' : 's'} written${removed > 0 ? `, ${removed} removed` : ''}). Claude Code loads them by itself from your next session${readNow(results) === null ? '' : '; in this one Claude was asked to read them first'}.`);
  else parts.push(`nextc-core ${plain(version, 20)} checked its rules in ${where || 'your Claude config folder'}.`);
  if (kept.length > 0) parts.push(`Left as they are because they were edited, linked or unreadable: ${kept.slice(0, 12).map((k) => plain(k)).join(', ')}${kept.length > 12 ? ` and ${kept.length - 12} more` : ''}. Delete one to get the shipped version back.`);
  if (failed.length > 0) parts.push(`Could not install: ${failed.map((f) => plain(f)).join(', ')}.`);
  parts.push('Turn this off with install_rules in /config.');
  return parts.join(' ');
}

// EXTERNAL: Claude Code exports each plugin option to hook processes as
// CLAUDE_PLUGIN_OPTION_<KEY>; a boolean arrives as text.
export const isOff = (value) => ['false', '0', 'no', 'off'].includes(String(value ?? '').trim().toLowerCase());

function versionOf(pluginRoot) {
  try {
    return String(JSON.parse(fs.readFileSync(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8')).version ?? 'unknown');
  } catch {
    // A plugin folder without a readable manifest still installs; the record just says so.
    return 'unknown';
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  try {
    if (!isOff(process.env.CLAUDE_PLUGIN_OPTION_INSTALL_RULES)) {
      const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.dirname(path.dirname(fileURLToPath(import.meta.url)));
      const homeClaudeDir = path.join(os.homedir(), '.claude');
      // EXTERNAL: CLAUDE_CONFIG_DIR moves the config dir, and with it rules/, for people who set it.
      const claudeDir = process.env.CLAUDE_CONFIG_DIR || homeClaudeDir;
      const version = versionOf(pluginRoot);
      const results = install({ pluginRoot, claudeDir, homeClaudeDir, version });
      const text = message(results, version);
      const note = readNow(results);
      // EXTERNAL: Claude Code shows systemMessage to the person and adds additionalContext to the session.
      if (text !== null) process.stdout.write(`${JSON.stringify({ systemMessage: text, ...(note === null ? {} : { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: note } }) })}\n`);
    }
  } catch (err) {
    // A session must start whatever happens here; the reason goes to the hook's debug output.
    debug('not run', err);
  }
}
