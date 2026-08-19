import { describe, expect, it } from 'vitest'
import { parseNumstat, sumNumstat } from '../src/git/parse-numstat.ts'

describe('parseNumstat', () => {
  it('parses text file line counts', () => {
    const map = parseNumstat('3\t1\tsrc/a.ts\0')
    expect(map.get('src/a.ts')).toEqual({
      additions: 3,
      deletions: 1,
      binary: false,
    })
  })

  it('tolerates a trailing newline when -z was omitted', () => {
    const map = parseNumstat('3\t0\tsrc/a.ts\n')
    expect(map.get('src/a.ts')).toEqual({
      additions: 3,
      deletions: 0,
      binary: false,
    })
  })

  it('marks binary files', () => {
    const map = parseNumstat('-\t-\tassets/logo.png\0')
    expect(map.get('assets/logo.png')).toEqual({
      additions: null,
      deletions: null,
      binary: true,
    })
  })

  it('aggregates duplicate paths within one numstat stream', () => {
    const map = parseNumstat('1\t0\tsrc/a.ts\0' + '2\t1\tsrc/a.ts\0')
    expect(map.get('src/a.ts')).toEqual({
      additions: 3,
      deletions: 1,
      binary: false,
    })
    expect(sumNumstat(map)).toEqual({ additions: 3, deletions: 1 })
  })

  it('parses --no-index / rename NUL form as the destination path', () => {
    const map = parseNumstat('3\t0\t\0/dev/null\0fresh.txt\0')
    expect(map.get('fresh.txt')).toEqual({
      additions: 3,
      deletions: 0,
      binary: false,
    })
  })
})
