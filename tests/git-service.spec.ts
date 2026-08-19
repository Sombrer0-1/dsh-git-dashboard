import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import type { Workspace } from '@deepseek-ai/dsh-workspace/types'
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import { spawnSubprocess } from '../../../../packages/subprocess/subprocess-local/src/spawn.ts'
import { resolveGitConfig } from '../src/git/config.ts'
import { isUnsafeRepositoryPath, normalizePosixRelative, scopePrefix } from '../src/git/paths.ts'
import { GitRunner } from '../src/git/run.ts'
import { GitCollectionService } from '../src/git/service.ts'

function gitAvailable(): boolean {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const hasGit = gitAvailable()

function runGit(cwd: string, args: string[]): void {
  execFileSync('git', args, {
    cwd,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_PAGER: 'cat',
      PAGER: 'cat',
      GIT_OPTIONAL_LOCKS: '0',
      LC_ALL: 'C',
      NO_COLOR: '1',
      TERM: 'dumb',
    },
  })
}

describe('paths', () => {
  it('rejects unsafe user paths', () => {
    expect(isUnsafeRepositoryPath('../secret')).toBe(true)
    expect(isUnsafeRepositoryPath('/abs/path')).toBe(true)
    expect(isUnsafeRepositoryPath(':(glob)*')).toBe(true)
    expect(isUnsafeRepositoryPath('src/a.ts')).toBe(false)
  })

  it('normalizes POSIX relative paths', () => {
    expect(normalizePosixRelative('./src/a.ts')).toBe('src/a.ts')
  })

  it('computes scope prefix between repo root and workspace', () => {
    expect(scopePrefix('/repo', '/repo')).toBe('')
    expect(scopePrefix('/repo', '/repo/pkg')).toBe('pkg')
  })
})

