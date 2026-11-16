// Finds and reads the project runs the repo's skills record, through $.fs, read-only. A scan
// is a fixed handful of stat calls at known paths under the session's folder (and its git
// root); a file is read again only when its modification time or size changed.
import type { EngineInterface } from 'claude-code'

import type { RunSource } from '../types'
import {
  asoSource,
  buildSource,
  exploreSource,
  kickoffSource,
  parseAsoState,
  parseBuildlog,
  parseEvidenceIndex,
  parseExploreState,
  parseKickoffState,
  type LogFile,
} from './lib/sources'
import { debug } from './monitor'

type $ = EngineInterface

// MAGIC: a buildlog or state file past 2 MB is not something these skills write; it is skipped
// rather than read every time it changes.
const MAX_READ_BYTES = 2 * 1024 * 1024
// MAGIC: at most this many idea-explore run folders are checked per scan, last names first,
// so a project with many past explorations still costs a bounded number of stat calls.
const IDEA_DIRS_MAX = 8
// MAGIC: how far up from the session folder the git root is looked for; deeper is not a project.
const GIT_ROOT_LEVELS = 12

// SECURITY: an idea-explore folder name comes from a directory listing and is joined to a path;
// only plain names are accepted, so "..", hidden names or separators never reach $.fs.
const SLUG = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/

type Cached = { mtimeMs: number; size: number; value: unknown }
const cache = new Map<string, Cached>()
const gitRoots = new Map<string, string | null>()

async function statOf($: $, path: string) {
  try {
    return await $.fs.stat(path)
  } catch {
    // Absent is the usual answer: most projects have none of these files.
    return null
  }
}

async function readParsed<T>($: $, path: string, parse: (text: string) => T | null): Promise<{ value: T; mtimeMs: number } | null> {
  const st = await statOf($, path)
  if (st === null || st.kind !== 'file' || st.size > MAX_READ_BYTES) return null
  const hit = cache.get(path)
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.value === null ? null : { value: hit.value as T, mtimeMs: st.mtimeMs }
  let value: T | null = null
  try {
    value = parse(await $.fs.read(path))
  } catch (err) {
    debug($, `read ${path}`, err)
  }
  cache.set(path, { mtimeMs: st.mtimeMs, size: st.size, value })
  return value === null ? null : { value, mtimeMs: st.mtimeMs }
}

async function logsIn($: $, dir: string): Promise<LogFile[]> {
  try {
    const entries = await $.fs.list(dir)
    return entries.filter((e) => e.kind === 'file' && e.name.endsWith('.log')).map((e) => ({ name: e.name, mtimeMs: e.mtimeMs }))
  } catch {
    // No logs folder yet: the build has not started writing.
    return []
  }
}

export async function gitRootOf($: $, cwd: string): Promise<string | null> {
  if (gitRoots.has(cwd)) return gitRoots.get(cwd) ?? null
  let dir = cwd.replace(/\/+$/, '')
  let found: string | null = null
  for (let i = 0; i < GIT_ROOT_LEVELS && dir !== ''; i++) {
    if ((await statOf($, `${dir}/.git`)) !== null) {
      found = dir
      break
    }
    const up = dir.slice(0, dir.lastIndexOf('/'))
    if (up === dir) break
    dir = up
  }
  gitRoots.set(cwd, found)
  return found
}

async function scanRoot($: $, root: string, now: number): Promise<RunSource[]> {
  const out: RunSource[] = []
  // EXTERNAL: /flutter-build and /unity-build write docs/buildlog.md; logs go to build/logs/
  // (Flutter) or Builds/logs/ (Unity), per their SKILL.md files.
  const buildlog = await readParsed($, `${root}/docs/buildlog.md`, parseBuildlog)
  if (buildlog !== null) {
    const isInProgress = buildlog.value.status === 'in progress'
    const logs = isInProgress ? [...(await logsIn($, `${root}/build/logs`)), ...(await logsIn($, `${root}/Builds/logs`))] : []
    out.push(buildSource(buildlog.value, buildlog.mtimeMs, logs, now, root))
  }
  // EXTERNAL: /product-explore runs evidence-check.mjs with --dir docs/explore.
  const explore = await readParsed($, `${root}/docs/explore/state.json`, parseExploreState)
  if (explore !== null) {
    const index = await readParsed($, `${root}/docs/explore/evidence/_index.json`, parseEvidenceIndex)
    const mtime = Math.max(explore.mtimeMs, index?.mtimeMs ?? 0)
    out.push(exploreSource('explore', 'explore', explore.value, index?.value ?? null, mtime, now, `${root}/docs/explore`))
  }
  // EXTERNAL: /idea-explore runs it with --dir docs/idea-explorations/<slug>.
  try {
    const ideas = await $.fs.list(`${root}/docs/idea-explorations`)
    const slugs = ideas.filter((e) => e.kind === 'dir' && SLUG.test(e.name)).map((e) => e.name).sort().reverse().slice(0, IDEA_DIRS_MAX)
    for (const slug of slugs) {
      const dir = `${root}/docs/idea-explorations/${slug}`
      const st = await readParsed($, `${dir}/state.json`, parseExploreState)
      if (st === null) continue
      const index = await readParsed($, `${dir}/evidence/_index.json`, parseEvidenceIndex)
      out.push(exploreSource('idea', `idea ${slug}`, st.value, index?.value ?? null, Math.max(st.mtimeMs, index?.mtimeMs ?? 0), now, dir))
    }
  } catch {
    // No idea-explore folder in this project.
  }
  // EXTERNAL: nextc-aso/scripts/state.mjs defaults --root to ./aso.
  const aso = await readParsed($, `${root}/aso/.pipeline-state.json`, parseAsoState)
  if (aso !== null) out.push(asoSource(aso.value, aso.mtimeMs, now, `${root}/aso`))
  // EXTERNAL: kickoff-state.mjs keeps <project>/.kickoff/state.json.
  const kickoff = await readParsed($, `${root}/.kickoff/state.json`, parseKickoffState)
  if (kickoff !== null) out.push(kickoffSource(kickoff.value, kickoff.mtimeMs, now, root))
  return out
}

export async function scanProjects($: $, now: number): Promise<RunSource[]> {
  const cwd = await $.session.cwd()
  const isAbsolute = cwd.startsWith('/') || /^[A-Za-z]:[\\/]/.test(cwd)
  if (!isAbsolute) return []
  const roots = [cwd.replace(/\/+$/, '')]
  const git = await gitRootOf($, cwd)
  if (git !== null && git !== roots[0]) roots.push(git)
  const all: RunSource[] = []
  for (const root of roots) all.push(...(await scanRoot($, root, now)))
  return all
}
