/**
 * Bounded prefix-preserving Git subprocess runner over `ctx.subprocess`.
 * @module dsh-git-dashboard/git/run
 */

import type { Readable } from 'node:stream'
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import { deadline, timeoutOf } from '@deepseek-ai/dsh-timeout'

/** Git-specific child environment overrides (non-interactive, no pager). */
export const GIT_ENV = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_PAGER: 'cat',
  PAGER: 'cat',
  GIT_OPTIONAL_LOCKS: '0',
  LC_ALL: 'C',
  NO_COLOR: '1',
  TERM: 'dumb',
} as const

const DEFAULT_GRACE_MS = 3000
const TIMEOUT_CODE = 'GIT_TIMEOUT'

/** Outcome of one bounded Git invocation. */
export interface GitRunResult {
  stdout: string
  /** True when stdout exceeded `maxBytes` and was cut at the prefix boundary. */
  truncated: boolean
  exitCode: number | null
  timedOut: boolean
  aborted: boolean
}

/** Options for one Git argv invocation. */
export interface GitRunOptions {
  cwd: string
  maxBytes: number
  timeoutMs: number
  signal?: AbortSignal | undefined
}

/**
 * Read at most `maxBytes` from the start of one stream, discarding the tail.
 * @param stream - piped subprocess stdout or stderr.
 * @param maxBytes - inclusive byte cap on retained prefix text.
 * @returns UTF-8 prefix and whether additional bytes arrived.
 */
async function readPrefix(stream: Readable, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  const chunks: Buffer[] = []
  let total = 0
  let truncated = false

  return await new Promise((resolve, reject) => {
    const finish = (): void => {
      stream.removeListener('data', onData)
      stream.removeListener('end', finish)
      stream.removeListener('error', onError)
      resolve({ text: Buffer.concat(chunks).toString('utf8'), truncated })
    }
    const onError = (error: Error): void => {
      stream.removeListener('data', onData)
      stream.removeListener('end', finish)
      stream.removeListener('error', onError)
      reject(error)
    }
    const onData = (chunk: Buffer): void => {
      if (truncated) return
      if (total + chunk.length <= maxBytes) {
        chunks.push(chunk)
        total += chunk.length
        return
      }
      const remaining = maxBytes - total
      if (remaining > 0) chunks.push(chunk.subarray(0, remaining))
      truncated = true
      stream.destroy()
      finish()
    }
    stream.on('data', onData)
    stream.on('end', finish)
    stream.on('error', onError)
  })
}

/**
 * Git runner bound to one resolved executable and subprocess service.
 */
export class GitRunner {
  /**
   * @param subprocess - Cordis subprocess capability.
   * @param executable - resolved absolute git executable path.
   * @param graceMs - SIGTERM→SIGKILL grace passed to subprocess spawn.
   */
  constructor(
    private readonly subprocess: SubprocessRuntime,
    readonly executable: string,
    private readonly graceMs = DEFAULT_GRACE_MS,
  ) {}

  /**
   * Run one Git argv array with prefix-capped stdout capture.
   * @param argv - git subcommand argv without the executable (`argv[0]` is appended here).
   * @param options - cwd, limits, and cooperative cancellation.
   */
  async run(argv: readonly string[], options: GitRunOptions): Promise<GitRunResult> {
    using d = deadline(options.signal, options.timeoutMs, TIMEOUT_CODE)
    const handle = this.subprocess.spawn({
      argv: [this.executable, ...argv],
      cwd: options.cwd,
      stdio: {
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
      },
      graceMs: this.graceMs,
      signal: d.signal,
      env: { ...GIT_ENV },
    })

    let truncated = false
    let stdout = ''
    try {
      const reads = await Promise.all([
        handle.stdout !== undefined
          ? readPrefix(handle.stdout, options.maxBytes)
          : Promise.resolve({ text: '', truncated: false }),
        handle.stderr !== undefined
          ? readPrefix(handle.stderr, options.maxBytes)
          : Promise.resolve({ text: '', truncated: false }),
      ])
      stdout = reads[0]!.text
      truncated = reads[0]!.truncated
    } catch {
      handle.terminate()
      throw new Error('dsh-git-dashboard: failed to read git subprocess output')
    }

    if (truncated) handle.terminate()

    const outcome = await handle.done
    const timedOut = timeoutOf(d.signal, TIMEOUT_CODE) !== undefined
    const aborted = d.signal.aborted && !timedOut
    return {
      stdout,
      truncated,
      exitCode: outcome.exitCode,
      timedOut,
      aborted,
    }
  }
}

/**
 * Resolve the configured git executable once at plugin load.
 * @param subprocess - Cordis subprocess capability.
 * @param command - configured command name or absolute path.
 * @param signal - optional abort for lookup.
 * @returns absolute executable path.
 */
export async function resolveGitExecutable(
  subprocess: SubprocessRuntime,
  command: string,
  signal?: AbortSignal,
): Promise<string> {
  return subprocess.resolveExecutable(command, {}, signal)
}
