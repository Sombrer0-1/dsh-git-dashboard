import { describe, expect, it } from 'vitest'
import { buildDiffBlocks } from '../src/client/DiffPreview.tsx'

describe('buildDiffBlocks', () => {
  it('numbers add/del/context lines from hunk headers', () => {
    const blocks = buildDiffBlocks([
      { kind: 'hunk', text: '@@ -10,3 +10,4 @@' },
      { kind: 'context', text: 'keep' },
      { kind: 'del', text: 'old' },
      { kind: 'add', text: 'new' },
      { kind: 'add', text: 'extra' },
    ])
    expect(blocks).toEqual([
      { type: 'hunk', text: '@@ -10,3 +10,4 @@' },
      {
        type: 'lines',
        lines: [
          { kind: 'context', text: 'keep', oldNo: 10, newNo: 10 },
        ],
      },
      {
        type: 'lines',
        lines: [
          { kind: 'del', text: 'old', oldNo: 11, newNo: null },
          { kind: 'add', text: 'new', oldNo: null, newNo: 11 },
          { kind: 'add', text: 'extra', oldNo: null, newNo: 12 },
        ],
      },
    ])
  })

  it('collapses long unmodified runs', () => {
    const blocks = buildDiffBlocks([
      { kind: 'hunk', text: '@@ -1,6 +1,6 @@' },
      { kind: 'context', text: 'a' },
      { kind: 'context', text: 'b' },
      { kind: 'context', text: 'c' },
      { kind: 'context', text: 'd' },
      { kind: 'add', text: 'e' },
    ])
    expect(blocks[1]).toMatchObject({ type: 'collapse' })
    if (blocks[1]?.type !== 'collapse') return
    expect(blocks[1].lines).toHaveLength(4)
  })
})