describe.skipIf(!hasGit)('GitCollectionService', () => {
  let repoDir = ''
  let workspace: Workspace
  let service: GitCollectionService
  const subprocess: SubprocessRuntime = {
    resolveExecutable: async (command: string) => command,
    spawn: (spec) => spawnSubprocess(spec, { spillDir: tmpdir() }),
  } as SubprocessRuntime

  afterEach(async () => {
    if (repoDir !== '') {
      await rm(repoDir, { recursive: true, force: true })
      repoDir = ''
    }
  })

  beforeEach(async () => {
    repoDir = await mkdtemp(join(tmpdir(), 'dsh-git-dashboard-'))
    runGit(repoDir, ['init'])
    runGit(repoDir, ['config', 'user.email', 'test@example.com'])
    runGit(repoDir, ['config', 'user.name', 'Test'])
    await writeFile(join(repoDir, 'README.md'), 'hello\n')
    runGit(repoDir, ['add', 'README.md'])
    runGit(repoDir, ['commit', '-m', 'init'])

    workspace = {
      id: WorkspaceId('ws-test'),
      path: repoDir,
      title: 'test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sessionIds: [],
      setTitle: async () => {},
      attachSession: async () => {},
      insertSessionBefore: async () => {},
      detachSession: async () => {},
      status: async () => 'ok',
    }

    service = new GitCollectionService(
      new GitRunner(subprocess, 'git'),
      resolveGitConfig({}),
      { get: (id) => id === workspace.id ? workspace : undefined },
    )
  })

  it('returns a clean repository snapshot', async () => {
    const snapshot = await service.snapshot(workspace.id)
    expect(snapshot.kind).toBe('repository')
    if (snapshot.kind !== 'repository') return
    expect(snapshot.complete).toBe(true)
    expect(snapshot.counts.files).toBe(0)
    expect(snapshot.head.ref).toBeTruthy()
  })

  it('reports modified and untracked files', async () => {
    await writeFile(join(repoDir, 'README.md'), 'hello world\n')
    await writeFile(join(repoDir, 'new.txt'), 'new\n')
    const snapshot = await service.snapshot(workspace.id)
    expect(snapshot.kind).toBe('repository')
    if (snapshot.kind !== 'repository') return
    expect(snapshot.counts.unstaged).toBeGreaterThan(0)
    expect(snapshot.counts.untracked).toBe(1)
    expect(snapshot.files.some(file => file.path === 'new.txt')).toBe(true)
    expect(snapshot.files.some(file => file.status === 'untracked')).toBe(true)
  })

  it('counts untracked files as all-additions and merges into totals', async () => {
    await writeFile(join(repoDir, 'fresh.txt'), 'one\ntwo\nthree\n')
    const snapshot = await service.snapshot(workspace.id)
    expect(snapshot.kind).toBe('repository')
    if (snapshot.kind !== 'repository') return
    const file = snapshot.files.find(entry => entry.path === 'fresh.txt')
    expect(file).toEqual(expect.objectContaining({
      path: 'fresh.txt',
      status: 'untracked',
      additions: 3,
      deletions: 0,
      binary: false,
    }))
    expect(snapshot.counts.untracked).toBe(1)
    expect(snapshot.counts.additions).toBe(3)
    expect(snapshot.counts.deletions).toBe(0)
  })

  it('merges untracked line counts with staged HEAD deltas', async () => {
    await writeFile(join(repoDir, 'README.md'), 'hello\nworld\n')
    runGit(repoDir, ['add', 'README.md'])
    await writeFile(join(repoDir, 'extra.txt'), 'a\nb\n')
    const snapshot = await service.snapshot(workspace.id)
    expect(snapshot.kind).toBe('repository')
    if (snapshot.kind !== 'repository') return
    const readme = snapshot.files.find(entry => entry.path === 'README.md')
    const extra = snapshot.files.find(entry => entry.path === 'extra.txt')
    expect(readme?.additions).toBeGreaterThan(0)
    expect(extra).toEqual(expect.objectContaining({
      status: 'untracked',
      additions: 2,
      deletions: 0,
    }))
    expect(snapshot.counts.additions).toBe((readme?.additions ?? 0) + 2)
  })

  it('reports staged changes in counts', async () => {
    await writeFile(join(repoDir, 'staged.txt'), 'staged\n')
    runGit(repoDir, ['add', 'staged.txt'])
    const snapshot = await service.snapshot(workspace.id)
    expect(snapshot.kind).toBe('repository')
    if (snapshot.kind !== 'repository') return
    expect(snapshot.counts.staged).toBe(1)
    expect(snapshot.counts.unstaged).toBe(0)
    const file = snapshot.files.find(entry => entry.path === 'staged.txt')
    expect(file).toMatchObject({ staged: true, unstaged: false })
  })

  it('counts unstaged separately when the worktree diverges after staging', async () => {
    await writeFile(join(repoDir, 'both.txt'), 'base\n')
    runGit(repoDir, ['add', 'both.txt'])
    runGit(repoDir, ['commit', '-m', 'add both'])
    await writeFile(join(repoDir, 'both.txt'), 'staged\n')
    runGit(repoDir, ['add', 'both.txt'])
    await writeFile(join(repoDir, 'both.txt'), 'dirty\n')
    const snapshot = await service.snapshot(workspace.id)
    expect(snapshot.kind).toBe('repository')
    if (snapshot.kind !== 'repository') return
    expect(snapshot.counts.staged).toBe(1)
    expect(snapshot.counts.unstaged).toBe(1)
    const file = snapshot.files.find(entry => entry.path === 'both.txt')
    expect(file).toMatchObject({ staged: true, unstaged: true })
  })

  it('counts line deltas versus HEAD once when a file is both staged and dirty', async () => {
    // A large staged rewrite plus further unstaged edits must not sum the two
    // numstats: that inflated +/− on generated files toward tens of thousands.
    const original = `${'line\n'.repeat(200)}tail\n`
    await writeFile(join(repoDir, 'big.txt'), original)
    runGit(repoDir, ['add', 'big.txt'])
    runGit(repoDir, ['commit', '-m', 'add big'])

    const stagedRewrite = `${'staged\n'.repeat(200)}tail\n`
    await writeFile(join(repoDir, 'big.txt'), stagedRewrite)
    runGit(repoDir, ['add', 'big.txt'])
    await writeFile(join(repoDir, 'big.txt'), `${stagedRewrite}extra\n`)

    const snapshot = await service.snapshot(workspace.id)
    expect(snapshot.kind).toBe('repository')
    if (snapshot.kind !== 'repository') return
    const file = snapshot.files.find(entry => entry.path === 'big.txt')
    expect(file).toBeDefined()
    expect(file?.additions).not.toBeNull()
    expect(file?.deletions).not.toBeNull()
    // Versus HEAD: ~200 replacements + 1 added trailing line — far below 2×.
    expect((file?.additions ?? 0) + (file?.deletions ?? 0)).toBeLessThan(500)
    expect(file?.additions ?? 0).toBeLessThan(250)
    expect(snapshot.counts.additions).toBe(file?.additions ?? 0)
    expect(snapshot.counts.deletions).toBe(file?.deletions ?? 0)

    const preview = await service.fileDiff(workspace.id, 'big.txt')
    expect(preview.kind).toBe('preview')
    if (preview.kind !== 'preview') return
    expect(preview.additions).toBe(file?.additions ?? null)
    expect(preview.deletions).toBe(file?.deletions ?? null)
  })

  it('returns not-repository for a non-git directory', async () => {
    const plainDir = await mkdtemp(join(tmpdir(), 'dsh-plain-'))
    try {
      const plainWorkspace: Workspace = { ...workspace, id: WorkspaceId('ws-plain'), path: plainDir }
      const plainService = new GitCollectionService(
        new GitRunner(subprocess, 'git'),
        resolveGitConfig({}),
        { get: (id) => id === plainWorkspace.id ? plainWorkspace : undefined },
      )
      const snapshot = await plainService.snapshot(plainWorkspace.id)
      expect(snapshot.kind).toBe('not-repository')
    } finally {
      await rm(plainDir, { recursive: true, force: true })
    }
  })

  it('returns workspace-missing for unknown ids', async () => {
    const snapshot = await service.snapshot(WorkspaceId('missing'))
    expect(snapshot).toEqual({ kind: 'unavailable', code: 'workspace-missing' })
  })

  it('lists branches', async () => {
    const result = await service.branches(workspace.id)
    expect(result.kind).toBe('repository')
    if (result.kind !== 'repository') return
    expect(result.branches.some(branch => branch.type === 'local')).toBe(true)
  })

  it('compares HEAD against another branch with ahead/behind counts', async () => {
    runGit(repoDir, ['checkout', '-b', 'feature'])
    await writeFile(join(repoDir, 'feature.txt'), 'feature\n')
    runGit(repoDir, ['add', 'feature.txt'])
    runGit(repoDir, ['commit', '-m', 'feature commit'])
    const result = await service.compare(workspace.id, 'main')
    expect(result.kind).toBe('repository')
    if (result.kind !== 'repository') return
    expect(result.ahead).toBeGreaterThan(0)
    expect(result.behind).toBe(0)
  })

  it('rejects path escape in compare ref', async () => {
    const result = await service.compare(workspace.id, '-h')
    expect(result.kind).toBe('unavailable')
    if (result.kind !== 'unavailable') return
    expect(result.code).toBe('git-error')
  })

  it('scopes nested workspace prefix', async () => {
    const nested = join(repoDir, 'pkg')
    await mkdir(nested, { recursive: true })
    const nestedWorkspace: Workspace = {
      ...workspace,
      id: WorkspaceId('ws-nested'),
      path: nested,
    }
    const nestedService = new GitCollectionService(
      new GitRunner(subprocess, 'git'),
      resolveGitConfig({}),
      { get: (id) => id === nestedWorkspace.id ? nestedWorkspace : undefined },
    )
    const snapshot = await nestedService.snapshot(nestedWorkspace.id)
    expect(snapshot.kind).toBe('repository')
    if (snapshot.kind !== 'repository') return
    expect(snapshot.scopePrefix).toBe('pkg')
  })

  it('previews a small working-tree diff versus HEAD', async () => {
    await writeFile(join(repoDir, 'README.md'), 'hello\nworld\nextra\n')
    const result = await service.fileDiff(workspace.id, 'README.md')
    expect(result.kind).toBe('preview')
    if (result.kind !== 'preview') return
    expect(result.additions).toBeGreaterThan(0)
    expect(result.lines.some(line => line.kind === 'add')).toBe(true)
  })

  it('previews staged-only additions versus HEAD', async () => {
    await writeFile(join(repoDir, 'staged-only.txt'), 'one\ntwo\nthree\n')
    runGit(repoDir, ['add', 'staged-only.txt'])
    const result = await service.fileDiff(workspace.id, 'staged-only.txt')
    expect(result.kind).toBe('preview')
    if (result.kind !== 'preview') return
    expect(result.additions).toBe(3)
    expect(result.deletions).toBe(0)
  })

  it('previews untracked files as all-additions', async () => {
    await writeFile(join(repoDir, 'ghost.txt'), 'alpha\nbeta\n')
    const result = await service.fileDiff(workspace.id, 'ghost.txt')
    expect(result.kind).toBe('preview')
    if (result.kind !== 'preview') return
    expect(result.additions).toBe(2)
    expect(result.deletions).toBe(0)
    expect(result.lines.some(line => line.kind === 'add' && line.text === 'alpha')).toBe(true)
  })
})
