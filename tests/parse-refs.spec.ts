import { describe, expect, it } from 'vitest'
import { parseForEachRef } from '../src/git/parse-refs.ts'

describe('parseForEachRef', () => {
  it('parses local and remote branches', () => {
    const stdout = [
      'refs/heads/main\0abcd123\0main',
      'refs/remotes/origin/main\0abcd123\0origin/main',
    ].join('\n') + '\n'
    const branches = parseForEachRef(stdout)
    expect(branches).toEqual([
      {
        ref: 'refs/heads/main',
        displayName: 'main',
        oidShort: 'abcd123',
        type: 'local',
      },
      {
        ref: 'refs/remotes/origin/main',
        displayName: 'origin/main',
        oidShort: 'abcd123',
        type: 'remote',
      },
    ])
  })
})
