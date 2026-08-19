/**
 * Parse a single-file unified `git diff` stdout into display lines.
 * @module dsh-git-dashboard/git/parse-diff
 */
/**
 * Count added and deleted content lines in a unified diff body.
 * @param stdout - raw `git diff` text for one path.
 */
export function countChangedLines(stdout) {
    let additions = 0;
    let deletions = 0;
    for (const line of stdout.split('\n')) {
        if (line.startsWith('+') && !line.startsWith('+++'))
            additions += 1;
        else if (line.startsWith('-') && !line.startsWith('---'))
            deletions += 1;
    }
    return { additions, deletions };
}
/**
 * Classify unified-diff lines for the Browser preview.
 * Drops the `diff --git` / `index` / `---` / `+++` headers after recording them as meta.
 * @param stdout - raw `git diff` text for one path.
 */
export function parseUnifiedDiff(stdout) {
    const lines = [];
    for (const raw of stdout.replace(/\r\n/g, '\n').split('\n')) {
        if (raw.length === 0 && lines.length === 0)
            continue;
        if (raw.startsWith('diff --git ')
            || raw.startsWith('index ')
            || raw.startsWith('new file mode ')
            || raw.startsWith('deleted file mode ')
            || raw.startsWith('old mode ')
            || raw.startsWith('new mode ')
            || raw.startsWith('similarity index ')
            || raw.startsWith('rename from ')
            || raw.startsWith('rename to ')
            || raw.startsWith('copy from ')
            || raw.startsWith('copy to ')
            || raw.startsWith('--- ')
            || raw.startsWith('+++ ')) {
            continue;
        }
        if (raw.startsWith('@@')) {
            lines.push({ kind: 'hunk', text: raw });
            continue;
        }
        if (raw.startsWith('+')) {
            lines.push({ kind: 'add', text: raw.slice(1) });
            continue;
        }
        if (raw.startsWith('-')) {
            lines.push({ kind: 'del', text: raw.slice(1) });
            continue;
        }
        if (raw.startsWith('\\')) {
            lines.push({ kind: 'meta', text: raw });
            continue;
        }
        if (raw.startsWith(' ')) {
            lines.push({ kind: 'context', text: raw.slice(1) });
            continue;
        }
        if (raw.length > 0)
            lines.push({ kind: 'meta', text: raw });
    }
    return lines;
}
