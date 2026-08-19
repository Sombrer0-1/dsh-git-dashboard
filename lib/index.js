/**
 * Host Remote gateway for read-only Git dashboard collection.
 * @module dsh-git-dashboard
 */
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol';
import { ConfigSchema, resolveGitConfig } from "./git/config.js";
import { GitCollectionService } from "./git/service.js";
import { GitRunner, resolveGitExecutable } from "./git/run.js";
/**
 * Remote-only Git dashboard gateway (`gitDashboard.*` endpoints).
 * Resolves the configured git executable during plugin activation.
 */
let GitDashboardGateway = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _snapshot_decorators;
    let _branches_decorators;
    let _compare_decorators;
    let _fileDiff_decorators;
    return class GitDashboardGateway extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _snapshot_decorators = [Remote('snapshot')];
            _branches_decorators = [Remote('branches')];
            _compare_decorators = [Remote('compare')];
            _fileDiff_decorators = [Remote('fileDiff')];
            __esDecorate(this, null, _snapshot_decorators, { kind: "method", name: "snapshot", static: false, private: false, access: { has: obj => "snapshot" in obj, get: obj => obj.snapshot }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _branches_decorators, { kind: "method", name: "branches", static: false, private: false, access: { has: obj => "branches" in obj, get: obj => obj.branches }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _compare_decorators, { kind: "method", name: "compare", static: false, private: false, access: { has: obj => "compare" in obj, get: obj => obj.compare }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _fileDiff_decorators, { kind: "method", name: "fileDiff", static: false, private: false, access: { has: obj => "fileDiff" in obj, get: obj => obj.fileDiff }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        static inject = ['subprocess', 'workspaceRegistry'];
        static Config = ConfigSchema;
        service = __runInitializers(this, _instanceExtraInitializers);
        /**
         * @param ctx - Cordis context with subprocess and workspace registry.
         * @param config - bounded collection limits from cordis.yml.
         */
        constructor(ctx, config = {}) {
            super(ctx, 'gitDashboard');
            const resolved = resolveGitConfig(config);
            this.service = resolveGitExecutable(ctx.subprocess, resolved.command).then(executable => new GitCollectionService(new GitRunner(ctx.subprocess, executable), resolved, ctx.workspaceRegistry));
            ctx.effect(async () => {
                await this.service;
                return () => { };
            }, 'dsh-git-dashboard: resolve git executable at load');
        }
        /**
         * Read a bounded Git status snapshot for one registered workspace.
         * @param workspaceId - workspace registry id (JSON parameter).
         * @param signal - cooperative Remote cancellation (not serialized).
         */
        async snapshot(workspaceId, signal) {
            return (await this.service).snapshot(workspaceId, signal);
        }
        /**
         * List local and remote-tracking branches for one workspace repository.
         * @param workspaceId - workspace registry id.
         * @param signal - cooperative Remote cancellation.
         */
        async branches(workspaceId, signal) {
            return (await this.service).branches(workspaceId, signal);
        }
        /**
         * Summarize file-level differences between HEAD and one base ref.
         * @param workspaceId - workspace registry id.
         * @param baseRef - branch, tag, or oid from the Client.
         * @param signal - cooperative Remote cancellation.
         */
        async compare(workspaceId, baseRef, signal) {
            return (await this.service).compare(workspaceId, baseRef, signal);
        }
        /**
         * Preview one path's working-tree unified diff versus HEAD when within size limits.
         * @param workspaceId - workspace registry id.
         * @param filePath - repository-relative path from the Client file list.
         * @param signal - cooperative Remote cancellation.
         */
        async fileDiff(workspaceId, filePath, signal) {
            return (await this.service).fileDiff(workspaceId, filePath, signal);
        }
    };
})();
export { GitDashboardGateway };
export default GitDashboardGateway;
