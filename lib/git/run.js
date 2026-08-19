/**
 * Bounded prefix-preserving Git subprocess runner over `ctx.subprocess`.
 * @module dsh-git-dashboard/git/run
 */
var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
import { deadline, timeoutOf } from '@deepseek-ai/dsh-timeout';
/** Git-specific child environment overrides (non-interactive, no pager). */
export const GIT_ENV = {
    GIT_TERMINAL_PROMPT: '0',
    GIT_PAGER: 'cat',
    PAGER: 'cat',
    GIT_OPTIONAL_LOCKS: '0',
    LC_ALL: 'C',
    NO_COLOR: '1',
    TERM: 'dumb',
};
const DEFAULT_GRACE_MS = 3000;
const TIMEOUT_CODE = 'GIT_TIMEOUT';
/**
 * Read at most `maxBytes` from the start of one stream, discarding the tail.
 * @param stream - piped subprocess stdout or stderr.
 * @param maxBytes - inclusive byte cap on retained prefix text.
 * @returns UTF-8 prefix and whether additional bytes arrived.
 */
async function readPrefix(stream, maxBytes) {
    const chunks = [];
    let total = 0;
    let truncated = false;
    return await new Promise((resolve, reject) => {
        const finish = () => {
            stream.removeListener('data', onData);
            stream.removeListener('end', finish);
            stream.removeListener('error', onError);
            resolve({ text: Buffer.concat(chunks).toString('utf8'), truncated });
        };
        const onError = (error) => {
            stream.removeListener('data', onData);
            stream.removeListener('end', finish);
            stream.removeListener('error', onError);
            reject(error);
        };
        const onData = (chunk) => {
            if (truncated)
                return;
            if (total + chunk.length <= maxBytes) {
                chunks.push(chunk);
                total += chunk.length;
                return;
            }
            const remaining = maxBytes - total;
            if (remaining > 0)
                chunks.push(chunk.subarray(0, remaining));
            truncated = true;
            stream.destroy();
            finish();
        };
        stream.on('data', onData);
        stream.on('end', finish);
        stream.on('error', onError);
    });
}
/**
 * Git runner bound to one resolved executable and subprocess service.
 */
export class GitRunner {
    subprocess;
    executable;
    graceMs;
    /**
     * @param subprocess - Cordis subprocess capability.
     * @param executable - resolved absolute git executable path.
     * @param graceMs - SIGTERM→SIGKILL grace passed to subprocess spawn.
     */
    constructor(subprocess, executable, graceMs = DEFAULT_GRACE_MS) {
        this.subprocess = subprocess;
        this.executable = executable;
        this.graceMs = graceMs;
    }
    /**
     * Run one Git argv array with prefix-capped stdout capture.
     * @param argv - git subcommand argv without the executable (`argv[0]` is appended here).
     * @param options - cwd, limits, and cooperative cancellation.
     */
    async run(argv, options) {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            const d = __addDisposableResource(env_1, deadline(options.signal, options.timeoutMs, TIMEOUT_CODE), false);
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
            });
            let truncated = false;
            let stdout = '';
            try {
                const reads = await Promise.all([
                    handle.stdout !== undefined
                        ? readPrefix(handle.stdout, options.maxBytes)
                        : Promise.resolve({ text: '', truncated: false }),
                    handle.stderr !== undefined
                        ? readPrefix(handle.stderr, options.maxBytes)
                        : Promise.resolve({ text: '', truncated: false }),
                ]);
                stdout = reads[0].text;
                truncated = reads[0].truncated;
            }
            catch {
                handle.terminate();
                throw new Error('dsh-git-dashboard: failed to read git subprocess output');
            }
            if (truncated)
                handle.terminate();
            const outcome = await handle.done;
            const timedOut = timeoutOf(d.signal, TIMEOUT_CODE) !== undefined;
            const aborted = d.signal.aborted && !timedOut;
            return {
                stdout,
                truncated,
                exitCode: outcome.exitCode,
                timedOut,
                aborted,
            };
        }
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            __disposeResources(env_1);
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
export async function resolveGitExecutable(subprocess, command, signal) {
    return subprocess.resolveExecutable(command, {}, signal);
}
