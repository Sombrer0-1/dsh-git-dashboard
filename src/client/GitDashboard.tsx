/**
 * Session-header Git workspace dashboard: read-only branch and file-level
 * summary for the current Session's Workspace, plus small working-tree diffs.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import type { HostDescriptionSource } from '@deepseek-ai/dsh-client-connection/client'
import type { SessionId, WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-client-runtime/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import {
  IconBranchOutline16,
  IconFolderOpenOutline16,
  IconRefreshOutline14,
  useDismissOnOutsidePointer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {
  GitBranch,
  GitBranchesResult,
  GitChangedFile,
  GitCompareResult,
  GitFileDiffResult,
  GitRepositoryCompare,
  GitRepositorySnapshot,
  GitSnapshot,
} from '../types.ts'
import { DiffPreview } from './DiffPreview.tsx'
import { NS } from './locales.ts'
import css from './GitDashboard.module.css'

/** Registration-side Remote callbacks and Host capability facts. */
export interface GitDashboardInjected {
  /** Whether the browser itself is connected over loopback. */
  isLoopback: boolean
  hooks: {
    /** Current generation's Host description, bound by the slot renderer. */
    hostDescription: HostDescriptionSource
  }
  /** Open the Workspace directory through the Host opener. */
  openWorkspace(path: string): void
  snapshot(workspaceId: WorkspaceId, signal?: AbortSignal): Promise<RemoteResult<GitSnapshot>>
  branches(workspaceId: WorkspaceId, signal?: AbortSignal): Promise<RemoteResult<GitBranchesResult>>
  compare(
    workspaceId: WorkspaceId,
    baseRef: string,
    signal?: AbortSignal,
  ): Promise<RemoteResult<GitCompareResult>>
  fileDiff(
    workspaceId: WorkspaceId,
    filePath: string,
    signal?: AbortSignal,
  ): Promise<RemoteResult<GitFileDiffResult>>
}

/** Full props for the session-header Git utility. */
export type GitDashboardProps =
  PropsRuntime<'conversation.session.header.utilities'>
  & PropsLocale<typeof NS>
  & InjectFace<GitDashboardInjected>

/** Resolve the Workspace that owns the current Session. */
function workspaceForSession(
  items: readonly WorkspaceView[],
  sessionId: SessionId,
): WorkspaceView | undefined {
  return items.find(workspace => workspace.sessionIds.includes(sessionId))
}

/** Branch label or detached short OID for compact display. */
function headLabel(snapshot: GitRepositorySnapshot): string {
  return snapshot.head.ref ?? snapshot.head.oidShort
}

/** Sort key: conflicts, untracked, modified family, deleted. */
function fileSortRank(file: GitChangedFile): number {
  if (file.status === 'unmerged') return 0
  if (file.status === 'untracked') return 1
  if (file.status === 'deleted') return 3
  return 2
}

/** Stable file ordering for the truncated list. */
function sortFiles(files: readonly GitChangedFile[]): GitChangedFile[] {
  return [...files].sort((left, right) => {
    const rank = fileSortRank(left) - fileSortRank(right)
    return rank !== 0 ? rank : left.path.localeCompare(right.path)
  })
}

/** Localized status chips for one changed file. */
function statusTags(file: GitChangedFile, t: TranslateNS<typeof NS>): string[] {
  const tags: string[] = []
  if (file.status === 'unmerged') {
    tags.push(t('status.conflict'))
    return tags
  }
  if (file.status === 'untracked') {
    tags.push(t('status.untracked'))
    return tags
  }
  if (file.staged) tags.push(t('status.staged'))
  if (file.unstaged) tags.push(t('status.unstaged'))
  if (!file.staged && !file.unstaged) tags.push(t('status.unstaged'))
  if (file.binary) tags.push(t('status.binary'))
  return tags
}

/** Green/red +/- chips for line stats. */
function LineDelta({
  additions,
  deletions,
}: {
  additions: number | null
  deletions: number | null
}): ReactNode {
  if (additions === null && deletions === null) return null
  const plus = additions ?? 0
  const minus = deletions ?? 0
  return (
    <span className={css.lineDelta} aria-label={`+${plus} −${minus}`}>
      <span className={css.lineAdd}>+{plus}</span>
      <span className={css.lineSep}>/</span>
      <span className={css.lineDel}>−{minus}</span>
    </span>
  )
}

