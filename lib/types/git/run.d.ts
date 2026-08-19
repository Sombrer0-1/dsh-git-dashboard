/**
 * Bounded prefix-preserving Git subprocess runner over `ctx.subprocess`.
 * @module dsh-git-dashboard/git/run
 */
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess';
/** Git-specific child environment overrides (non-interactive, no pager). */
export declare const GIT_ENV: {
    readonly GIT_TERMINAL_PROMPT: "0";
    readonly GIT_PAGER: "cat";
    readonly PAGER: "cat";
    readonly GIT_OPTIONAL_LOCKS: "0";
    readonly LC_ALL: "C";
    readonly NO_COLOR: "1";
    readonly TERM: "dumb";
};
/** Outcome of one bounded Git invocation. */
export interface GitRunResult {
    stdout: string;
    /** True when stdout exceeded `maxBytes` and was cut at the prefix boundary. */
    truncated: boolean;
    exitCode: number | null;
    timedOut: boolean;
    aborted: boolean;
}
/** Options for one Git argv invocation. */
export interface GitRunOptions {
    cwd: string;
    maxBytes: number;
    timeoutMs: number;
    signal?: AbortSignal | undefined;
}
/**
 * Git runner bound to one resolved executable and subprocess service.
 */
export declare class GitRunner {
    private readonly subprocess;
    readonly executable: string;
    private readonly graceMs;
    /**
     * @param subprocess - Cordis subprocess capability.
     * @param executable - resolved absolute git executable path.
     * @param graceMs - SIGTERM→SIGKILL grace passed to subprocess spawn.
     */
    constructor(subprocess: SubprocessRuntime, executable: string, graceMs?: number);
    /**
     * Run one Git argv array with prefix-capped stdout capture.
     * @param argv - git subcommand argv without the executable (`argv[0]` is appended here).
     * @param options - cwd, limits, and cooperative cancellation.
     */
    run(argv: readonly string[], options: GitRunOptions): Promise<GitRunResult>;
}
/**
 * Resolve the configured git executable once at plugin load.
 * @param subprocess - Cordis subprocess capability.
 * @param command - configured command name or absolute path.
 * @param signal - optional abort for lookup.
 * @returns absolute executable path.
 */
export declare function resolveGitExecutable(subprocess: SubprocessRuntime, command: string, signal?: AbortSignal): Promise<string>;
//# sourceMappingURL=run.d.ts.map