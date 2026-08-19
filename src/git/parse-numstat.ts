/**
 * Parser for `git diff --numstat -z`.
 * @module dsh-git-dashboard/git/parse-numstat
 */

import { isUnsafeRepositoryPath, normalizePosixRelative } from './paths.ts'

/** Line-count facts for one repository-relative path. */
export interface NumstatEntry {
  additions: number | null
  deletions: number | null
  binary: boolean
}

function parseCount(value: string): number | null {
  if (value === '-') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function safePath(raw: string): string | undefined {
  if (isUnsafeRepositoryPath(raw)) return undefined
  try {
    return normalizePosixRelative(raw)
  } catch {
    return undefined
  }
}

/**
 * Parse NUL-delimited numstat records into a path-indexed map.
 *
 * Ordinary: `added\\tdeleted\\tpath\\0`
 * Rename/copy (and `--no-index` vs `/dev/null`): `added\\tdeleted\\t\\0from\\0to\\0`
 *
 * @param stdout - raw `git diff --numstat -z` output.
 * @returns map keyed by POSIX repository-relative path (the "to" side for renames).
 */
export function parseNumstat(stdout: string): Map<string, NumstatEntry> {
  const entries = new Map<string, NumstatEntry>()
  const parts = stdout.split('\0')
  let index = 0
  while (index < parts.length) {
    const record = parts[index] ?? ''
    index += 1
    if (record.length === 0) continue

    const tab = record.indexOf('\t')
    if (tab === -1) continue
    const rest = record.slice(tab + 1)
    const secondTab = rest.indexOf('\t')
    if (secondTab === -1) continue
    const additionsRaw = record.slice(0, tab)
    const deletionsRaw = rest.slice(0, secondTab)
    let pathRaw = rest.slice(secondTab + 1).replace(/\r?\n$/, '')

    // Rename/copy / --no-index empty-path form: path is carried in the next two NUL fields.
    if (pathRaw.length === 0) {
      const from = parts[index] ?? ''
      const to = parts[index + 1] ?? ''
      index += 2
      pathRaw = to.length > 0 ? to : from
    }

    const path = safePath(pathRaw)
    if (path === undefined) continue
    const additions = parseCount(additionsRaw)
    const deletions = parseCount(deletionsRaw)
    const binary = additions === null && deletions === null
    const prior = entries.get(path)
    if (prior === undefined) {
      entries.set(path, { additions, deletions, binary })
      continue
    }
    entries.set(path, {
      additions: sumNullable(prior.additions, additions),
      deletions: sumNullable(prior.deletions, deletions),
      binary: prior.binary || binary,
    })
  }
  return entries
}

function sumNullable(left: number | null, right: number | null): number | null {
  if (left === null || right === null) return null
  return left + right
}

/**
 * Sum additions and deletions across all numstat entries.
 * @param entries - path-indexed numstat map.
 */
export function sumNumstat(entries: ReadonlyMap<string, NumstatEntry>): { additions: number; deletions: number } {
  let additions = 0
  let deletions = 0
  for (const entry of entries.values()) {
    if (entry.additions !== null) additions += entry.additions
    if (entry.deletions !== null) deletions += entry.deletions
  }
  return { additions, deletions }
}
