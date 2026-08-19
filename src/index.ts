/**
 * Host Remote gateway for read-only Git dashboard collection.
 * @module dsh-git-dashboard
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-subprocess'
import type {} from '@deepseek-ai/dsh-workspace'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace'
// Typert-generated ./remote artifacts import Zod at runtime.
import type {} from 'zod'
import type {
  GitBranchesResult,
  GitCompareResult,
  GitFileDiffResult,
  GitSnapshot,
} from './types.ts'
import { ConfigSchema, resolveGitConfig, type Config } from './git/config.ts'
import { GitCollectionService } from './git/service.ts'
import { GitRunner, resolveGitExecutable } from './git/run.ts'

export type * from './types.ts'

/**
 * Remote-only Git dashboard gateway (`gitDashboard.*` endpoints).
 * Resolves the configured git executable during plugin activation.
 */
export class GitDashboardGateway extends TypertRemoteService {
  static inject = ['subprocess', 'workspaceRegistry'] as const

  static Config = ConfigSchema

  private readonly service: Promise<GitCollectionService>

  /**
   * @param ctx - Cordis context with subprocess and workspace registry.
   * @param config - bounded collection limits from cordis.yml.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'gitDashboard')
    const resolved = resolveGitConfig(config)
    this.service = resolveGitExecutable(ctx.subprocess, resolved.command).then(
      executable => new GitCollectionService(
        new GitRunner(ctx.subprocess, executable),
        resolved,
        ctx.workspaceRegistry,
      ),
    )
    ctx.effect(async () => {
      await this.service
      return () => {}
    }, 'dsh-git-dashboard: resolve git executable at load')
  }

  /**
   * Read a bounded Git status snapshot for one registered workspace.
   * @param workspaceId - workspace registry id (JSON parameter).
   * @param signal - cooperative Remote cancellation (not serialized).
   */
  @Remote('snapshot')
  async snapshot(workspaceId: WorkspaceId, signal: AbortSignal): Promise<GitSnapshot> {
    return (await this.service).snapshot(workspaceId, signal)
  }

  /**
   * List local and remote-tracking branches for one workspace repository.
   * @param workspaceId - workspace registry id.
   * @param signal - cooperative Remote cancellation.
   */
  @Remote('branches')
  async branches(workspaceId: WorkspaceId, signal: AbortSignal): Promise<GitBranchesResult> {
    return (await this.service).branches(workspaceId, signal)
  }

  /**
   * Summarize file-level differences between HEAD and one base ref.
   * @param workspaceId - workspace registry id.
   * @param baseRef - branch, tag, or oid from the Client.
   * @param signal - cooperative Remote cancellation.
   */
  @Remote('compare')
  async compare(workspaceId: WorkspaceId, baseRef: string, signal: AbortSignal): Promise<GitCompareResult> {
    return (await this.service).compare(workspaceId, baseRef, signal)
  }

  /**
   * Preview one path's working-tree unified diff versus HEAD when within size limits.
   * @param workspaceId - workspace registry id.
   * @param filePath - repository-relative path from the Client file list.
   * @param signal - cooperative Remote cancellation.
   */
  @Remote('fileDiff')
  async fileDiff(
    workspaceId: WorkspaceId,
    filePath: string,
    signal: AbortSignal,
  ): Promise<GitFileDiffResult> {
    return (await this.service).fileDiff(workspaceId, filePath, signal)
  }
}

export default GitDashboardGateway
