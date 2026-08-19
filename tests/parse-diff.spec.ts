import { describe, expect, it } from 'vitest'
import { countChangedLines, parseUnifiedDiff } from '../src/git/parse-diff.ts'

const SAMPLE = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@
 keep
-old
+new
+extra
`

describe('parseUnifiedDiff', () => {
  it('drops headers and classifies content lines', () => {
    expect(parseUnifiedDiff(SAMPLE)).toEqual([
      { kind: 'hunk', text: '@@ -1,3 +1,4 @@' },
      { kind: 'context', text: 'keep' },
      { kind: 'del', text: 'old' },
      { kind: 'add', text: 'new' },
      { kind: 'add', text: 'extra' },
    ])
  })

  it('counts changed lines without header markers', () => {
    expect(countChangedLines(SAMPLE)).toEqual({ additions: 2, deletions: 1 })
  })
})
