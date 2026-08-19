/**
 * Git dashboard plugin, browser half: mounts the hand-written Remote
 * contribution and registers the session-header utility popover.
 */

import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ClientContext, WorkspaceId } from '@deepseek-ai/dsh-client-runtime/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import contribution from '../remote.ts'
import { GitDashboard, type GitDashboardInjected } from './GitDashboard.tsx'
import { en, NS, zh, type GitDashboardKey } from './locales.ts'
import type {
  GitBranchesResult,
  GitCompareResult,
  GitFileDiffResult,
  GitSnapshot,
} from '../types.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'git-dashboard': GitDashboardKey
  }
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    gitDashboard: {
      snapshot(
        workspaceId: WorkspaceId,
        signal?: AbortSignal,
      ): Promise<RemoteResult<GitSnapshot>>
      branches(
        workspaceId: WorkspaceId,
        signal?: AbortSignal,
      ): Promise<RemoteResult<GitBranchesResult>>
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
  }
}

export { GitDashboard, type GitDashboardInjected, type GitDashboardProps } from './GitDashboard.tsx'
export { NS, zh, en, type GitDashboardKey } from './locales.ts'

// Outer fiber only injects `remote` so `$mount` can create `remote.gitDashboard`.
// Declaring `remote.gitDashboard` here would wait forever for a service this apply mounts.
export const inject = ['slots', 'locale', 'remote', 'connection', 'workspaces']

const uiInject = [
  'slots',
  'locale',
  'remote',
  'remote.gitDashboard',
  'connection',
  'workspaces',
] as const

/**
 * Mount the Git dashboard Remote, then inject the new namespace in a child fiber for UI.
 * @param ctx - browser context carrying Remote, slots, locale, connection, and workspaces.
 * @returns disposer that unmounts the UI child and the Remote contribution.
 */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(contribution)

  // Object plugin form: ModuleLoader bundles make function `.name` read-only,
  // so `Object.assign(fn, { name })` throws in the browser.
  const ui = ctx.plugin({
    name: 'dsh-git-dashboard-ui',
    inject: [...uiInject],
    apply(scope: ClientContext) {
      const connection = scope.get('connection') as ConnectionHandle
      const workspaces = scope.workspaces
      const gitDashboard = scope.remote.gitDashboard

      scope.effect(() => scope.locale.register(NS, { zh, en }), 'git-dashboard: browser dictionaries')

      scope.slots.inject('conversation.session.header.utilities', () => scope.slots.register({
        name: 'conversation.session.header.utilities',
        id: 'git-dashboard',
        order: 30,
        locale: NS,
        inject: (): GitDashboardInjected => ({
          isLoopback: connection.isLoopback,
          hooks: { hostDescription: connection.hostDescription },
          openWorkspace: (path: string) => { void workspaces.openPath(path) },
          snapshot: (workspaceId, signal) => gitDashboard.snapshot(workspaceId, signal),
          branches: (workspaceId, signal) => gitDashboard.branches(workspaceId, signal),
          compare: (workspaceId, baseRef, signal) => gitDashboard.compare(workspaceId, baseRef, signal),
          fileDiff: (workspaceId, filePath, signal) => gitDashboard.fileDiff(workspaceId, filePath, signal),
        }),
      }, GitDashboard))
    },
  })
  await ui

  return async () => {
    await ui.dispose()
    await disposeRemote()
  }
}