/**
 * Session-header Git workspace utility. Renders nothing without a Workspace,
 * a Git repository, or a completed first snapshot that is not a repository.
 * @param props - runtime slot currency, locale seat, and injected Remote callbacks.
 * @returns the trigger and popover, or null when hidden.
 */
export function GitDashboard({
  sessionId,
  useWorkspaces,
  useSessions,
  isLoopback,
  useHostDescription,
  openWorkspace,
  snapshot,
  branches,
  compare,
  fileDiff,
  t,
}: GitDashboardProps) {
  const workspace = useWorkspaces(state =>
    workspaceForSession(state.items, sessionId),
  )
  const running = useSessions(state => state.byId[sessionId]?.running ?? false)

  const [open, setOpen] = useState(false)
  const [data, setData] = useState<GitRepositorySnapshot | null>(null)
  const [hiddenNotRepo, setHiddenNotRepo] = useState(false)
  const [stale, setStale] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [initialLoaded, setInitialLoaded] = useState(false)

  const [compareOpen, setCompareOpen] = useState(false)
  const [branchOptions, setBranchOptions] = useState<readonly GitBranch[]>([])
  const [compareBase, setCompareBase] = useState('')
  const [compareData, setCompareData] = useState<GitRepositoryCompare | null>(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [branchError, setBranchError] = useState(false)

  const [diffPath, setDiffPath] = useState<string | null>(null)
  const [diffResult, setDiffResult] = useState<GitFileDiffResult | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffError, setDiffError] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const snapshotGenerationRef = useRef(0)
  const branchGenerationRef = useRef(0)
  const compareGenerationRef = useRef(0)
  const diffGenerationRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const compareAbortRef = useRef<AbortController | null>(null)
  const branchAbortRef = useRef<AbortController | null>(null)
  const diffAbortRef = useRef<AbortController | null>(null)
  const dataRef = useRef<GitRepositorySnapshot | null>(null)
  const prevRunningRef = useRef(running)
  const hadEntryRef = useRef(false)

  dataRef.current = data

  const hostCanOpenPath = useHostDescription(description => description?.canOpenPath === true)
  const canOpenFolder = isLoopback && hostCanOpenPath && workspace !== undefined

  useDismissOnOutsidePointer(rootRef, open, setOpen)

  const closeDiff = useCallback((): void => {
    diffGenerationRef.current += 1
    diffAbortRef.current?.abort()
    setDiffPath(null)
    setDiffResult(null)
    setDiffLoading(false)
    setDiffError(false)
  }, [])

  const refreshSnapshot = useCallback(async (): Promise<void> => {
    if (workspace === undefined) return
    const generation = ++snapshotGenerationRef.current
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    const result = await snapshot(workspace.workspaceId, controller.signal)
    if (generation !== snapshotGenerationRef.current) return
    setLoading(false)
    setInitialLoaded(true)
    if (result.ok) {
      if (result.value.kind === 'not-repository') {
        setData(null)
        setHiddenNotRepo(true)
        setStale(false)
        setLoadError(false)
        return
      }
      if (result.value.kind === 'unavailable') {
        if (dataRef.current !== null) {
          setStale(true)
          setLoadError(false)
        } else {
          setLoadError(true)
        }
        return
      }
      setData(result.value)
      setHiddenNotRepo(false)
      setStale(false)
      setLoadError(false)
      hadEntryRef.current = true
      return
    }
    if (dataRef.current !== null) {
      setStale(true)
      setLoadError(false)
    } else {
      setLoadError(true)
    }
  }, [snapshot, workspace])

  const openFileDiff = useCallback(async (path: string): Promise<void> => {
    if (workspace === undefined) return
    const generation = ++diffGenerationRef.current
    diffAbortRef.current?.abort()
    const controller = new AbortController()
    diffAbortRef.current = controller
    setDiffPath(path)
    setDiffResult(null)
    setDiffError(false)
    setDiffLoading(true)
    const result = await fileDiff(workspace.workspaceId, path, controller.signal)
    if (generation !== diffGenerationRef.current) return
    setDiffLoading(false)
    if (!result.ok) {
      setDiffError(true)
      return
    }
    setDiffResult(result.value)
  }, [fileDiff, workspace])

  useEffect(() => {
    if (workspace === undefined) {
      setData(null)
      setHiddenNotRepo(false)
      setInitialLoaded(false)
      setLoadError(false)
      setStale(false)
      closeDiff()
      return
    }
    void refreshSnapshot()
  }, [workspace?.workspaceId, sessionId, refreshSnapshot, workspace, closeDiff])

  useEffect(() => {
    const wasRunning = prevRunningRef.current
    prevRunningRef.current = running
    if (wasRunning && !running && workspace !== undefined) {
      void refreshSnapshot()
    }
  }, [running, refreshSnapshot, workspace])

  useEffect(() => {
    const onVisibility = (): void => {
      if (document.visibilityState !== 'visible') return
      if (!hadEntryRef.current && !open) return
      if (workspace === undefined) return
      void refreshSnapshot()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => { document.removeEventListener('visibilitychange', onVisibility) }
  }, [open, refreshSnapshot, workspace])

  useEffect(() => () => {
    abortRef.current?.abort()
    compareAbortRef.current?.abort()
    branchAbortRef.current?.abort()
    diffAbortRef.current?.abort()
  }, [])

  useEffect(() => {
    if (!compareOpen || workspace === undefined) return
    const generation = ++branchGenerationRef.current
    branchAbortRef.current?.abort()
    const controller = new AbortController()
    branchAbortRef.current = controller
    setBranchError(false)
    void branches(workspace.workspaceId, controller.signal).then((result) => {
      if (generation !== branchGenerationRef.current) return
      if (!result.ok || result.value.kind !== 'repository') {
        setBranchOptions([])
        setBranchError(true)
        return
      }
      setBranchOptions(result.value.branches)
      if (result.value.branches.length > 0 && compareBase === '') {
        const first = result.value.branches[0]
        if (first !== undefined) setCompareBase(first.ref)
      }
    })
  }, [branches, compareBase, compareOpen, workspace])

  useEffect(() => {
    if (!compareOpen || workspace === undefined || compareBase === '') {
      setCompareData(null)
      return
    }
    const generation = ++compareGenerationRef.current
    compareAbortRef.current?.abort()
    const controller = new AbortController()
    compareAbortRef.current = controller
    setCompareLoading(true)
    void compare(workspace.workspaceId, compareBase, controller.signal).then((result) => {
      if (generation !== compareGenerationRef.current) return
      setCompareLoading(false)
      setCompareData(result.ok && result.value.kind === 'repository' ? result.value : null)
    })
  }, [compare, compareBase, compareOpen, workspace])

  const sortedFiles = useMemo(
    () => (data === null ? [] : sortFiles(data.files)),
    [data],
  )

  if (workspace === undefined) return null
  if (!initialLoaded && !loading) return null
  if (hiddenNotRepo) return null
  if (data === null && !loadError) return null

  const branch = data === null ? '…' : headLabel(data)
  const dirtyCount = data?.counts.files ?? 0
  const triggerLabel = t('trigger.aria', { branch })
  const observedTime = data === null
    ? ''
    : new Date(data.observedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    if (diffPath !== null) {
      closeDiff()
      return
    }
    setOpen(false)
    triggerRef.current?.focus()
  }

  const renderDiffBody = (): ReactNode => {
    if (diffLoading) return <p className={css.note}>{t('diff.loading')}</p>
    if (diffError) return <p className={css.error}>{t('diff.error')}</p>
    if (diffResult === null) return null
    if (diffResult.kind === 'not-repository' || diffResult.kind === 'unavailable') {
      return <p className={css.error}>{t('diff.error')}</p>
    }
    if (diffResult.kind === 'empty') return <p className={css.note}>{t('diff.empty')}</p>
    if (diffResult.kind === 'too-large') {
      if (diffResult.reason === 'binary') return <p className={css.note}>{t('diff.tooLarge.binary')}</p>
      if (diffResult.reason === 'bytes') return <p className={css.note}>{t('diff.tooLarge.bytes')}</p>
      return (
        <p className={css.note}>
          {t('diff.tooLarge.lines', {
            additions: String(diffResult.additions ?? 0),
            deletions: String(diffResult.deletions ?? 0),
          })}
        </p>
      )
    }
    if (diffResult.kind === 'unsupported') {
      return <p className={css.note}>{t(`diff.unsupported.${diffResult.reason}`)}</p>
    }
    return (
      <DiffPreview
        path={diffPath ?? diffResult.path}
        preview={diffResult}
        t={t}
        onClose={closeDiff}
      />
    )
  }

  const renderFileRow = (file: GitChangedFile, key: string, clickable: boolean): ReactNode => (
    <li key={key} className={css.fileRow}>
      {clickable
        ? (
          <button
            type="button"
            className={css.fileButton}
            aria-label={t('file.openDiff', { path: file.path })}
            title={file.path}
            onClick={() => { void openFileDiff(file.path) }}
          >
            <span className={css.path}>{file.path}</span>
            <span className={css.tags}>
              {statusTags(file, t).map(tag => (
                <span key={tag} className={css.tag}>{tag}</span>
              ))}
            </span>
            <LineDelta additions={file.additions} deletions={file.deletions} />
          </button>
        )
        : (
          <>
            <span className={css.path} title={file.path}>{file.path}</span>
            <span className={css.tags}>
              {statusTags(file, t).map(tag => (
                <span key={tag} className={css.tag}>{tag}</span>
              ))}
            </span>
            <LineDelta additions={file.additions} deletions={file.deletions} />
          </>
        )}
    </li>
  )

  return (
    <div ref={rootRef} className={css.root} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className={css.trigger}
        aria-expanded={open}
        aria-label={triggerLabel}
        title={branch}
        onClick={() => { setOpen(current => !current) }}
      >
        <IconBranchOutline16 />
        <span className={css.branch}>{branch}</span>
        {dirtyCount > 0
          ? <span className={css.dirty}>{t('trigger.files', { count: String(dirtyCount) })}</span>
          : null}
      </button>
      {open
        ? (
          <div className={css.panel} role="region" aria-label={t('panel.aria')}>
            <div className={css.header}>
              <div className={css.titleRow}>
                <h3 className={css.title}>{t('panel.title')}</h3>
                {stale ? <span className={css.stale}>{t('stale.label')}</span> : null}
              </div>
              {data !== null
                ? (
                  <>
                    <div className={css.meta}>
                      <span className={css.metaItem}>
                        {t('panel.repository')}
                        {' '}
                        <span className={css.metaValue} title={data.repositoryName}>{data.repositoryName}</span>
                      </span>
                      {data.scopePrefix !== ''
                        ? (
                          <span className={css.metaItem}>
                            {t('panel.scope')}
                            {' '}
                            <span className={css.metaValue} title={data.scopePrefix}>{data.scopePrefix}</span>
                          </span>
                        )
                        : null}
                      <span className={css.metaItem}>
                        {t('panel.head')}
                        {' '}
                        <span className={css.metaValue}>{headLabel(data)}</span>
                      </span>
                      {data.upstream !== undefined
                        ? (
                          <span className={css.metaItem}>
                            {t('panel.upstream')}
                            {' '}
                            <span className={css.metaValue} title={data.upstream.ref}>{data.upstream.ref}</span>
                          </span>
                        )
                        : (
                          <span className={css.metaItem}>{t('panel.noUpstream')}</span>
                        )}
                    </div>
                    <p className={css.note}>{t('panel.observedAt', { time: observedTime })}</p>
                  </>
                )
                : null}
            </div>

            {loadError
              ? (
                <>
                  <p className={css.error}>{t('panel.error')}</p>
                  <div className={css.actions}>
                    <button
                      type="button"
                      className={css.action}
                      disabled={loading}
                      onClick={() => { void refreshSnapshot() }}
                    >
                      {t('panel.retry')}
                    </button>
                  </div>
                </>
              )
              : data !== null
                ? (
                  <>
                    <div className={css.stats}>
                      <span className={css.stat}>{t('panel.stats.staged', { count: String(data.counts.staged) })}</span>
                      <span className={css.stat}>{t('panel.stats.unstaged', { count: String(data.counts.unstaged) })}</span>
                      <span className={css.stat}>{t('panel.stats.untracked', { count: String(data.counts.untracked) })}</span>
                      <span className={css.stat}>{t('panel.stats.conflicts', { count: String(data.counts.conflicts) })}</span>
                      <span className={css.stat}>
                        <LineDelta additions={data.counts.additions} deletions={data.counts.deletions} />
                      </span>
                    </div>

                    <div className={css.actions}>
                      <button
                        type="button"
                        className={css.action}
                        disabled={loading}
                        aria-busy={loading}
                        onClick={() => { void refreshSnapshot() }}
                      >
                        <IconRefreshOutline14 />
                        {loading ? t('panel.refreshing') : t('panel.refresh')}
                      </button>
                      {canOpenFolder
                        ? (
                          <button
                            type="button"
                            className={css.action}
                            onClick={() => { openWorkspace(workspace.path) }}
                          >
                            <IconFolderOpenOutline16 />
                            {t('panel.openFolder')}
                          </button>
                        )
                        : null}
                    </div>

                    {sortedFiles.length === 0
                      ? <p className={css.note}>{t('panel.empty')}</p>
                      : (
                        <ul className={css.fileList}>
                          {sortedFiles.map(file =>
                            renderFileRow(file, `${file.path}:${file.staged ? 's' : 'w'}`, true))}
                        </ul>
                      )}
                    {!data.complete
                      ? <p className={css.note}>{t('panel.truncated')}</p>
                      : null}

                    <section className={css.compare}>
                      <button
                        type="button"
                        className={css.compareToggle}
                        aria-expanded={compareOpen}
                        onClick={() => { setCompareOpen(current => !current) }}
                      >
                        <span>{t('compare.title')}</span>
                        <span>{compareOpen ? t('compare.collapse') : t('compare.expand')}</span>
                      </button>
                      {compareOpen
                        ? (
                          <>
                            {branchError || branchOptions.length === 0
                              ? <p className={css.note}>{t('compare.noBranches')}</p>
                              : (
                                <select
                                  className={css.select}
                                  aria-label={t('compare.selectBase')}
                                  value={compareBase}
                                  onChange={(event) => { setCompareBase(event.target.value) }}
                                >
                                  {branchOptions.map(option => (
                                    <option key={option.ref} value={option.ref}>
                                      {option.displayName}
                                    </option>
                                  ))}
                                </select>
                              )}
                            {compareLoading
                              ? <p className={css.note}>{t('compare.loading')}</p>
                              : null}
                            {compareData !== null
                              ? (
                                <>
                                  <p className={css.note}>
                                    {t('compare.aheadBehind', {
                                      ahead: String(compareData.ahead),
                                      behind: String(compareData.behind),
                                    })}
                                  </p>
                                  <ul className={css.fileList}>
                                    {sortFiles(compareData.files).map(file =>
                                      renderFileRow(file, `cmp:${file.path}`, false))}
                                  </ul>
                                  {!compareData.complete
                                    ? <p className={css.note}>{t('panel.truncated')}</p>
                                    : null}
                                </>
                              )
                              : null}
                          </>
                        )
                        : null}
                    </section>

                    <p className={css.note}>{t('panel.diffHint')}</p>
                  </>
                )
                : null}
          </div>
        )
        : null}
      {open && diffPath !== null
        ? (
          <div
            className={css.diffBackdrop}
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeDiff()
            }}
          >
            <div className={css.diffModal} role="dialog" aria-label={t('diff.aria')}>
              {diffResult?.kind === 'preview'
                ? null
                : (
                  <div className={css.diffHeader}>
                    <div className={css.diffTitleBlock}>
                      <span className={css.diffTitle}>{t('diff.title')}</span>
                      <span className={css.diffPath} title={diffPath}>{diffPath}</span>
                    </div>
                    <button
                      type="button"
                      className={css.diffClose}
                      onClick={closeDiff}
                    >
                      {t('diff.close')}
                    </button>
                  </div>
                )}
              {renderDiffBody()}
            </div>
          </div>
        )
        : null}
    </div>
  )
}
