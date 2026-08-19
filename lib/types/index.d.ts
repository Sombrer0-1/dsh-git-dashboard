/**
 * Host Remote gateway for read-only Git dashboard collection.
 * @module dsh-git-dashboard
 */
import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace';
import type { GitBranchesResult, GitCompareResult, GitFileDiffResult, GitSnapshot } from './types.ts';
import { type Config } from './git/config.ts';
export type * from './types.ts';
/**
 * Remote-only Git dashboard gateway (`gitDashboard.*` endpoints).
 * Resolves the configured git executable during plugin activation.
 */
export declare class GitDashboardGateway extends TypertRemoteService {
    static inject: readonly ["subprocess", "workspaceRegistry"];
    static Config: import("@deepseek-ai/schemastery").default<Config>;
    private readonly service;
    /**
     * @param ctx - Cordis context with subprocess and workspace registry.
     * @param config - bounded collection limits from cordis.yml.
     */
    constructor(ctx: Context, config?: Config);
    /**
     * Read a bounded Git status snapshot for one registered workspace.
     * @param workspaceId - workspace registry id (JSON parameter).
     * @param signal - cooperative Remote cancellation (not serialized).
     */
    snapshot(workspaceId: WorkspaceId, signal: AbortSignal): Promise<GitSnapshot>;
    /**
     * List local and remote-tracking branches for one workspace repository.
     * @param workspaceId - workspace registry id.
     * @param signal - cooperative Remote cancellation.
     */
    branches(workspaceId: WorkspaceId, signal: AbortSignal): Promise<GitBranchesResult>;
    /**
     * Summarize file-level differences between HEAD and one base ref.
     * @param workspaceId - workspace registry id.
     * @param baseRef - branch, tag, or oid from the Client.
     * @param signal - cooperative Remote cancellation.
     */
    compare(workspaceId: WorkspaceId, baseRef: string, signal: AbortSignal): Promise<GitCompareResult>;
    /**
     * Preview one path's working-tree unified diff versus HEAD when within size limits.
     * @param workspaceId - workspace registry id.
     * @param filePath - repository-relative path from the Client file list.
     * @param signal - cooperative Remote cancellation.
     */
    fileDiff(workspaceId: WorkspaceId, filePath: string, signal: AbortSignal): Promise<GitFileDiffResult>;
}
export default GitDashboardGateway;
//# sourceMappingURL=index.d.ts.map