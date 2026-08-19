/**
 * Parser for `git for-each-ref` NUL-delimited output.
 * @module dsh-git-dashboard/git/parse-refs
 */
import type { GitBranch } from '../types.ts';
/**
 * Parse for-each-ref output where each line carries three NUL-separated fields.
 * @param stdout - raw for-each-ref stdout.
 */
export declare function parseForEachRef(stdout: string): GitBranch[];
//# sourceMappingURL=parse-refs.d.ts.map