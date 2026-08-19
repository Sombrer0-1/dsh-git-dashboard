/**
 * Read-only Git collection orchestration for one workspace.
 * @module dsh-git-dashboard/git/service
 */
import { basename } from 'node:path';
import { countChangedLines, parseUnifiedDiff } from "./parse-diff.js";
import { parseNumstat, sumNumstat } from "./parse-numstat.js";
import { parseForEachRef } from "./parse-refs.js";
import { parseStatusPorcelainV2 } from "./parse-status.js";
import { assertSafeCompareRef, assertScopedFilePath, isUnsafeRepositoryPath, normalizePosixRelative, scopePrefix, statusScopeArgs, } from "./paths.js";
/** Shared Git argv flags for non-interactive collection. */
const GIT_GLOBAL = [
    '--no-pager',
    '-c', 'core.fsmonitor=false',
];
const STATUS_FLAGS = [
    ...GIT_GLOBAL,
    '-c', 'status.relativePaths=false',
    '--literal-pathspecs',
    'status',
    '--porcelain=v2',
    '--branch',
    '-z',
    '--untracked-files=all',
];
/**
 * Read-only Git collector bound to one runner and resolved limits.
 */
export class GitCollectionService {
    runner;
    config;
    registry;
    /**
     * @param runner - prefix-capped git subprocess runner.
     * @param config - validated collection limits.
     * @param registry - workspace entity registry.
     */
    constructor(runner, config, registry) {
        this.runner = runner;
        this.config = config;
        this.registry = registry;
    }
    /**
     * Collect a bounded workspace Git status snapshot.
     * @param workspaceId - registered workspace id from the Client.
     * @param signal - cooperative cancellation from the Remote transport.
     */
    async snapshot(workspaceId, signal) {
        const resolved = await this.resolveRepository(workspaceId, signal);
        if ('kind' in resolved)
            return resolved;
        let complete = true;
        const statusRun = await this.runner.run([...STATUS_FLAGS, ...statusScopeArgs(resolved.prefix)], {
            cwd: resolved.repoRoot,
            maxBytes: this.config.maxStatusBytes,
            timeoutMs: this.config.timeoutMs,
            signal,
        });
        if (statusRun.timedOut)
            return unavailable('timeout');
        if (statusRun.aborted)
            return unavailable('git-error');
        if (statusRun.truncated)
            return unavailable('output-too-large');
        if (statusRun.exitCode !== 0)
            return unavailable('git-error');
        const parsed = parseStatusPorcelainV2(statusRun.stdout);
        // Staged / unstaged file counts come from name-only diffs, not porcelain XY.
        // XY was easy to misread (e.g. treating `.` as dirty); these match `git status` buckets.
        const stagedPaths = await this.listDiffPaths(resolved.repoRoot, [
            'diff',
            '--cached',
            '--name-only',
            '-z',
            ...statusScopeArgs(resolved.prefix),
        ], signal);
        if (typeof stagedPaths === 'string')
            return unavailable(stagedPaths);
        const unstagedPaths = await this.listDiffPaths(resolved.repoRoot, [
            'diff',
            '--name-only',
            '-z',
            ...statusScopeArgs(resolved.prefix),
        ], signal);
        if (typeof unstagedPaths === 'string')
            return unavailable(unstagedPaths);
        // Line counts must come from one `diff HEAD` numstat. Summing
        // `--cached` + worktree numstat double-counts overlapping rewrites on
        // large files (staged rewrite + further edits ≈ 2× the HEAD delta).
        const headStats = await this.runNumstat(resolved.repoRoot, [
            'diff',
            '--numstat',
            '-z',
            'HEAD',
            ...statusScopeArgs(resolved.prefix),
        ], signal);
        if (typeof headStats === 'string')
            return unavailable(headStats);
        if (headStats.truncated)
            complete = false;
        const untrackedStats = await this.collectUntrackedNumstat(resolved.repoRoot, parsed.files, signal);
        if (typeof untrackedStats === 'string')
            return unavailable(untrackedStats);
        if (untrackedStats.truncated)
            complete = false;
        const combined = new Map(headStats.entries);
        for (const [path, entry] of untrackedStats.entries) {
            if (!combined.has(path))
                combined.set(path, entry);
        }
        const files = this.applyNumstat(parsed.files, combined).map((file) => {
            if (file.status === 'untracked' || file.status === 'unmerged') {
                return {
                    ...file,
                    staged: false,
                    unstaged: false,
                };
            }
            return {
                ...file,
                staged: stagedPaths.has(file.path),
                unstaged: unstagedPaths.has(file.path),
            };
        });
        const { additions, deletions } = sumNumstat(combined);
        const limited = this.limitFiles(files);
        if (limited.truncated)
            complete = false;
        const counts = {
            files: parsed.files.length,
            staged: stagedPaths.size,
            unstaged: unstagedPaths.size,
            untracked: parsed.counts.untracked,
            conflicts: parsed.counts.conflicts,
            additions,
            deletions,
        };
        return {
            kind: 'repository',
            repositoryName: basename(resolved.repoRoot),
            scopePrefix: resolved.prefix,
            head: parsed.branch.head,
            ...(parsed.branch.upstream !== undefined ? { upstream: parsed.branch.upstream } : {}),
            counts,
            files: limited.files,
            complete,
            observedAt: Date.now(),
        };
    }
    /**
     * List local and remote-tracking branches for one workspace repository.
     * @param workspaceId - registered workspace id.
     * @param signal - cooperative cancellation.
     */
    async branches(workspaceId, signal) {
        const resolved = await this.resolveRepository(workspaceId, signal);
        if ('kind' in resolved)
            return resolved;
        const run = await this.runner.run([
            ...GIT_GLOBAL,
            'for-each-ref',
            '--format=%(refname)%00%(objectname:short)%00%(refname:short)',
            'refs/heads',
            'refs/remotes',
        ], {
            cwd: resolved.repoRoot,
            maxBytes: this.config.maxStatusBytes,
            timeoutMs: this.config.timeoutMs,
            signal,
        });
        if (run.timedOut)
            return unavailable('timeout');
        if (run.aborted)
            return unavailable('git-error');
        if (run.truncated)
            return unavailable('output-too-large');
        if (run.exitCode !== 0)
            return unavailable('git-error');
        const all = parseForEachRef(run.stdout);
        let complete = true;
        const branches = all.length > this.config.maxBranches
            ? (complete = false, all.slice(0, this.config.maxBranches))
            : all;
        return {
            kind: 'repository',
            branches,
            complete,
            observedAt: Date.now(),
        };
    }
    /**
     * Compare HEAD against one resolved base ref within the workspace repository.
     * @param workspaceId - registered workspace id.
     * @param baseRef - branch, tag, or oid selected in the Client.
     * @param signal - cooperative cancellation.
     */
    async compare(workspaceId, baseRef, signal) {
        try {
            assertSafeCompareRef(baseRef);
        }
        catch {
            return unavailable('git-error');
        }
        const resolved = await this.resolveRepository(workspaceId, signal);
        if ('kind' in resolved)
            return resolved;
        const baseRun = await this.runner.run([
            ...GIT_GLOBAL,
            'rev-parse',
            '--verify',
            '--end-of-options',
            `${baseRef}^{commit}`,
        ], {
            cwd: resolved.repoRoot,
            maxBytes: 256,
            timeoutMs: this.config.timeoutMs,
            signal,
        });
        if (baseRun.timedOut)
            return unavailable('timeout');
        if (baseRun.aborted)
            return unavailable('git-error');
        if (baseRun.exitCode !== 0 || baseRun.stdout.trim().length === 0)
            return unavailable('git-error');
        const baseOid = baseRun.stdout.trim();
        const headRun = await this.runner.run([
            ...GIT_GLOBAL,
            'rev-parse',
            '--verify',
            'HEAD^{commit}',
        ], {
            cwd: resolved.repoRoot,
            maxBytes: 256,
            timeoutMs: this.config.timeoutMs,
            signal,
        });
        if (headRun.timedOut)
            return unavailable('timeout');
        if (headRun.aborted)
            return unavailable('git-error');
        if (headRun.exitCode !== 0)
            return unavailable('git-error');
        const headOid = headRun.stdout.trim();
        const countRun = await this.runner.run([
            ...GIT_GLOBAL,
            'rev-list',
            '--left-right',
            '--count',
            `${baseOid}...${headOid}`,
        ], {
            cwd: resolved.repoRoot,
            maxBytes: 256,
            timeoutMs: this.config.timeoutMs,
            signal,
        });
        if (countRun.timedOut)
            return unavailable('timeout');
        if (countRun.aborted)
            return unavailable('git-error');
        if (countRun.exitCode !== 0)
            return unavailable('git-error');
        const [behindRaw, aheadRaw] = countRun.stdout.trim().split(/\s+/);
        const behind = Number(behindRaw ?? '0');
        const ahead = Number(aheadRaw ?? '0');
        let complete = true;
        const numstatRun = await this.runner.run([
            ...GIT_GLOBAL,
            'diff',
            '--numstat',
            '-z',
            '--find-renames',
            `${baseOid}...${headOid}`,
        ], {
            cwd: resolved.repoRoot,
            maxBytes: this.config.maxNumstatBytes,
            timeoutMs: this.config.timeoutMs,
            signal,
        });
        if (numstatRun.timedOut)
            return unavailable('timeout');
        if (numstatRun.aborted)
            return unavailable('git-error');
        if (numstatRun.truncated)
            complete = false;
        const nameRun = await this.runner.run([
            ...GIT_GLOBAL,
            'diff',
            '--name-status',
            '-z',
            '--find-renames',
            `${baseOid}...${headOid}`,
        ], {
            cwd: resolved.repoRoot,
            maxBytes: this.config.maxNumstatBytes,
            timeoutMs: this.config.timeoutMs,
            signal,
        });
        if (nameRun.timedOut)
            return unavailable('timeout');
        if (nameRun.aborted)
            return unavailable('git-error');
        if (nameRun.truncated)
            complete = false;
        if (numstatRun.exitCode !== 0 || nameRun.exitCode !== 0)
            return unavailable('git-error');
        const numstat = parseNumstat(numstatRun.stdout);
        const files = this.compareFiles(nameRun.stdout, numstat);
        const limited = this.limitFiles(files);
        if (limited.truncated)
            complete = false;
        const { additions, deletions } = sumNumstat(numstat);
        const headRefRun = await this.runner.run([
            ...GIT_GLOBAL,
            'rev-parse',
            '--abbrev-ref',
            'HEAD',
        ], {
            cwd: resolved.repoRoot,
            maxBytes: 256,
            timeoutMs: this.config.timeoutMs,
            signal,
        });
        const abbrev = headRefRun.stdout.trim();
        const headRef = abbrev.length === 0 || abbrev === 'HEAD' ? headOid.slice(0, 7) : abbrev;
        return {
            kind: 'repository',
            baseRef,
            headRef,
            baseOid,
            headOid,
            ahead: Number.isFinite(ahead) ? ahead : 0,
            behind: Number.isFinite(behind) ? behind : 0,
            counts: {
                files: files.length,
                staged: 0,
                unstaged: files.length,
                untracked: 0,
                conflicts: 0,
                additions,
                deletions,
            },
            files: limited.files,
            complete,
            observedAt: Date.now(),
        };
    }
    /**
     * Preview a single path's working-tree unified diff versus HEAD when small enough.
     * @param workspaceId - registered workspace id.
     * @param filePath - repository-relative POSIX path from the Browser file list.
     * @param signal - cooperative cancellation.
     */
    async fileDiff(workspaceId, filePath, signal) {
        const resolved = await this.resolveRepository(workspaceId, signal);
        if ('kind' in resolved)
            return resolved;
        let path;
        try {
            path = assertScopedFilePath(filePath, resolved.prefix);
        }
        catch {
            return { kind: 'unsupported', path: filePath, reason: 'unsafe-path' };
        }
        const unmerged = await this.pathIsUnmerged(resolved.repoRoot, path, signal);
        if (unmerged === 'timeout')
            return unavailable('timeout');
        if (unmerged === 'git-error')
            return unavailable('git-error');
        if (unmerged === true)
            return { kind: 'unsupported', path, reason: 'conflict' };
        const tracked = await this.pathIsTracked(resolved.repoRoot, path, signal);
        if (tracked === 'timeout')
            return unavailable('timeout');
        if (tracked === 'git-error')
            return unavailable('git-error');
        if (tracked === false) {
            return this.previewNoIndexDiff(resolved.repoRoot, path, signal);
        }
        // `-z` is required: parseNumstat is NUL-delimited. Plain numstat keeps a trailing
        // newline in the path key and was looked up as a miss → false "empty".
        // `git diff` exits 1 when differences exist; treat 0|1 as success.
        const numstatRun = await this.runner.run([
            ...GIT_GLOBAL,
            '--literal-pathspecs',
            'diff',
            '--numstat',
            '-z',
            'HEAD',
            '--',
            path,
        ], {
            cwd: resolved.repoRoot,
            maxBytes: this.config.maxNumstatBytes,
            timeoutMs: this.config.timeoutMs,
            signal,
        });
        if (numstatRun.timedOut)
            return unavailable('timeout');
        if (numstatRun.aborted)
            return unavailable('git-error');
        if (!isDiffExitOk(numstatRun.exitCode))
            return unavailable('git-error');
        const stats = parseNumstat(numstatRun.stdout).get(path);
        if (stats?.binary === true) {
            return {
                kind: 'too-large',
                path,
                reason: 'binary',
                additions: null,
                deletions: null,
            };
        }
        const estimatedAdditions = stats?.additions ?? null;
        const estimatedDeletions = stats?.deletions ?? null;
        if (estimatedAdditions !== null
            && estimatedDeletions !== null
            && estimatedAdditions + estimatedDeletions > this.config.maxDiffChangedLines) {
            return {
                kind: 'too-large',
                path,
                reason: 'lines',
                additions: estimatedAdditions,
                deletions: estimatedDeletions,
            };
        }
        const diffRun = await this.runner.run([
            ...GIT_GLOBAL,
            '--literal-pathspecs',
            'diff',
            '-U5',
            'HEAD',
            '--',
            path,
        ], {
            cwd: resolved.repoRoot,
            maxBytes: this.config.maxDiffBytes,
            timeoutMs: this.config.timeoutMs,
            signal,
        });
        return this.finishUnifiedPreview(path, diffRun, estimatedAdditions, estimatedDeletions);
    }
    /**
     * Preview an untracked file as all-additions versus an empty blob.
     */
    async previewNoIndexDiff(cwd, path, signal) {
        const numstatRun = await this.runner.run([
            ...GIT_GLOBAL,
            '--literal-pathspecs',
            'diff',
            '--no-index',
            '--numstat',
            '-z',
            '--',
            '/dev/null',
            path,
        ], {
            cwd,
            maxBytes: this.config.maxNumstatBytes,
            timeoutMs: this.config.timeoutMs,
            signal,
        });
        if (numstatRun.timedOut)
            return unavailable('timeout');
        if (numstatRun.aborted)
            return unavailable('git-error');
        if (!isDiffExitOk(numstatRun.exitCode))
            return unavailable('git-error');
        const parsed = parseNumstat(numstatRun.stdout);
        const stats = parsed.get(path) ?? [...parsed.values()][0];
        if (stats?.binary === true) {
            return {
                kind: 'too-large',
                path,
                reason: 'binary',
                additions: null,
                deletions: null,
            };
        }
        const estimatedAdditions = stats?.additions ?? null;
        const estimatedDeletions = stats?.deletions ?? 0;
        if (estimatedAdditions !== null
            && estimatedAdditions + (estimatedDeletions ?? 0) > this.config.maxDiffChangedLines) {
            return {
                kind: 'too-large',
                path,
                reason: 'lines',
                additions: estimatedAdditions,
                deletions: estimatedDeletions,
            };
        }
        const diffRun = await this.runner.run([
            ...GIT_GLOBAL,
            '--literal-pathspecs',
            'diff',
            '--no-index',
            '-U5',
            '--',
            '/dev/null',
            path,
        ], {
            cwd,
            maxBytes: this.config.maxDiffBytes,
            timeoutMs: this.config.timeoutMs,
            signal,
        });
        return this.finishUnifiedPreview(path, diffRun, estimatedAdditions, estimatedDeletions);
    }
    finishUnifiedPreview(path, diffRun, estimatedAdditions, estimatedDeletions) {
        if (diffRun.timedOut)
            return unavailable('timeout');
        if (diffRun.aborted)
            return unavailable('git-error');
        if (!isDiffExitOk(diffRun.exitCode))
            return unavailable('git-error');
        if (diffRun.truncated) {
            return {
                kind: 'too-large',
                path,
                reason: 'bytes',
                additions: estimatedAdditions,
                deletions: estimatedDeletions,
            };
        }
        if (diffRun.stdout.trim().length === 0)
            return { kind: 'empty', path };
        const counted = countChangedLines(diffRun.stdout);
        if (counted.additions + counted.deletions > this.config.maxDiffChangedLines) {
            return {
                kind: 'too-large',
                path,
                reason: 'lines',
                additions: counted.additions,
                deletions: counted.deletions,
            };
        }
        return {
            kind: 'preview',
            path,
            lines: parseUnifiedDiff(diffRun.stdout),
            additions: counted.additions,
            deletions: counted.deletions,
            observedAt: Date.now(),
        };
    }
    async pathIsTracked(cwd, path, signal) {
        const run = await this.runner.run([
            ...GIT_GLOBAL,
            '--literal-pathspecs',
            'ls-files',
            '--error-unmatch',
            '--',
            path,
        ], {
            cwd,
            maxBytes: 4096,
            timeoutMs: this.config.timeoutMs,
            signal,
        });
        if (run.timedOut)
            return 'timeout';
        if (run.aborted)
            return 'git-error';
        return run.exitCode === 0;
    }
    async pathIsUnmerged(cwd, path, signal) {
        const run = await this.runner.run([
            ...GIT_GLOBAL,
            '--literal-pathspecs',
            'ls-files',
            '-u',
            '--',
            path,
        ], {
            cwd,
            maxBytes: 4096,
            timeoutMs: this.config.timeoutMs,
            signal,
        });
        if (run.timedOut)
            return 'timeout';
        if (run.aborted)
            return 'git-error';
        if (run.exitCode !== 0)
            return 'git-error';
        return run.stdout.trim().length > 0;
    }
    async resolveRepository(workspaceId, signal) {
        const workspace = this.registry.get(workspaceId);
        if (workspace === undefined)
            return unavailable('workspace-missing');
        const status = await workspace.status();
        if (status === 'missing-dir')
            return unavailable('workspace-missing');
        const topRun = await this.runner.run([
            ...GIT_GLOBAL,
            'rev-parse',
            '--show-toplevel',
        ], {
            cwd: workspace.path,
            maxBytes: 4096,
            timeoutMs: this.config.timeoutMs,
            signal,
        });
        if (topRun.timedOut)
            return unavailable('timeout');
        if (topRun.aborted)
            return unavailable('git-error');
        if (topRun.exitCode !== 0 || topRun.stdout.trim().length === 0)
            return { kind: 'not-repository' };
        const repoRoot = topRun.stdout.trim();
        const prefix = scopePrefix(repoRoot, workspace.path);
        return { workspace, repoRoot, prefix };
    }
    async runNumstat(cwd, tail, signal) {
        const run = await this.runner.run([...GIT_GLOBAL, ...tail], {
            cwd,
            maxBytes: this.config.maxNumstatBytes,
            timeoutMs: this.config.timeoutMs,
            signal,
        });
        if (run.timedOut)
            return 'timeout';
        if (run.aborted)
            return 'git-error';
        // `git diff` exits 1 when differences exist.
        if (run.exitCode !== 0 && run.exitCode !== 1)
            return 'git-error';
        return { entries: parseNumstat(run.stdout), truncated: run.truncated };
    }
    /**
     * Collect repository-relative paths from a NUL-delimited `git diff --name-only -z`.
     */
    async listDiffPaths(cwd, tail, signal) {
        const run = await this.runner.run([...GIT_GLOBAL, ...tail], {
            cwd,
            maxBytes: this.config.maxStatusBytes,
            timeoutMs: this.config.timeoutMs,
            signal,
        });
        if (run.timedOut)
            return 'timeout';
        if (run.aborted)
            return 'git-error';
        if (!isDiffExitOk(run.exitCode))
            return 'git-error';
        const paths = new Set();
        for (const raw of run.stdout.split('\0')) {
            if (raw.length === 0)
                continue;
            if (isUnsafeRepositoryPath(raw))
                continue;
            try {
                paths.add(normalizePosixRelative(raw));
            }
            catch {
                // skip path that escapes the repository root
            }
        }
        return paths;
    }
    /**
     * Count untracked paths as all-additions via `git diff --no-index` against an empty blob.
     * Results are merged into the HEAD numstat map so the dashboard +/- includes new files.
     */
    async collectUntrackedNumstat(cwd, files, signal) {
        const entries = new Map();
        let truncated = false;
        const untracked = files.filter(file => file.status === 'untracked');
        const budget = Math.min(untracked.length, this.config.maxFiles);
        for (let index = 0; index < budget; index += 1) {
            const file = untracked[index];
            if (file === undefined)
                break;
            if (signal?.aborted === true)
                return 'git-error';
            // `/dev/null` is accepted by Git-for-Windows as the empty side of --no-index.
            const run = await this.runner.run([
                ...GIT_GLOBAL,
                '--literal-pathspecs',
                'diff',
                '--no-index',
                '--numstat',
                '-z',
                '--',
                '/dev/null',
                file.path,
            ], {
                cwd,
                maxBytes: this.config.maxNumstatBytes,
                timeoutMs: this.config.timeoutMs,
                signal,
            });
            if (run.timedOut)
                return 'timeout';
            if (run.aborted)
                return 'git-error';
            if (!isDiffExitOk(run.exitCode))
                continue;
            if (run.truncated)
                truncated = true;
            const parsed = parseNumstat(run.stdout);
            const direct = parsed.get(file.path);
            if (direct !== undefined) {
                entries.set(file.path, direct);
                continue;
            }
            // --no-index sometimes emits only the basename or a single record; take the first.
            for (const entry of parsed.values()) {
                entries.set(file.path, entry);
                break;
            }
        }
        if (untracked.length > budget)
            truncated = true;
        return { entries, truncated };
    }
    applyNumstat(files, numstat) {
        return files.map((file) => {
            const stats = numstat.get(file.path);
            if (stats === undefined)
                return file;
            return {
                ...file,
                binary: stats.binary,
                additions: stats.additions,
                deletions: stats.deletions,
            };
        });
    }
    limitFiles(files) {
        if (files.length <= this.config.maxFiles)
            return { files, truncated: false };
        return { files: files.slice(0, this.config.maxFiles), truncated: true };
    }
    compareFiles(nameStatusStdout, numstat) {
        const files = [];
        const records = nameStatusStdout.split('\0').filter(record => record.length > 0);
        for (const record of records) {
            const tab = record.indexOf('\t');
            if (tab === -1)
                continue;
            const statusRaw = record.slice(0, tab);
            const pathRaw = record.slice(tab + 1);
            const statusCode = statusRaw.charAt(0);
            const rawPath = pathRaw.includes('\t') ? pathRaw.slice(pathRaw.lastIndexOf('\t') + 1) : pathRaw;
            if (isUnsafeRepositoryPath(rawPath))
                continue;
            let path;
            try {
                path = normalizePosixRelative(rawPath);
            }
            catch {
                continue;
            }
            const stats = numstat.get(path);
            files.push({
                path,
                status: mapNameStatus(statusCode),
                staged: false,
                unstaged: true,
                binary: stats?.binary ?? false,
                additions: stats?.additions ?? null,
                deletions: stats?.deletions ?? null,
            });
        }
        return files;
    }
}
function unavailable(code) {
    return { kind: 'unavailable', code };
}
/** `git diff` exits 0 when empty and 1 when differences exist. */
function isDiffExitOk(exitCode) {
    return exitCode === 0 || exitCode === 1;
}
function mapNameStatus(code) {
    switch (code) {
        case 'A': return 'added';
        case 'D': return 'deleted';
        case 'M': return 'modified';
        case 'R': return 'renamed';
        case 'C': return 'copied';
        default: return 'modified';
    }
}
//# sourceMappingURL=service.js.map