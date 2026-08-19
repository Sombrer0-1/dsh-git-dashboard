import { describe, expect, it } from 'vitest'
import { parseStatusPorcelainV2 } from '../src/git/parse-status.ts'

const CLEAN = [
  '# branch.oid abcdef1234567890abcdef1234567890abcd',
  '# branch.head main',
  '# branch.upstream origin/main',
  '# branch.ab +2 -1',
].join('\0') + '\0'

const MODIFIED = [
  '# branch.oid abcdef1234567890abcdef1234567890abcd',
  '# branch.head main',
  '1 M. N... 100644 100644 100644 a1b2c3d e5f6g7h src/file.ts',
  '',
].join('\0')

describe('parseStatusPorcelainV2', () => {
  it('parses branch metadata on a clean tree', () => {
    const parsed = parseStatusPorcelainV2(CLEAN)
    expect(parsed.branch.head.oidShort).toBe('abcdef1')
    expect(parsed.branch.head.ref).toBe('main')
    expect(parsed.branch.upstream).toEqual({
      ref: 'origin/main',
      ahead: 2,
      behind: 1,
    })
    expect(parsed.files).toEqual([])
    expect(parsed.counts).toEqual({
      staged: 0,
      unstaged: 0,
      untracked: 0,
      conflicts: 0,
    })
  })

  it('parses modified and untracked entries', () => {
    const stdout = [
      '# branch.oid abcdef1234567890abcdef1234567890abcd',
      '# branch.head feature',
      '1 .M N... 100644 100644 100644 a b src/mod.ts',
      '? untracked.txt',
      '',
    ].join('\0')
    const parsed = parseStatusPorcelainV2(stdout)
    expect(parsed.files).toHaveLength(2)
    expect(parsed.files[0]).toMatchObject({
      path: 'src/mod.ts',
      status: 'modified',
      staged: false,
      unstaged: true,
    })
    expect(parsed.files[1]).toMatchObject({
      path: 'untracked.txt',
      status: 'untracked',
    })
    expect(parsed.counts.untracked).toBe(1)
    expect(parsed.counts.unstaged).toBe(1)
  })

  it('parses staged modifications from porcelain v2', () => {
    const parsed = parseStatusPorcelainV2(MODIFIED)
    expect(parsed.files[0]).toMatchObject({
      path: 'src/file.ts',
      status: 'modified',
      staged: true,
      unstaged: false,
    })
    expect(parsed.counts.staged).toBe(1)
    // `M.` = staged only; worktree `.` must not inflate unstaged.
    expect(parsed.counts.unstaged).toBe(0)
  })

  it('counts staged and unstaged separately for MM entries', () => {
    const stdout = [
      '# branch.oid abcdef1234567890abcdef1234567890abcd',
      '# branch.head main',
      '1 MM N... 100644 100644 100644 a b both.ts',
      '1 M. N... 100644 100644 100644 a b staged-only.ts',
      '1 .M N... 100644 100644 100644 a b unstaged-only.ts',
      '',
    ].join('\0')
    const parsed = parseStatusPorcelainV2(stdout)
    expect(parsed.counts.staged).toBe(2)
    expect(parsed.counts.unstaged).toBe(2)
  })

  it('drops unsafe absolute paths', () => {
    const stdout = [
      '# branch.head main',
      '? /etc/passwd',
      '',
    ].join('\0')
    const parsed = parseStatusPorcelainV2(stdout)
    expect(parsed.files).toEqual([])
  })
})
