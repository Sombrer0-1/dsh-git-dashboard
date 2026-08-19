/**
 * Read-only Git collection orchestration for one workspace.
 * @module dsh-git-dashboard/git/service
 */
import type { Workspace, WorkspaceId } from '@deepseek-ai/dsh-workspace';
import type { GitBranchesResult, GitCompareResult, GitFileDiffResult, GitSnapshot } from '../types.ts';
import type { ResolvedConfig } from './config.ts';
import type { GitRunner } from './run.ts';
/** Minimal workspace registry surface used by the Git service. */
export interface WorkspaceRegistry {
    get(id: WorkspaceId): Workspace | undefined;
}
/**
 * Read-only Git collector bound to one runner and resolved limits.
 */
export declare class GitCollectionService {
    private readonly runner;
    private readonly config;
    private readonly registry;
    /**
     * @param runner - prefix-capped git subprocess runner.
     * @param config - validated collection limits.
     * @param registry - workspace entity registry.
     */
    constructor(runner: GitRunner, config: ResolvedConfig, registry: WorkspaceRegistry);
    /**
     * Collect a bounded workspace Git status snapshot.
     * @param workspaceId - registered workspace id from the Client.
     * @param signal - cooperative cancellation from the Remote transport.
     */
    snapshot(workspaceId: WorkspaceId, signal?: AbortSignal): Promise<GitSnapshot>;
    /**
     * List local and remote-tracking branches for one workspace repository.
     * @param workspaceId - registered workspace id.
     * @param signal - cooperative cancellation.
     */
    branches(workspaceId: WorkspaceId, signal?: AbortSignal): Promise<GitBranchesResult>;
    /**
     * Compare HEAD against one resolved base ref within the workspace repository.
     * @param workspaceId - registered workspace id.
     * @param baseRef - branch, tag, or oid selected in the Client.
     * @param signal - cooperative cancellation.
     */
    compare(workspaceId: WorkspaceId, baseRef: string, signal?: AbortSignal): Promise<GitCompareResult>;
    /**
     * Preview a single path's working-tree unified diff versus HEAD when small enough.
     * @param workspaceId - registered workspace id.
     * @param filePath - repository-relative POSIX path from the Browser file list.
     * @param signal - cooperative cancellation.
     */
    fileDiff(workspaceId: WorkspaceId, filePath: string, signal?: AbortSignal): Promise<GitFileDiffResult>;
    /**
     * Preview an untracked file as all-additions versus an empty blob.
     */
    private previewNoIndexDiff;
    private finishUnifiedPreview;
    private pathIsTracked;
    private pathIsUnmerged;
    private resolveRepository;
    private runNumstat;
    /**
     * Collect repository-relative paths from a NUL-delimited `git diff --name-only -z`.
     */
    private listDiffPaths;
    /**
     * Count untracked paths as all-additions via `git diff --no-index` against an empty blob.
     * Results are merged into the HEAD numstat map so the dashboard +/- includes new files.
     */
    private collectUntrackedNumstat;
    private applyNumstat;
    private limitFiles;
    private compareFiles;
}
//# sourceMappingURL=service.d.ts.map