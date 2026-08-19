/**
 * Git dashboard plugin, browser half: mounts the generated Remote contribution
 * and registers the session-header utility popover.
 */
import type { ClientContext, WorkspaceId } from '@deepseek-ai/dsh-client-runtime/client';
import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import { type GitDashboardKey } from './locales.ts';
import type { GitBranchesResult, GitCompareResult, GitSnapshot } from '../types.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'git-dashboard': GitDashboardKey;
    }
}
declare module '@deepseek-ai/dsh-typert-protocol' {
    interface TypertRemoteNamespaceMap {
        gitDashboard: {
            snapshot(workspaceId: WorkspaceId, signal?: AbortSignal): Promise<RemoteResult<GitSnapshot>>;
            branches(workspaceId: WorkspaceId, signal?: AbortSignal): Promise<RemoteResult<GitBranchesResult>>;
            compare(workspaceId: WorkspaceId, baseRef: string, signal?: AbortSignal): Promise<RemoteResult<GitCompareResult>>;
        };
    }
}
declare module 'dsh-git-dashboard/remote' {
    const contribution: TypertRemoteContribution;
    export default contribution;
}
export { GitDashboard, type GitDashboardInjected, type GitDashboardProps } from './GitDashboard.tsx';
export { NS, zh, en, type GitDashboardKey } from './locales.ts';
/** Required services for Remote mount, locale, slot registration, and Host openPath. */
export declare const inject: string[];
/**
 * Mount the Git dashboard Remote and register the session-header utility.
 * @param ctx - browser context carrying Remote, slots, locale, connection, and workspaces.
 * @returns disposer that unmounts the Remote contribution.
 */
export declare function apply(ctx: ClientContext): Promise<() => Promise<void>>;
//# sourceMappingURL=index.d.ts.map