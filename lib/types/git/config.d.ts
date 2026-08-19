/**
 * Resolved Git dashboard Host configuration.
 * @module dsh-git-dashboard/git/config
 */
import z from '@deepseek-ai/schemastery';
/** Plugin cordis.yml configuration. */
export interface Config {
    /** Git executable name or absolute path (default `git`). */
    command?: string;
    /** Per-command wall-clock timeout in milliseconds (default 2000). */
    timeoutMs?: number;
    /** Maximum captured bytes for `git status` stdout (default 1 MiB). */
    maxStatusBytes?: number;
    /** Maximum captured bytes for each `git diff --numstat` stdout (default 512 KiB). */
    maxNumstatBytes?: number;
    /** Maximum changed files returned in one snapshot or compare (default 100). */
    maxFiles?: number;
    /** Maximum branches returned by {@link GitDashboardGateway.branches} (default 100). */
    maxBranches?: number;
    /** Maximum captured bytes for one file unified diff preview (default 256 KiB). */
    maxDiffBytes?: number;
    /** Maximum added+deleted content lines for a file preview (default 500). */
    maxDiffChangedLines?: number;
}
/** Config after schema defaults and numeric validation. */
export interface ResolvedConfig {
    command: string;
    timeoutMs: number;
    maxStatusBytes: number;
    maxNumstatBytes: number;
    maxFiles: number;
    maxBranches: number;
    maxDiffBytes: number;
    maxDiffChangedLines: number;
}
/**
 * Reject a resolved config that cannot be used for bounded Git collection.
 * @param config - schema-valid config before defaults are applied at runtime.
 * @throws when any numeric limit is non-positive or non-finite.
 */
export declare function assertServiceableGitConfig(config: ResolvedConfig): void;
/** Schemastery schema with defaults for cordis plugin loading. */
export declare const ConfigSchema: z<Config>;
/**
 * Resolve and validate configuration for Git collection.
 * @param config - raw plugin config after schemastery defaults.
 * @returns frozen resolved limits.
 */
export declare function resolveGitConfig(config: Config): ResolvedConfig;
//# sourceMappingURL=config.d.ts.map