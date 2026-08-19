/**
 * Session-header Git workspace dashboard: read-only branch and file-level
 * summary for the current Session's Workspace.
 */
import type { HostDescriptionSource } from '@deepseek-ai/dsh-client-connection/client';
import type { WorkspaceId } from '@deepseek-ai/dsh-client-runtime/client';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { GitBranchesResult, GitCompareResult, GitSnapshot } from '../types.ts';
import { NS } from './locales.ts';
/** Registration-side Remote callbacks and Host capability facts. */
export interface GitDashboardInjected {
    /** Whether the browser itself is connected over loopback. */
    isLoopback: boolean;
    hooks: {
        /** Current generation's Host description, bound by the slot renderer. */
        hostDescription: HostDescriptionSource;
    };
    /** Open the Workspace directory through the Host opener. */
    openWorkspace(path: string): void;
    snapshot(workspaceId: WorkspaceId, signal?: AbortSignal): Promise<RemoteResult<GitSnapshot>>;
    branches(workspaceId: WorkspaceId, signal?: AbortSignal): Promise<RemoteResult<GitBranchesResult>>;
    compare(workspaceId: WorkspaceId, baseRef: string, signal?: AbortSignal): Promise<RemoteResult<GitCompareResult>>;
}
/** Full props for the session-header Git utility. */
export type GitDashboardProps = PropsRuntime<'conversation.session.header.utilities'> & PropsLocale<typeof NS> & InjectFace<GitDashboardInjected>;
/**
 * Session-header Git workspace utility. Renders nothing without a Workspace,
 * a Git repository, or a completed first snapshot that is not a repository.
 * @param props - runtime slot currency, locale seat, and injected Remote callbacks.
 * @returns the trigger and popover, or null when hidden.
 */
export declare function GitDashboard({ sessionId, useWorkspaces, useSessions, isLoopback, useHostDescription, openWorkspace, snapshot, branches, compare, t, }: GitDashboardProps): import("react").JSX.Element | null;
//# sourceMappingURL=GitDashboard.d.ts.map