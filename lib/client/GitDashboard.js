/**
 * Session-header Git workspace dashboard: read-only branch and file-level
 * summary for the current Session's Workspace.
 */
import { useCallback, useEffect, useMemo, useRef, useState, } from 'react';
import { IconBranchOutline16, IconFolderOpenOutline16, IconRefreshOutline14, useDismissOnOutsidePointer, } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './GitDashboard.module.css';
/** Resolve the Workspace that owns the current Session. */
function workspaceForSession(items, sessionId) {
    return items.find(workspace => workspace.sessionIds.includes(sessionId));
}
/** Branch label or detached short OID for compact display. */
function headLabel(snapshot) {
    return snapshot.head.ref ?? snapshot.head.oidShort;
}
/** Sort key: conflicts, untracked, modified family, deleted. */
function fileSortRank(file) {
    if (file.status === 'unmerged')
        return 0;
    if (file.status === 'untracked')
        return 1;
    if (file.status === 'deleted')
        return 3;
    return 2;
}
/** Stable file ordering for the truncated list. */
function sortFiles(files) {
    return [...files].sort((left, right) => {
        const rank = fileSortRank(left) - fileSortRank(right);
        return rank !== 0 ? rank : left.path.localeCompare(right.path);
    });
}
/** Localized status chips for one changed file. */
function statusTags(file, t) {
    const tags = [];
    if (file.status === 'unmerged')
        tags.push(t('status.conflict'));
    else if (file.status === 'untracked')
        tags.push(t('status.untracked'));
    else if (file.staged)
        tags.push(t('status.staged'));
    else
        tags.push(t('status.unstaged'));
    if (file.binary)
        tags.push(t('status.binary'));
    return tags;
}
/** Format line stats when numstat succeeded. */
function lineStats(file) {
    if (file.additions === null && file.deletions === null)
        return null;
    const additions = file.additions ?? 0;
    const deletions = file.deletions ?? 0;
    return `+${additions}/−${deletions}`;
}
/**
 * Session-header Git workspace utility. Renders nothing without a Workspace,
 * a Git repository, or a completed first snapshot that is not a repository.
 * @param props - runtime slot currency, locale seat, and injected Remote callbacks.
 * @returns the trigger and popover, or null when hidden.
 */
