/**
 * Parser for `git status --porcelain=v2 --branch -z`.
 * @module dsh-git-dashboard/git/parse-status
 */
import type { GitChangedFile, GitHead, GitUpstream } from '../types.ts';
/** Branch metadata extracted from porcelain v2 header lines. */
export interface ParsedStatusBranch {
    head: GitHead;
    upstream?: GitUpstream;
}
/** Parsed porcelain v2 status body. */
export interface ParsedStatus {
    branch: ParsedStatusBranch;
    files: GitChangedFile[];
    counts: {
        staged: number;
        unstaged: number;
        untracked: number;
        conflicts: number;
    };
}
/**
 * Parse NUL-delimited porcelain v2 status output.
 * @param stdout - raw git stdout (NUL-separated records).
 * @returns structured branch metadata and changed files.
 */
export declare function parseStatusPorcelainV2(stdout: string): ParsedStatus;
//# sourceMappingURL=parse-status.d.ts.map