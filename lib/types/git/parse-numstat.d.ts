/**
 * Parser for `git diff --numstat -z`.
 * @module dsh-git-dashboard/git/parse-numstat
 */
/** Line-count facts for one repository-relative path. */
export interface NumstatEntry {
    additions: number | null;
    deletions: number | null;
    binary: boolean;
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
export declare function parseNumstat(stdout: string): Map<string, NumstatEntry>;
/**
 * Sum additions and deletions across all numstat entries.
 * @param entries - path-indexed numstat map.
 */
export declare function sumNumstat(entries: ReadonlyMap<string, NumstatEntry>): {
    additions: number;
    deletions: number;
};
//# sourceMappingURL=parse-numstat.d.ts.map