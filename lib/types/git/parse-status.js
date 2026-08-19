/**
 * Parser for `git status --porcelain=v2 --branch -z`.
 * @module dsh-git-dashboard/git/parse-status
 */
import { isUnsafeRepositoryPath, normalizePosixRelative } from "./paths.js";
function mapIndexWorktree(index, worktree) {
    const code = index !== ' ' ? index : worktree;
    switch (code) {
        case 'A': return 'added';
        case 'M': return 'modified';
        case 'D': return 'deleted';
        case 'R': return 'renamed';
        case 'C': return 'copied';
        case 'U': return 'unmerged';
        case '?': return 'untracked';
        default: return 'modified';
    }
}
function safePath(raw) {
    if (isUnsafeRepositoryPath(raw))
        return undefined;
    try {
        return normalizePosixRelative(raw);
    }
    catch {
        return undefined;
    }
}
function parseBranchLine(line, branch) {
    if (line.startsWith('# branch.oid '))
        branch.oid = line.slice('# branch.oid '.length);
    else if (line.startsWith('# branch.head '))
        branch.head = line.slice('# branch.head '.length);
    else if (line.startsWith('# branch.upstream '))
        branch.upstream = line.slice('# branch.upstream '.length);
    else if (line.startsWith('# branch.ab ')) {
        const match = /\+(\d+) -(\d+)/.exec(line.slice('# branch.ab '.length));
        if (match !== null) {
            branch.ahead = Number(match[1]);
            branch.behind = Number(match[2]);
        }
    }
}
function fileFromOrdinary(fields, xy) {
    const path = safePath(fields[fields.length - 1] ?? '');
    if (path === undefined)
        return undefined;
    const index = xy[0] ?? ' ';
    const worktree = xy[1] ?? ' ';
    const status = mapIndexWorktree(index, worktree);
    const staged = index !== ' ' && index !== '.' && index !== '?' && index !== '!';
    const unstaged = worktree !== ' ' && worktree !== '.' && worktree !== '?' && worktree !== '!';
    return {
        path,
        status,
        staged,
        unstaged,
        binary: false,
        additions: null,
        deletions: null,
    };
}
function fileFromRename(fields, xy) {
    const path = safePath(fields[fields.length - 1] ?? '');
    if (path === undefined)
        return undefined;
    const index = xy[0] ?? ' ';
    const worktree = xy[1] ?? ' ';
    const status = mapIndexWorktree(index, worktree);
    const staged = index !== ' ' && index !== '.' && index !== '?' && index !== '!';
    const unstaged = worktree !== ' ' && worktree !== '.' && worktree !== '?' && worktree !== '!';
    return {
        path,
        status: status === 'modified' ? 'renamed' : status,
        staged,
        unstaged,
        binary: false,
        additions: null,
        deletions: null,
    };
}
function fileFromUnmerged(fields, xy) {
    const path = safePath(fields[fields.length - 1] ?? '');
    if (path === undefined)
        return undefined;
    const index = xy[0] ?? ' ';
    const worktree = xy[1] ?? ' ';
    return {
        path,
        status: 'unmerged',
        staged: index !== ' ' && index !== '.' && index !== '?' && index !== '!',
        unstaged: worktree !== ' ' && worktree !== '.' && worktree !== '?' && worktree !== '!',
        binary: false,
        additions: null,
        deletions: null,
    };
}
/**
 * Parse NUL-delimited porcelain v2 status output.
 * @param stdout - raw git stdout (NUL-separated records).
 * @returns structured branch metadata and changed files.
 */
export function parseStatusPorcelainV2(stdout) {
    const branchMeta = {};
    const files = [];
    let staged = 0;
    let unstaged = 0;
    let untracked = 0;
    let conflicts = 0;
    const records = stdout.split('\0').filter(record => record.length > 0);
    for (const record of records) {
        if (record.startsWith('# branch.')) {
            parseBranchLine(record, branchMeta);
            continue;
        }
        if (record.startsWith('# ')) {
            for (const line of record.split('\n'))
                parseBranchLine(line, branchMeta);
            continue;
        }
        const firstNewline = record.indexOf('\n');
        const header = firstNewline === -1 ? record : record.slice(0, firstNewline);
        const kind = header[0];
        const fields = header.split(' ');
        if (kind === '?') {
            const path = safePath(header.slice(2));
            if (path !== undefined) {
                untracked += 1;
                files.push({
                    path,
                    status: 'untracked',
                    staged: false,
                    unstaged: false,
                    binary: false,
                    additions: null,
                    deletions: null,
                });
            }
            continue;
        }
        if (kind === '!')
            continue;
        const xy = fields[1] ?? '  ';
        if (kind === '1') {
            const file = fileFromOrdinary(fields, xy);
            if (file !== undefined) {
                if (file.staged)
                    staged += 1;
                if (file.unstaged)
                    unstaged += 1;
                files.push(file);
            }
        }
        else if (kind === '2') {
            const file = fileFromRename(fields, xy);
            if (file !== undefined) {
                if (file.staged)
                    staged += 1;
                if (file.unstaged)
                    unstaged += 1;
                files.push(file);
            }
        }
        else if (kind === 'u') {
            const file = fileFromUnmerged(fields, xy);
            if (file !== undefined) {
                conflicts += 1;
                if (file.staged)
                    staged += 1;
                if (file.unstaged)
                    unstaged += 1;
                files.push(file);
            }
        }
    }
    const oid = branchMeta.oid ?? '0000000';
    const headRef = branchMeta.head;
    const head = {
        oidShort: oid.slice(0, 7),
        ...(headRef !== undefined && headRef !== '(detached)' ? { ref: headRef } : {}),
    };
    const upstream = branchMeta.upstream !== undefined && branchMeta.ahead !== undefined && branchMeta.behind !== undefined
        ? {
            ref: branchMeta.upstream,
            ahead: branchMeta.ahead,
            behind: branchMeta.behind,
        }
        : undefined;
    return {
        branch: {
            head,
            ...(upstream !== undefined ? { upstream } : {}),
        },
        files,
        counts: { staged, unstaged, untracked, conflicts },
    };
}
//# sourceMappingURL=parse-status.js.map