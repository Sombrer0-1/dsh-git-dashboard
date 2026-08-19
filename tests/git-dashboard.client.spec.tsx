// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionId, SessionListState, WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-client-runtime/client'
import { GitDashboard, type GitDashboardProps } from '../src/client/GitDashboard.tsx'
import { zh } from '../src/client/locales.ts'
import type { GitNotRepository, GitRepositorySnapshot } from '../src/types.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const SESSION = 'session-a' as SessionId
const WORKSPACE_ID = 'ws-a' as WorkspaceId
const t: GitDashboardProps['t'] = makeTranslate(zh)

function workspace(sessionIds: SessionId[] = [SESSION]): WorkspaceView {
  return {
    workspaceId: WORKSPACE_ID,
    path: '/repo/project',
    title: 'project',
    sessionIds,
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

function repository(over: Partial<GitRepositorySnapshot> = {}): GitRepositorySnapshot {
  return {
    kind: 'repository',
    repositoryName: 'project',
    scopePrefix: '',
    head: { ref: 'main', oidShort: 'abc1234' },
    counts: {
      files: 0,
      staged: 0,
      unstaged: 0,
      untracked: 0,
      conflicts: 0,
      additions: 0,
      deletions: 0,
    },
    files: [],
    complete: true,
    observedAt: Date.now(),
    ...over,
  }
}

function props(
  over: Partial<GitDashboardProps> & {
    workspace?: WorkspaceView | null
    snap?: GitRepositorySnapshot | GitNotRepository
  } = {},
): GitDashboardProps {
  const snapResult = over.snap ?? repository()
  const sessions: SessionListState = {
    ids: [SESSION],
    byId: {
      [SESSION]: {
        id: SESSION,
        displayTitle: 'Session',
        running: false,
        blank: true,
        updatedAt: 0,
      },
    },
    current: SESSION,
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  }
  const items = over.workspace === null
    ? []
    : over.workspace === undefined
      ? [workspace()]
      : [over.workspace]
  return {
    sessionId: SESSION,
    useSessions: select => select(sessions),
    useWorkspaces: select => select({
      items,
      archivedSessionIds: [],
      state: 'idle',
      phase: 'ready',
      error: null,
      baselinesReady: true,
      recentWorkspaceId: WORKSPACE_ID,
    }),
    isLoopback: true,
    useHostDescription: selector => selector({
      version: 'test',
      cwd: '/repo',
      attachedSessions: 1,
      canOpenPath: true,
    }),
    openWorkspace: vi.fn(),
    snapshot: vi.fn(async () => ({ ok: true as const, value: snapResult })),
    branches: vi.fn(async () => ({
      ok: true as const,
      value: {
        kind: 'repository' as const,
        branches: [],
        complete: true,
        observedAt: Date.now(),
      },
    })),
    compare: vi.fn(async () => ({
      ok: true as const,
      value: {
        kind: 'repository' as const,
        baseRef: 'main',
        headRef: 'HEAD',
        baseOid: 'aaaaaaaa',
        headOid: 'bbbbbbbb',
        ahead: 0,
        behind: 0,
        counts: repository().counts,
        files: [],
        complete: true,
        observedAt: Date.now(),
      },
    })),
    fileDiff: vi.fn(async () => ({
      ok: true as const,
      value: {
        kind: 'preview' as const,
        path: 'a.ts',
        lines: [
          { kind: 'hunk' as const, text: '@@ -1 +1 @@' },
          { kind: 'del' as const, text: 'old' },
          { kind: 'add' as const, text: 'new' },
        ],
        additions: 1,
        deletions: 1,
        observedAt: Date.now(),
      },
    })),
    t,
    ...over,
  }
}

describe('GitDashboard visibility', () => {
  it('hides when the snapshot is not a repository', async () => {
    const view = render(<GitDashboard {...props({ snap: { kind: 'not-repository' } })} />)
    await vi.waitFor(() => {
      expect(view.container.innerHTML).toBe('')
    })
  })

  it('hides when the session has no workspace', async () => {
    const view = render(<GitDashboard {...props({ workspace: null })} />)
    await vi.waitFor(() => {
      expect(view.container.innerHTML).toBe('')
    })
  })

  it('omits dirty file count on a clean working tree', async () => {
    render(<GitDashboard {...props({
      snap: repository({
        counts: {
          files: 0,
          staged: 0,
          unstaged: 0,
          untracked: 0,
          conflicts: 0,
          additions: 0,
          deletions: 0,
        },
      }),
    })} />)
    const trigger = await screen.findByRole('button', { name: 'Git 工作区：main' })
    expect(trigger.textContent).not.toContain('个文件')
  })

  it('shows dirty file count on the trigger', async () => {
    render(<GitDashboard {...props({
      snap: repository({
        counts: {
          files: 3,
          staged: 1,
          unstaged: 1,
          untracked: 1,
          conflicts: 0,
          additions: 4,
          deletions: 2,
        },
        files: [
          {
            path: 'a.ts',
            status: 'modified',
            staged: false,
            unstaged: true,
            binary: false,
            additions: 1,
            deletions: 0,
          },
        ],
      }),
    })} />)
    const trigger = await screen.findByRole('button', { name: 'Git 工作区：main' })
    expect(trigger.textContent).toContain('3 个文件')
  })
})

describe('GitDashboard popover', () => {
  it('closes on Escape and returns focus to the trigger', async () => {
    const { container } = render(<GitDashboard {...props()} />)
    const trigger = await screen.findByRole('button', { name: 'Git 工作区：main' })
    fireEvent.click(trigger)
    expect(screen.getByRole('region', { name: zh['panel.aria'] })).toBeDefined()
    const root = container.firstElementChild
    expect(root).not.toBeNull()
    fireEvent.keyDown(root as Element, { key: 'Escape' })
    expect(screen.queryByRole('region', { name: zh['panel.aria'] })).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('marks stale after refresh failure while keeping the previous branch', async () => {
    const snapshot = vi.fn()
      .mockResolvedValueOnce({ ok: true as const, value: repository({ head: { ref: 'feature-x', oidShort: 'abc1234' } }) })
      .mockResolvedValueOnce({ ok: false as const, error: { code: 'transport', message: 'offline' } })
    render(<GitDashboard {...props({ snapshot })} />)
    const trigger = await screen.findByRole('button', { name: 'Git 工作区：feature-x' })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: zh['panel.refresh'] }))
    await vi.waitFor(() => {
      expect(screen.getByText(zh['stale.label'])).toBeDefined()
    })
    expect(trigger.textContent).toContain('feature-x')
  })

  it('hides open-folder when not on loopback', async () => {
    render(<GitDashboard {...props({ isLoopback: false })} />)
    const trigger = await screen.findByRole('button', { name: 'Git 工作区：main' })
    fireEvent.click(trigger)
    expect(screen.queryByRole('button', { name: zh['panel.openFolder'] })).toBeNull()
  })

  it('shows open-folder on loopback when the host can open paths', async () => {
    render(<GitDashboard {...props({ isLoopback: true })} />)
    const trigger = await screen.findByRole('button', { name: 'Git 工作区：main' })
    fireEvent.click(trigger)
    expect(screen.getByRole('button', { name: zh['panel.openFolder'] })).toBeDefined()
  })

  it('shows no-upstream copy and diff hint in the panel', async () => {
    render(<GitDashboard {...props({
      snap: repository({ upstream: undefined }),
    })} />)
    const trigger = await screen.findByRole('button', { name: 'Git 工作区：main' })
    fireEvent.click(trigger)
    expect(screen.getByText(zh['panel.noUpstream'])).toBeDefined()
    expect(screen.getByText(zh['panel.diffHint'])).toBeDefined()
  })

  it('opens a small-file diff overlay when a file row is clicked', async () => {
    const fileDiff = vi.fn(async () => ({
      ok: true as const,
      value: {
        kind: 'preview' as const,
        path: 'a.ts',
        lines: [
          { kind: 'add' as const, text: 'hello' },
        ],
        additions: 1,
        deletions: 0,
        observedAt: Date.now(),
      },
    }))
    render(<GitDashboard {...props({
      fileDiff,
      snap: repository({
        counts: {
          files: 1,
          staged: 0,
          unstaged: 1,
          untracked: 0,
          conflicts: 0,
          additions: 1,
          deletions: 0,
        },
        files: [{
          path: 'a.ts',
          status: 'modified',
          staged: false,
          unstaged: true,
          binary: false,
          additions: 1,
          deletions: 0,
        }],
      }),
    })} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Git 工作区：main' }))
    fireEvent.click(screen.getByRole('button', { name: '预览 a.ts 的差异' }))
    expect(await screen.findByRole('dialog', { name: zh['diff.aria'] })).toBeDefined()
    expect(fileDiff).toHaveBeenCalledWith(WORKSPACE_ID, 'a.ts', expect.any(AbortSignal))
    expect(await screen.findByText('hello')).toBeDefined()
    expect(screen.getAllByText('+1').length).toBeGreaterThan(0)
  })

  it('explains when the Host refuses a large diff', async () => {
    render(<GitDashboard {...props({
      fileDiff: vi.fn(async () => ({
        ok: true as const,
        value: {
          kind: 'too-large' as const,
          path: 'big.ts',
          reason: 'lines' as const,
          additions: 40,
          deletions: 20,
        },
      })),
      snap: repository({
        counts: {
          files: 1,
          staged: 0,
          unstaged: 1,
          untracked: 0,
          conflicts: 0,
          additions: 40,
          deletions: 20,
        },
        files: [{
          path: 'big.ts',
          status: 'modified',
          staged: false,
          unstaged: true,
          binary: false,
          additions: 40,
          deletions: 20,
        }],
      }),
    })} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Git 工作区：main' }))
    fireEvent.click(screen.getByRole('button', { name: '预览 big.ts 的差异' }))
    await vi.waitFor(() => {
      expect(screen.getByText('变更约 40/20 行，过大不预览')).toBeDefined()
    })
  })
})