export function GitDashboard({ sessionId, useWorkspaces, useSessions, isLoopback, useHostDescription, openWorkspace, snapshot, branches, compare, t, }) {
    const workspace = useWorkspaces(state => workspaceForSession(state.items, sessionId));
    const running = useSessions(state => state.byId[sessionId]?.running ?? false);
    const [open, setOpen] = useState(false);
    const [data, setData] = useState(null);
    const [stale, setStale] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [initialLoaded, setInitialLoaded] = useState(false);
    const [compareOpen, setCompareOpen] = useState(false);
    const [branchOptions, setBranchOptions] = useState([]);
    const [compareBase, setCompareBase] = useState('');
    const [compareData, setCompareData] = useState(null);
    const [compareLoading, setCompareLoading] = useState(false);
    const [branchError, setBranchError] = useState(false);
    const rootRef = useRef(null);
    const triggerRef = useRef(null);
    const snapshotGenerationRef = useRef(0);
    const branchGenerationRef = useRef(0);
    const compareGenerationRef = useRef(0);
    const abortRef = useRef(null);
    const compareAbortRef = useRef(null);
    const branchAbortRef = useRef(null);
    const dataRef = useRef(null);
    const prevRunningRef = useRef(running);
    const hadEntryRef = useRef(false);
    dataRef.current = data;
    const hostCanOpenPath = useHostDescription(description => description?.canOpenPath === true);
    const canOpenFolder = isLoopback && hostCanOpenPath && workspace !== undefined;
    useDismissOnOutsidePointer(rootRef, open, setOpen);
    const refreshSnapshot = useCallback(async () => {
        if (workspace === undefined)
            return;
        const generation = ++snapshotGenerationRef.current;
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setLoading(true);
        const result = await snapshot(workspace.workspaceId, controller.signal);
        if (generation !== snapshotGenerationRef.current)
            return;
        setLoading(false);
        setInitialLoaded(true);
        if (result.ok) {
            if (result.value.kind === 'not-repository') {
                setData(null);
                setStale(false);
                setLoadError(false);
                return;
            }
            setData(result.value);
            setStale(false);
            setLoadError(false);
            hadEntryRef.current = true;
            return;
        }
        if (dataRef.current !== null) {
            setStale(true);
            setLoadError(false);
        }
        else {
            setLoadError(true);
        }
    }, [snapshot, workspace]);
    useEffect(() => {
        if (workspace === undefined) {
            setData(null);
            setInitialLoaded(false);
            setLoadError(false);
            setStale(false);
            return;
        }
        void refreshSnapshot();
    }, [workspace?.workspaceId, sessionId, refreshSnapshot, workspace]);
    useEffect(() => {
        const wasRunning = prevRunningRef.current;
        prevRunningRef.current = running;
        if (wasRunning && !running && workspace !== undefined) {
            void refreshSnapshot();
        }
    }, [running, refreshSnapshot, workspace]);
    useEffect(() => {
        const onVisibility = () => {
            if (document.visibilityState !== 'visible')
                return;
            if (!hadEntryRef.current && !open)
                return;
            if (workspace === undefined)
                return;
            void refreshSnapshot();
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => { document.removeEventListener('visibilitychange', onVisibility); };
    }, [open, refreshSnapshot, workspace]);
    useEffect(() => () => {
        abortRef.current?.abort();
        compareAbortRef.current?.abort();
        branchAbortRef.current?.abort();
    }, []);
    useEffect(() => {
        if (!compareOpen || workspace === undefined)
            return;
        const generation = ++branchGenerationRef.current;
        branchAbortRef.current?.abort();
        const controller = new AbortController();
        branchAbortRef.current = controller;
        setBranchError(false);
        void branches(workspace.workspaceId, controller.signal).then((result) => {
            if (generation !== branchGenerationRef.current)
                return;
            if (!result.ok) {
                setBranchOptions([]);
                setBranchError(true);
                return;
            }
            setBranchOptions(result.value);
            if (result.value.length > 0 && compareBase === '') {
                const first = result.value[0];
                if (first !== undefined)
                    setCompareBase(first.ref);
            }
        });
    }, [branches, compareBase, compareOpen, workspace]);
    useEffect(() => {
        if (!compareOpen || workspace === undefined || compareBase === '') {
            setCompareData(null);
            return;
        }
        const generation = ++compareGenerationRef.current;
        compareAbortRef.current?.abort();
        const controller = new AbortController();
        compareAbortRef.current = controller;
        setCompareLoading(true);
        void compare(workspace.workspaceId, compareBase, controller.signal).then((result) => {
            if (generation !== compareGenerationRef.current)
                return;
            setCompareLoading(false);
            setCompareData(result.ok ? result.value : null);
        });
    }, [compare, compareBase, compareOpen, workspace]);
    const sortedFiles = useMemo(() => (data === null ? [] : sortFiles(data.files)), [data]);
    if (workspace === undefined)
        return null;
    if (!initialLoaded && !loading)
        return null;
    if (data?.kind === 'not-repository')
        return null;
    if (data === null && !loadError)
        return null;
    const branch = data === null ? '…' : headLabel(data);
    const dirtyCount = data?.counts.files ?? 0;
    const triggerLabel = t('trigger.aria', { branch });
    const observedTime = data === null
        ? ''
        : new Date(data.observedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const onKeyDown = (event) => {
        if (event.key !== 'Escape' || !open)
            return;
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
    };
    return (<div ref={rootRef} className={css.root} onKeyDown={onKeyDown}>
      <button ref={triggerRef} type="button" className={css.trigger} aria-expanded={open} aria-label={triggerLabel} title={branch} onClick={() => { setOpen(current => !current); }}>
        <IconBranchOutline16 />
        <span className={css.branch}>{branch}</span>
        {dirtyCount > 0
            ? <span className={css.dirty}>{t('trigger.files', { count: String(dirtyCount) })}</span>
            : null}
      </button>
      {open
            ? (<div className={css.panel} role="region" aria-label={t('panel.aria')}>
            <div className={css.header}>
              <div className={css.titleRow}>
                <h3 className={css.title}>{t('panel.title')}</h3>
                {stale ? <span className={css.stale}>{t('stale.label')}</span> : null}
              </div>
              {data !== null
                    ? (<>
                    <div className={css.meta}>
                      <span className={css.metaItem}>
                        {t('panel.repository')}
                        {' '}
                        <span className={css.metaValue} title={data.repositoryName}>{data.repositoryName}</span>
                      </span>
                      {data.scopePrefix !== ''
                            ? (<span className={css.metaItem}>
                            {t('panel.scope')}
                            {' '}
                            <span className={css.metaValue} title={data.scopePrefix}>{data.scopePrefix}</span>
                          </span>)
                            : null}
                      <span className={css.metaItem}>
                        {t('panel.head')}
                        {' '}
                        <span className={css.metaValue}>{headLabel(data)}</span>
                      </span>
                      {data.upstream !== undefined
                            ? (<span className={css.metaItem}>
                            {t('panel.upstream')}
                            {' '}
                            <span className={css.metaValue} title={data.upstream.ref}>{data.upstream.ref}</span>
                          </span>)
                            : null}
                    </div>
                    <p className={css.note}>{t('panel.observedAt', { time: observedTime })}</p>
                  </>)
                    : null}
            </div>

            {loadError
                    ? (<>
                  <p className={css.error}>{t('panel.error')}</p>
                  <div className={css.actions}>
                    <button type="button" className={css.action} disabled={loading} onClick={() => { void refreshSnapshot(); }}>
                      {t('panel.retry')}
                    </button>
                  </div>
                </>)
                    : data !== null
                        ? (<>
                    <div className={css.stats}>
                      <span className={css.stat}>{t('panel.stats.staged', { count: String(data.counts.staged) })}</span>
                      <span className={css.stat}>{t('panel.stats.unstaged', { count: String(data.counts.unstaged) })}</span>
                      <span className={css.stat}>{t('panel.stats.untracked', { count: String(data.counts.untracked) })}</span>
                      <span className={css.stat}>{t('panel.stats.conflicts', { count: String(data.counts.conflicts) })}</span>
                      <span className={css.stat}>
                        {t('panel.stats.lines', {
                                additions: String(data.counts.additions),
                                deletions: String(data.counts.deletions),
                            })}
                      </span>
                    </div>

                    <div className={css.actions}>
                      <button type="button" className={css.action} disabled={loading} aria-busy={loading} onClick={() => { void refreshSnapshot(); }}>
                        <IconRefreshOutline14 />
                        {loading ? t('panel.refreshing') : t('panel.refresh')}
                      </button>
                      {canOpenFolder
                                ? (<button type="button" className={css.action} onClick={() => { openWorkspace(workspace.path); }}>
                            <IconFolderOpenOutline16 />
                            {t('panel.openFolder')}
                          </button>)
                                : null}
                    </div>

                    {sortedFiles.length === 0
                                ? <p className={css.note}>{t('panel.empty')}</p>
                                : (<ul className={css.fileList}>
                          {sortedFiles.map(file => (<li key={`${file.path}:${file.staged ? 's' : 'w'}`} className={css.fileRow}>
                              <span className={css.path} title={file.path}>{file.path}</span>
                              <span className={css.tags}>
                                {statusTags(file, t).map(tag => (<span key={tag} className={css.tag}>{tag}</span>))}
                              </span>
                              {lineStats(file) !== null
                                            ? <span className={css.lines}>{lineStats(file)}</span>
                                            : null}
                            </li>))}
                        </ul>)}
                    {!data.complete
                                ? <p className={css.note}>{t('panel.truncated')}</p>
                                : null}

                    <section className={css.compare}>
                      <button type="button" className={css.compareToggle} aria-expanded={compareOpen} onClick={() => { setCompareOpen(current => !current); }}>
                        <span>{t('compare.title')}</span>
                        <span>{compareOpen ? t('compare.collapse') : t('compare.expand')}</span>
                      </button>
                      {compareOpen
                                ? (<>
                            {branchError || branchOptions.length === 0
                                        ? <p className={css.note}>{t('compare.noBranches')}</p>
                                        : (<select className={css.select} aria-label={t('compare.selectBase')} value={compareBase} onChange={(event) => { setCompareBase(event.target.value); }}>
                                  {branchOptions.map(option => (<option key={option.ref} value={option.ref}>
                                      {option.displayName}
                                    </option>))}
                                </select>)}
                            {compareLoading
                                        ? <p className={css.note}>{t('compare.loading')}</p>
                                        : null}
                            {compareData !== null
                                        ? (<>
                                  <p className={css.note}>
                                    {t('compare.aheadBehind', {
                                                ahead: String(compareData.ahead),
                                                behind: String(compareData.behind),
                                            })}
                                  </p>
                                  <ul className={css.fileList}>
                                    {sortFiles(compareData.files).map(file => (<li key={`cmp:${file.path}`} className={css.fileRow}>
                                        <span className={css.path} title={file.path}>{file.path}</span>
                                        <span className={css.tags}>
                                          {statusTags(file, t).map(tag => (<span key={tag} className={css.tag}>{tag}</span>))}
                                        </span>
                                      </li>))}
                                  </ul>
                                  {!compareData.complete
                                                ? <p className={css.note}>{t('panel.truncated')}</p>
                                                : null}
                                </>)
                                        : null}
                          </>)
                                : null}
                    </section>
                  </>)
                        : null}
          </div>)
            : null}
    </div>);
}
