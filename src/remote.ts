/**
 * Hand-written Client Remote contribution for the Git dashboard.
 * Out-of-tree Typert generation cannot analyze this package against the
 * monorepo rootDir, so descriptors and Zod codecs are maintained here.
 * @module dsh-git-dashboard/remote
 */

import { z } from 'zod'
import type { InvocationDescriptor, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'

const workspaceIdSchema = z.string().min(1)

const unavailableSchema = z.object({
  kind: z.literal('unavailable'),
  code: z.enum([
    'not-repository',
    'workspace-missing',
    'git-error',
    'timeout',
    'output-too-large',
  ]),
})

const notRepositorySchema = z.object({
  kind: z.literal('not-repository'),
})

const countsSchema = z.object({
  files: z.number(),
  staged: z.number(),
  unstaged: z.number(),
  untracked: z.number(),
  conflicts: z.number(),
  additions: z.number(),
  deletions: z.number(),
})

const changedFileSchema = z.object({
  path: z.string(),
  status: z.enum([
    'added',
    'modified',
    'deleted',
    'renamed',
    'copied',
    'unmerged',
    'untracked',
  ]),
  staged: z.boolean(),
  unstaged: z.boolean(),
  binary: z.boolean(),
  additions: z.number().nullable(),
  deletions: z.number().nullable(),
})

const repositorySnapshotSchema = z.object({
  kind: z.literal('repository'),
  repositoryName: z.string(),
  scopePrefix: z.string(),
  head: z.object({
    oidShort: z.string(),
    ref: z.string().optional(),
  }),
  upstream: z.object({
    ref: z.string(),
    ahead: z.number(),
    behind: z.number(),
  }).optional(),
  counts: countsSchema,
  files: z.array(changedFileSchema),
  complete: z.boolean(),
  observedAt: z.number(),
})

const snapshotSchema = z.union([
  repositorySnapshotSchema,
  notRepositorySchema,
  unavailableSchema,
])

const branchSchema = z.object({
  ref: z.string(),
  displayName: z.string(),
  oidShort: z.string(),
  type: z.enum(['local', 'remote']),
})

const branchesSchema = z.union([
  z.object({
    kind: z.literal('repository'),
    branches: z.array(branchSchema),
    complete: z.boolean(),
    observedAt: z.number(),
  }),
  notRepositorySchema,
  unavailableSchema,
])

const compareSchema = z.union([
  z.object({
    kind: z.literal('repository'),
    baseRef: z.string(),
    headRef: z.string(),
    baseOid: z.string(),
    headOid: z.string(),
    ahead: z.number(),
    behind: z.number(),
    counts: countsSchema,
    files: z.array(changedFileSchema),
    complete: z.boolean(),
    observedAt: z.number(),
  }),
  notRepositorySchema,
  unavailableSchema,
])

const diffLineSchema = z.object({
  kind: z.enum(['meta', 'hunk', 'context', 'add', 'del']),
  text: z.string(),
})

const fileDiffSchema = z.union([
  z.object({
    kind: z.literal('preview'),
    path: z.string(),
    lines: z.array(diffLineSchema),
    additions: z.number(),
    deletions: z.number(),
    observedAt: z.number(),
  }),
  z.object({
    kind: z.literal('too-large'),
    path: z.string(),
    reason: z.enum(['lines', 'bytes', 'binary']),
    additions: z.number().nullable(),
    deletions: z.number().nullable(),
  }),
  z.object({
    kind: z.literal('empty'),
    path: z.string(),
  }),
  z.object({
    kind: z.literal('unsupported'),
    path: z.string(),
    reason: z.enum(['untracked', 'conflict', 'unsafe-path']),
  }),
  notRepositorySchema,
  unavailableSchema,
])

const baseRefSchema = z.string().min(1)
const filePathSchema = z.string().min(1)

function codec(typeSymbol: string, schema: z.ZodType): InvocationDescriptor['result'] {
  return { mode: 'strict', typeSymbol, schema }
}

function method(
  methodName: 'snapshot' | 'branches' | 'compare' | 'fileDiff',
  parameters: InvocationDescriptor['parameters'],
  resultSchema: z.ZodType,
  resultSymbol: string,
): InvocationDescriptor {
  return {
    id: `dsh-git-dashboard#gitDashboard/${methodName}`,
    service: 'gitDashboard',
    namespace: 'gitDashboard',
    method: methodName,
    invocation: { kind: 'direct' },
    parameters,
    cancellation: { parameter: 'signal' },
    result: codec(resultSymbol, resultSchema),
    sourceLocation: { file: 'src/index.ts', line: 1, column: 1 },
  }
}

const workspaceParam = {
  name: 'workspaceId',
  wire: 'workspaceId',
  source: 'json' as const,
  codec: codec('dsh-git-dashboard/types#WorkspaceId', workspaceIdSchema),
}

/** Client `$mount` contribution for `ctx.remote.gitDashboard`. */
export const TYPERT_REMOTE: TypertRemoteContribution = {
  package: 'dsh-git-dashboard',
  descriptors: [
    method('snapshot', [workspaceParam], snapshotSchema, 'dsh-git-dashboard/types#GitSnapshot'),
    method('branches', [workspaceParam], branchesSchema, 'dsh-git-dashboard/types#GitBranchesResult'),
    method('compare', [
      workspaceParam,
      {
        name: 'baseRef',
        wire: 'baseRef',
        source: 'json',
        codec: codec('dsh-git-dashboard/types#GitBaseRef', baseRefSchema),
      },
    ], compareSchema, 'dsh-git-dashboard/types#GitCompareResult'),
    method('fileDiff', [
      workspaceParam,
      {
        name: 'filePath',
        wire: 'filePath',
        source: 'json',
        codec: codec('dsh-git-dashboard/types#GitFilePath', filePathSchema),
      },
    ], fileDiffSchema, 'dsh-git-dashboard/types#GitFileDiffResult'),
  ],
}

export default TYPERT_REMOTE
