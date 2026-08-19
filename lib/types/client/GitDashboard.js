import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
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
    const [hiddenNotRepo, setHiddenNotRepo] = useState(false);
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
                setHiddenNotRepo(true);
                setStale(false);
                setLoadError(false);
                return;
            }
            if (result.value.kind === 'unavailable') {
                if (dataRef.current !== null) {
                    setStale(true);
                    setLoadError(false);
                }
                else {
                    setLoadError(true);
                }
                return;
            }
            setData(result.value);
            setHiddenNotRepo(false);
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
            setHiddenNotRepo(false);
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
            if (!result.ok || result.value.kind !== 'repository') {
                setBranchOptions([]);
                setBranchError(true);
                return;
            }
            setBranchOptions(result.value.branches);
            if (result.value.branches.length > 0 && compareBase === '') {
                const first = result.value.branches[0];
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
            setCompareData(result.ok && result.value.kind === 'repository' ? result.value : null);
        });
    }, [compare, compareBase, compareOpen, workspace]);
    const sortedFiles = useMemo(() => (data === null ? [] : sortFiles(data.files)), [data]);
    if (workspace === undefined)
        return null;
    if (!initialLoaded && !loading)
        return null;
    if (hiddenNotRepo)
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
    return (_jsxs("div", { ref: rootRef, className: css.root, onKeyDown: onKeyDown, children: [_jsxs("button", { ref: triggerRef, type: "button", className: css.trigger, "aria-expanded": open, "aria-label": triggerLabel, title: branch, onClick: () => { setOpen(current => !current); }, children: [_jsx(IconBranchOutline16, {}), _jsx("span", { className: css.branch, children: branch }), dirtyCount > 0
                        ? _jsx("span", { className: css.dirty, children: t('trigger.files', { count: String(dirtyCount) }) })
                        : null] }), open
                ? (_jsxs("div", { className: css.panel, role: "region", "aria-label": t('panel.aria'), children: [_jsxs("div", { className: css.header, children: [_jsxs("div", { className: css.titleRow, children: [_jsx("h3", { className: css.title, children: t('panel.title') }), stale ? _jsx("span", { className: css.stale, children: t('stale.label') }) : null] }), data !== null
                                    ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: css.meta, children: [_jsxs("span", { className: css.metaItem, children: [t('panel.repository'), ' ', _jsx("span", { className: css.metaValue, title: data.repositoryName, children: data.repositoryName })] }), data.scopePrefix !== ''
                                                        ? (_jsxs("span", { className: css.metaItem, children: [t('panel.scope'), ' ', _jsx("span", { className: css.metaValue, title: data.scopePrefix, children: data.scopePrefix })] }))
                                                        : null, _jsxs("span", { className: css.metaItem, children: [t('panel.head'), ' ', _jsx("span", { className: css.metaValue, children: headLabel(data) })] }), data.upstream !== undefined
                                                        ? (_jsxs("span", { className: css.metaItem, children: [t('panel.upstream'), ' ', _jsx("span", { className: css.metaValue, title: data.upstream.ref, children: data.upstream.ref })] }))
                                                        : null] }), _jsx("p", { className: css.note, children: t('panel.observedAt', { time: observedTime }) })] }))
                                    : null] }), loadError
                            ? (_jsxs(_Fragment, { children: [_jsx("p", { className: css.error, children: t('panel.error') }), _jsx("div", { className: css.actions, children: _jsx("button", { type: "button", className: css.action, disabled: loading, onClick: () => { void refreshSnapshot(); }, children: t('panel.retry') }) })] }))
                            : data !== null
                                ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: css.stats, children: [_jsx("span", { className: css.stat, children: t('panel.stats.staged', { count: String(data.counts.staged) }) }), _jsx("span", { className: css.stat, children: t('panel.stats.unstaged', { count: String(data.counts.unstaged) }) }), _jsx("span", { className: css.stat, children: t('panel.stats.untracked', { count: String(data.counts.untracked) }) }), _jsx("span", { className: css.stat, children: t('panel.stats.conflicts', { count: String(data.counts.conflicts) }) }), _jsx("span", { className: css.stat, children: t('panel.stats.lines', {
                                                        additions: String(data.counts.additions),
                                                        deletions: String(data.counts.deletions),
                                                    }) })] }), _jsxs("div", { className: css.actions, children: [_jsxs("button", { type: "button", className: css.action, disabled: loading, "aria-busy": loading, onClick: () => { void refreshSnapshot(); }, children: [_jsx(IconRefreshOutline14, {}), loading ? t('panel.refreshing') : t('panel.refresh')] }), canOpenFolder
                                                    ? (_jsxs("button", { type: "button", className: css.action, onClick: () => { openWorkspace(workspace.path); }, children: [_jsx(IconFolderOpenOutline16, {}), t('panel.openFolder')] }))
                                                    : null] }), sortedFiles.length === 0
                                            ? _jsx("p", { className: css.note, children: t('panel.empty') })
                                            : (_jsx("ul", { className: css.fileList, children: sortedFiles.map(file => (_jsxs("li", { className: css.fileRow, children: [_jsx("span", { className: css.path, title: file.path, children: file.path }), _jsx("span", { className: css.tags, children: statusTags(file, t).map(tag => (_jsx("span", { className: css.tag, children: tag }, tag))) }), lineStats(file) !== null
                                                            ? _jsx("span", { className: css.lines, children: lineStats(file) })
                                                            : null] }, `${file.path}:${file.staged ? 's' : 'w'}`))) })), !data.complete
                                            ? _jsx("p", { className: css.note, children: t('panel.truncated') })
                                            : null, _jsxs("section", { className: css.compare, children: [_jsxs("button", { type: "button", className: css.compareToggle, "aria-expanded": compareOpen, onClick: () => { setCompareOpen(current => !current); }, children: [_jsx("span", { children: t('compare.title') }), _jsx("span", { children: compareOpen ? t('compare.collapse') : t('compare.expand') })] }), compareOpen
                                                    ? (_jsxs(_Fragment, { children: [branchError || branchOptions.length === 0
                                                                ? _jsx("p", { className: css.note, children: t('compare.noBranches') })
                                                                : (_jsx("select", { className: css.select, "aria-label": t('compare.selectBase'), value: compareBase, onChange: (event) => { setCompareBase(event.target.value); }, children: branchOptions.map(option => (_jsx("option", { value: option.ref, children: option.displayName }, option.ref))) })), compareLoading
                                                                ? _jsx("p", { className: css.note, children: t('compare.loading') })
                                                                : null, compareData !== null
                                                                ? (_jsxs(_Fragment, { children: [_jsx("p", { className: css.note, children: t('compare.aheadBehind', {
                                                                                ahead: String(compareData.ahead),
                                                                                behind: String(compareData.behind),
                                                                            }) }), _jsx("ul", { className: css.fileList, children: sortFiles(compareData.files).map(file => (_jsxs("li", { className: css.fileRow, children: [_jsx("span", { className: css.path, title: file.path, children: file.path }), _jsx("span", { className: css.tags, children: statusTags(file, t).map(tag => (_jsx("span", { className: css.tag, children: tag }, tag))) })] }, `cmp:${file.path}`))) }), !compareData.complete
                                                                            ? _jsx("p", { className: css.note, children: t('panel.truncated') })
                                                                            : null] }))
                                                                : null] }))
                                                    : null] })] }))
                                : null] }))
                : null] }));
}
//# sourceMappingURL=GitDashboard.js.map