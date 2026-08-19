/**
 * Path validation and scope pathspec helpers for Git dashboard collection.
 * @module dsh-git-dashboard/git/paths
 */
/**
 * True when a repository-relative path must not be forwarded to the Client.
 * @param candidate - path segment from Git output or user-facing validation.
 */
export declare function isUnsafeRepositoryPath(candidate: string): boolean;
/**
 * Normalize a trusted relative path to POSIX without `..` or `.` segments.
 * @param relative - relative path under a repository root.
 * @returns normalized POSIX path (may be empty at the root).
 * @throws when the path escapes with `..`.
 */
export declare function normalizePosixRelative(relative: string): string;
/**
 * Convert platform paths to POSIX separators for Git and the Remote API.
 * @param value - filesystem path segment.
 */
export declare function toPosixPath(value: string): string;
/**
 * Workspace directory relative to the repository root as a POSIX path.
 * @param repoRoot - absolute repository toplevel from `rev-parse --show-toplevel`.
 * @param workspacePath - absolute workspace directory.
 * @returns empty string when the workspace is the repository root.
 */
export declare function scopePrefix(repoRoot: string, workspacePath: string): string;
/**
 * Literal pathspec argument for `git status` scoped to one workspace.
 * @param prefix - {@link scopePrefix} value (empty means whole repository).
 * @returns pathspec argv tail after `--`, or empty when unscoped.
 */
export declare function statusScopeArgs(prefix: string): readonly string[];
/**
 * Reject a compare ref string that cannot be passed to `rev-parse` safely.
 * @param ref - user-selected branch or tag name from the Client.
 */
export declare function assertSafeCompareRef(ref: string): void;
/**
 * Normalize a Client-supplied repository-relative file path for `git diff`.
 * @param candidate - path from the Browser file list.
 * @param prefix - workspace scope under the repository root (may be empty).
 * @returns POSIX path relative to the repository root.
 * @throws when the path is unsafe or outside the workspace scope.
 */
export declare function assertScopedFilePath(candidate: string, prefix: string): string;
//# sourceMappingURL=paths.d.ts.map