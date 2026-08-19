/**
 * Path validation and scope pathspec helpers for Git dashboard collection.
 * @module dsh-git-dashboard/git/paths
 */

import path from 'node:path'

/** Magic pathspec prefixes Git interprets specially. */
const MAGIC_PATHSPEC = /^[:^~]|[*?[]|\*\*/

/**
 * True when a repository-relative path must not be forwarded to the Client.
 * @param candidate - path segment from Git output or user-facing validation.
 */
export function isUnsafeRepositoryPath(candidate: string): boolean {
  if (candidate.length === 0) return true
  if (candidate.includes('\0')) return true
  if (path.isAbsolute(candidate)) return true
  if (/^[A-Za-z]:[/\\]/.test(candidate)) return true
  if (candidate.startsWith('/')) return true
  if (MAGIC_PATHSPEC.test(candidate)) return true
  const posix = toPosixPath(candidate)
  return posix.split('/').some(segment => segment === '..')
}

/**
 * Normalize a trusted relative path to POSIX without `..` or `.` segments.
 * @param relative - relative path under a repository root.
 * @returns normalized POSIX path (may be empty at the root).
 * @throws when the path escapes with `..`.
 */
export function normalizePosixRelative(relative: string): string {
  const parts = toPosixPath(relative).split('/')
  const out: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') throw new Error('path escapes repository root with ..')
    out.push(part)
  }
  return out.join('/')
}

/**
 * Convert platform paths to POSIX separators for Git and the Remote API.
 * @param value - filesystem path segment.
 */
export function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/')
}

/**
 * Workspace directory relative to the repository root as a POSIX path.
 * @param repoRoot - absolute repository toplevel from `rev-parse --show-toplevel`.
 * @param workspacePath - absolute workspace directory.
 * @returns empty string when the workspace is the repository root.
 */
export function scopePrefix(repoRoot: string, workspacePath: string): string {
  const relative = path.relative(repoRoot, workspacePath)
  if (relative === '') return ''
  return normalizePosixRelative(relative)
}

/**
 * Literal pathspec argument for `git status` scoped to one workspace.
 * @param prefix - {@link scopePrefix} value (empty means whole repository).
 * @returns pathspec argv tail after `--`, or empty when unscoped.
 */
export function statusScopeArgs(prefix: string): readonly string[] {
  if (prefix === '') return []
  return ['--', prefix]
}

/**
 * Reject a compare ref string that cannot be passed to `rev-parse` safely.
 * @param ref - user-selected branch or tag name from the Client.
 */
export function assertSafeCompareRef(ref: string): void {
  if (ref.trim().length === 0) throw new Error('compare ref must be non-empty')
  if (ref.includes('\0')) throw new Error('compare ref must not contain NUL')
  if (ref.startsWith('-')) throw new Error('compare ref must not look like an option')
}

/**
 * Normalize a Client-supplied repository-relative file path for `git diff`.
 * @param candidate - path from the Browser file list.
 * @param prefix - workspace scope under the repository root (may be empty).
 * @returns POSIX path relative to the repository root.
 * @throws when the path is unsafe or outside the workspace scope.
 */
export function assertScopedFilePath(candidate: string, prefix: string): string {
  if (isUnsafeRepositoryPath(candidate)) throw new Error('unsafe file path')
  const normalized = normalizePosixRelative(candidate)
  if (normalized.length === 0) throw new Error('empty file path')
  if (prefix !== '' && normalized !== prefix && !normalized.startsWith(`${prefix}/`)) {
    throw new Error('file path outside workspace scope')
  }
  return normalized
}