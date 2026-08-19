/**
 * Large-file-style inline diff preview: gutters, whole-line tints, and
 * collapsible unmodified runs. No syntax highlighting.
 */

import { useMemo, useState, type ReactNode } from 'react'
import {
  IconChevronDownOutline14,
  IconChevronUpOutline14,
  IconCloseOutline16,
  IconCopyOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { GitDiffLine, GitFileDiffPreview } from '../types.ts'
import { NS } from './locales.ts'
import css from './DiffPreview.module.css'

/** Consecutive context lines at or above this count collapse by default. */
const COLLAPSE_CONTEXT_AT = 4

interface NumberedLine {
  readonly kind: 'add' | 'del' | 'context'
  readonly text: string
  readonly oldNo: number | null
  readonly newNo: number | null
}

type DiffBlock =
  | { readonly type: 'hunk'; readonly text: string }
  | { readonly type: 'lines'; readonly lines: readonly NumberedLine[] }
  | {
    readonly type: 'collapse'
    readonly id: string
    readonly lines: readonly NumberedLine[]
  }

/**
 * Parse a unified hunk header into starting old/new line numbers.
 * @param text - hunk line including the `@@` markers.
 */
function parseHunkStarts(text: string): { oldStart: number; newStart: number } | null {
  const match = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/.exec(text)
  if (match === null) return null
  return {
    oldStart: Number(match[1]),
    newStart: Number(match[2]),
  }
}

/**
 * Attach old/new line numbers and fold long unmodified runs.
 * @param source - Host-parsed unified diff lines.
 */
export function buildDiffBlocks(source: readonly GitDiffLine[]): DiffBlock[] {
  const numbered: Array<
    | { kind: 'hunk'; text: string }
    | NumberedLine
  > = []
  let oldNo = 0
  let newNo = 0

  for (const line of source) {
    if (line.kind === 'hunk') {
      const starts = parseHunkStarts(line.text)
      if (starts !== null) {
        oldNo = starts.oldStart
        newNo = starts.newStart
      }
      numbered.push({ kind: 'hunk', text: line.text })
      continue
    }
    if (line.kind === 'meta') continue
    if (line.kind === 'add') {
      numbered.push({ kind: 'add', text: line.text, oldNo: null, newNo })
      newNo += 1
      continue
    }
    if (line.kind === 'del') {
      numbered.push({ kind: 'del', text: line.text, oldNo, newNo: null })
      oldNo += 1
      continue
    }
    numbered.push({ kind: 'context', text: line.text, oldNo, newNo })
    oldNo += 1
    newNo += 1
  }

  const blocks: DiffBlock[] = []
  let pendingContext: NumberedLine[] = []
  let pendingChanged: NumberedLine[] = []
  let collapseSerial = 0

  const flushContext = (): void => {
    if (pendingContext.length === 0) return
    if (pendingContext.length >= COLLAPSE_CONTEXT_AT) {
      blocks.push({
        type: 'collapse',
        id: `collapse-${collapseSerial}`,
        lines: pendingContext,
      })
      collapseSerial += 1
    } else {
      blocks.push({ type: 'lines', lines: pendingContext })
    }
    pendingContext = []
  }

  const flushChanged = (): void => {
    if (pendingChanged.length === 0) return
    blocks.push({ type: 'lines', lines: pendingChanged })
    pendingChanged = []
  }

  for (const item of numbered) {
    if (item.kind === 'hunk') {
      flushContext()
      flushChanged()
      blocks.push({ type: 'hunk', text: item.text })
      continue
    }
    if (item.kind === 'context') {
      flushChanged()
      pendingContext.push(item)
      continue
    }
    flushContext()
    pendingChanged.push(item)
  }
  flushContext()
  flushChanged()
  return blocks
}

function lineRowClass(kind: NumberedLine['kind']): string {
  switch (kind) {
    case 'add': return css.rowAdd
    case 'del': return css.rowDel
    default: return css.rowContext
  }
}

function marker(kind: NumberedLine['kind']): string {
  switch (kind) {
    case 'add': return '+'
    case 'del': return '−'
    default: return ' '
  }
}

function DiffRows({ lines }: { lines: readonly NumberedLine[] }): ReactNode {
  return lines.map((line, index) => (
    <div key={`${line.kind}:${line.oldNo ?? 'x'}:${line.newNo ?? 'x'}:${index}`} className={lineRowClass(line.kind)}>
      <span className={css.gutterOld}>{line.oldNo ?? ''}</span>
      <span className={css.gutterNew}>{line.newNo ?? ''}</span>
      <span className={css.marker}>{marker(line.kind)}</span>
      <span className={css.code}>{line.text.length === 0 ? ' ' : line.text}</span>
    </div>
  ))
}

export interface DiffPreviewProps {
  path: string
  preview: GitFileDiffPreview
  t: TranslateNS<typeof NS>
  onClose(): void
}

/**
 * Reference-style inline diff surface for one small Host preview payload.
 * @param props - path, numbered preview, locale seat, and close handler.
 */
export function DiffPreview({ path, preview, t, onClose }: DiffPreviewProps) {
  const blocks = useMemo(() => buildDiffBlocks(preview.lines), [preview.lines])
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const [copied, setCopied] = useState(false)

  const copyDiff = async (): Promise<void> => {
    const text = preview.lines
      .map((line) => {
        if (line.kind === 'hunk' || line.kind === 'meta') return line.text
        if (line.kind === 'add') return `+${line.text}`
        if (line.kind === 'del') return `-${line.text}`
        return ` ${line.text}`
      })
      .join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => { setCopied(false) }, 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className={css.shell}>
      <div className={css.header}>
        <div className={css.headerMain}>
          <span className={css.path} title={path}>{path}</span>
          <span className={css.delta} aria-label={`+${preview.additions} −${preview.deletions}`}>
            <span className={css.deltaAdd}>+{preview.additions}</span>
            {' '}
            <span className={css.deltaDel}>−{preview.deletions}</span>
          </span>
        </div>
        <div className={css.headerActions}>
          <button
            type="button"
            className={css.iconButton}
            title={copied ? t('diff.copied') : t('diff.copy')}
            aria-label={copied ? t('diff.copied') : t('diff.copy')}
            onClick={() => { void copyDiff() }}
          >
            <IconCopyOutline16 />
          </button>
          <button
            type="button"
            className={css.iconButton}
            title={t('diff.close')}
            aria-label={t('diff.close')}
            onClick={onClose}
          >
            <IconCloseOutline16 />
          </button>
        </div>
      </div>
      <div className={css.body} tabIndex={0}>
        {blocks.map((block) => {
          if (block.type === 'hunk') {
            return (
              <div key={`hunk:${block.text}`} className={css.hunk}>
                {block.text}
              </div>
            )
          }
          if (block.type === 'lines') {
            return <DiffRows key={`lines:${block.lines[0]?.oldNo}-${block.lines[0]?.newNo}`} lines={block.lines} />
          }
          const isOpen = expanded.has(block.id)
          if (isOpen) {
            return (
              <div key={block.id}>
                <button
                  type="button"
                  className={css.collapseBar}
                  onClick={() => {
                    setExpanded((current) => {
                      const next = new Set(current)
                      next.delete(block.id)
                      return next
                    })
                  }}
                >
                  <span className={css.collapseIcons}>
                    <IconChevronUpOutline14 />
                  </span>
                  <span>{t('diff.collapse', { count: String(block.lines.length) })}</span>
                </button>
                <DiffRows lines={block.lines} />
              </div>
            )
          }
          return (
            <button
              key={block.id}
              type="button"
              className={css.collapseBar}
              onClick={() => {
                setExpanded((current) => new Set(current).add(block.id))
              }}
            >
              <span className={css.collapseIcons}>
                <IconChevronDownOutline14 />
                <IconChevronUpOutline14 />
              </span>
              <span>{t('diff.unmodified', { count: String(block.lines.length) })}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
