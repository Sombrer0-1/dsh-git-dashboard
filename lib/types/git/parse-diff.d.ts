/**
 * Parse a single-file unified `git diff` stdout into display lines.
 * @module dsh-git-dashboard/git/parse-diff
 */
import type { GitDiffLine } from '../types.ts';
/**
 * Count added and deleted content lines in a unified diff body.
 * @param stdout - raw `git diff` text for one path.
 */
export declare function countChangedLines(stdout: string): {
    additions: number;
    deletions: number;
};
/**
 * Classify unified-diff lines for the Browser preview.
 * Drops the `diff --git` / `index` / `---` / `+++` headers after recording them as meta.
 * @param stdout - raw `git diff` text for one path.
 */
export declare function parseUnifiedDiff(stdout: string): GitDiffLine[];
//# sourceMappingURL=parse-diff.d.ts.map