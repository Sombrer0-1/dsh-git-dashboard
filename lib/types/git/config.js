/**
 * Resolved Git dashboard Host configuration.
 * @module dsh-git-dashboard/git/config
 */
import z from '@deepseek-ai/schemastery';
const ONE_MIB = 1024 * 1024;
const HALF_MIB = 512 * 1024;
const TWO_FIFTY_SIX_KIB = 256 * 1024;
function assertPositiveFinite(name, value) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`dsh-git-dashboard: ${name} must be a positive finite number`);
    }
}
/**
 * Reject a resolved config that cannot be used for bounded Git collection.
 * @param config - schema-valid config before defaults are applied at runtime.
 * @throws when any numeric limit is non-positive or non-finite.
 */
export function assertServiceableGitConfig(config) {
    assertPositiveFinite('timeoutMs', config.timeoutMs);
    assertPositiveFinite('maxStatusBytes', config.maxStatusBytes);
    assertPositiveFinite('maxNumstatBytes', config.maxNumstatBytes);
    assertPositiveFinite('maxFiles', config.maxFiles);
    assertPositiveFinite('maxBranches', config.maxBranches);
    assertPositiveFinite('maxDiffBytes', config.maxDiffBytes);
    assertPositiveFinite('maxDiffChangedLines', config.maxDiffChangedLines);
    if (config.command.trim().length === 0) {
        throw new Error('dsh-git-dashboard: command must be non-empty');
    }
}
/** Schemastery schema with defaults for cordis plugin loading. */
export const ConfigSchema = z.object({
    command: z.string().default('git'),
    timeoutMs: z.number().default(2000),
    maxStatusBytes: z.number().default(ONE_MIB),
    maxNumstatBytes: z.number().default(HALF_MIB),
    maxFiles: z.number().default(100),
    maxBranches: z.number().default(100),
    maxDiffBytes: z.number().default(TWO_FIFTY_SIX_KIB),
    maxDiffChangedLines: z.number().default(500),
});
/**
 * Resolve and validate configuration for Git collection.
 * @param config - raw plugin config after schemastery defaults.
 * @returns frozen resolved limits.
 */
export function resolveGitConfig(config) {
    const resolved = ConfigSchema(config);
    assertServiceableGitConfig(resolved);
    return Object.freeze({ ...resolved });
}
//# sourceMappingURL=config.js.map