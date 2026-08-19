/**
 * Parser for `git for-each-ref` NUL-delimited output.
 * @module dsh-git-dashboard/git/parse-refs
 */

import type { GitBranch } from '../types.ts'

/**
 * Parse for-each-ref output where each line carries three NUL-separated fields.
 * @param stdout - raw for-each-ref stdout.
 */
export function parseForEachRef(stdout: string): GitBranch[] {
  const branches: GitBranch[] = []
  for (const line of stdout.split('\n')) {
    if (line.length === 0) continue
    const parts = line.split('\0')
    if (parts.length < 3) continue
    const ref = parts[0] ?? ''
    const oidShort = parts[1] ?? ''
    const shortName = parts[2] ?? ''
    if (ref.startsWith('refs/heads/')) {
      branches.push({
        ref,
        displayName: shortName,
        oidShort,
        type: 'local',
      })
    } else if (ref.startsWith('refs/remotes/')) {
      branches.push({
        ref,
        displayName: shortName,
        oidShort,
        type: 'remote',
      })
    }
  }
  return branches
}
