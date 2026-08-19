/**
 * Git dashboard plugin, browser half: mounts the generated Remote contribution
 * and registers the session-header utility popover.
 */
import { GitDashboard } from "./GitDashboard.js";
import { en, NS, zh } from "./locales.js";
export { GitDashboard } from "./GitDashboard.js";
export { NS, zh, en } from "./locales.js";
/** Required services for Remote mount, locale, slot registration, and Host openPath. */
// Do not inject `remote.gitDashboard`: this plugin mounts that namespace itself.
export const inject = ['slots', 'locale', 'remote', 'connection', 'workspaces'];
/**
 * Mount the Git dashboard Remote and register the session-header utility.
 * @param ctx - browser context carrying Remote, slots, locale, connection, and workspaces.
 * @returns disposer that unmounts the Remote contribution.
 */
export async function apply(ctx) {
    const contribution = (await import('dsh-git-dashboard/remote')).default;
    const disposeRemote = await ctx.remote.$mount(contribution);
    const connection = ctx.get('connection');
    const workspaces = ctx.workspaces;
    const gitDashboard = ctx.remote.gitDashboard;
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'git-dashboard: browser dictionaries');
    ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
        name: 'conversation.session.header.utilities',
        id: 'git-dashboard',
        order: 30,
        locale: NS,
        inject: () => ({
            isLoopback: connection.isLoopback,
            hooks: { hostDescription: connection.hostDescription },
            openWorkspace: (path) => { void workspaces.openPath(path); },
            snapshot: (workspaceId, signal) => gitDashboard.snapshot(workspaceId, signal),
            branches: (workspaceId, signal) => gitDashboard.branches(workspaceId, signal),
            compare: (workspaceId, baseRef, signal) => gitDashboard.compare(workspaceId, baseRef, signal),
        }),
    }, GitDashboard));
    return async () => { await disposeRemote(); };
}
//# sourceMappingURL=index.js.map