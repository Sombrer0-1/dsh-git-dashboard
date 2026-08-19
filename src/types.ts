/**
 * Client-safe Git dashboard wire types shared by Host Remote and Browser UI.
 * @module dsh-git-dashboard/types
 */

/** Stable Host failure codes surfaced without stderr or absolute paths. */
export type GitUnavailableCode =
  | 'not-repository'
  | 'workspace-missing'
  | 'git-error'
  | 'timeout'
  | 'output-too-large'

/** Expected environmental failure returned by every Remote method. */
export interface GitUnavailable {
  readonly kind: 'unavailable'
  readonly code: GitUnavailableCode
}

/** Workspace path is not inside a Git worktree. */
export interface GitNotRepository {
  readonly kind: 'not-repository'
}

/** Resolved HEAD ref or detached short OID. */
export interface GitHead {
  readonly oidShort: string
  readonly ref?: string
}

/** Upstream tracking branch and rev-list ahead/behind counts. */
export interface GitUpstream {
  readonly ref: string
  readonly ahead: number
  readonly behind: number
}

/** Aggregate working-tree counters for the dashboard header. */
export interface GitCounts {
  readonly files: number
  readonly staged: number
  readonly unstaged: number
  readonly untracked: number
  readonly conflicts: number
  readonly additions: number
  readonly deletions: number
}

/** Porcelain-derived file status labels exposed to the Browser. */
export type GitFileStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'unmerged'
  | 'untracked'

/** One changed path with line stats when numstat succeeded. */
export interface GitChangedFile {
  readonly path: string
  readonly status: GitFileStatus
  /** True when the index differs from HEAD for this path. */
  readonly staged: boolean
  /** True when the worktree differs from the index for this path. */
  readonly unstaged: boolean
  readonly binary: boolean
  readonly additions: number | null
  readonly deletions: number | null
}

/** Successful repository snapshot payload. */
export interface GitRepositorySnapshot {
  readonly kind: 'repository'
  readonly repositoryName: string
  readonly scopePrefix: string
  readonly head: GitHead
  readonly upstream?: GitUpstream
  readonly counts: GitCounts
  readonly files: readonly GitChangedFile[]
  readonly complete: boolean
  readonly observedAt: number
}

/** Discriminated snapshot returned by `gitDashboard/snapshot`. */
export type GitSnapshot = GitRepositorySnapshot | GitNotRepository | GitUnavailable

/** Local or remote-tracking branch entry for compare selection. */
export interface GitBranch {
  readonly ref: string
  readonly displayName: string
  readonly oidShort: string
  readonly type: 'local' | 'remote'
}

/** Successful branch list payload. */
export interface GitRepositoryBranches {
  readonly kind: 'repository'
  readonly branches: readonly GitBranch[]
  readonly complete: boolean
  readonly observedAt: number
}

/** Discriminated branch list returned by `gitDashboard/branches`. */
export type GitBranchesResult = GitRepositoryBranches | GitNotRepository | GitUnavailable

/**
 * File-level diff summary between a fixed base OID and HEAD.
 * OID fields are full object ids; the Browser shortens them for display.
 */
export interface GitRepositoryCompare {
  readonly kind: 'repository'
  readonly baseRef: string
  readonly headRef: string
  readonly baseOid: string
  readonly headOid: string
  readonly ahead: number
  readonly behind: number
  readonly counts: GitCounts
  readonly files: readonly GitChangedFile[]
  readonly complete: boolean
  readonly observedAt: number
}

/** Discriminated compare summary returned by `gitDashboard/compare`. */
export type GitCompareResult = GitRepositoryCompare | GitNotRepository | GitUnavailable

/** One display line inside a bounded file-diff preview. */
export type GitDiffLineKind = 'meta' | 'hunk' | 'context' | 'add' | 'del'

/** Parsed unified-diff line for Browser rendering. */
export interface GitDiffLine {
  readonly kind: GitDiffLineKind
  /** Line body without the leading `+` / `-` / space marker for content lines. */
  readonly text: string
}

/** Successful small-file working-tree preview versus HEAD. */
export interface GitFileDiffPreview {
  readonly kind: 'preview'
  readonly path: string
  readonly lines: readonly GitDiffLine[]
  readonly additions: number
  readonly deletions: number
  readonly observedAt: number
}

/** Diff exists but exceeds configured line or byte limits, or is binary. */
export interface GitFileDiffTooLarge {
  readonly kind: 'too-large'
  readonly path: string
  readonly reason: 'lines' | 'bytes' | 'binary'
  readonly additions: number | null
  readonly deletions: number | null
}

/** Path has no working-tree difference versus HEAD. */
export interface GitFileDiffEmpty {
  readonly kind: 'empty'
  readonly path: string
}

/** Diff preview is intentionally withheld for this path class. */
export interface GitFileDiffUnsupported {
  readonly kind: 'unsupported'
  readonly path: string
  readonly reason: 'untracked' | 'conflict' | 'unsafe-path'
}

/** Discriminated file diff returned by `gitDashboard/fileDiff`. */
export type GitFileDiffResult =
  | GitFileDiffPreview
  | GitFileDiffTooLarge
  | GitFileDiffEmpty
  | GitFileDiffUnsupported
  | GitNotRepository
  | GitUnavailable

/** @deprecated Alias kept for Browser imports that name the repository compare shape. */
export type GitCompareSummary = GitRepositoryCompare
