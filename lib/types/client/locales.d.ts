/** `git-dashboard` namespace dictionaries. */
/** Dictionary namespace owned by this plugin. */
export declare const NS = "git-dashboard";
/** Simplified Chinese dictionary (the key-set source of truth). */
export declare const zh: {
    readonly 'trigger.files': "{count} 个文件";
    readonly 'trigger.aria': "Git 工作区：{branch}";
    readonly 'panel.aria': "Git 工作区看板";
    readonly 'panel.title': "Git 工作区";
    readonly 'panel.repository': "仓库";
    readonly 'panel.scope': "范围";
    readonly 'panel.head': "HEAD";
    readonly 'panel.upstream': "上游";
    readonly 'panel.observedAt': "更新于 {time}";
    readonly 'panel.stats.staged': "已暂存 {count}";
    readonly 'panel.stats.unstaged': "未暂存 {count}";
    readonly 'panel.stats.untracked': "未跟踪 {count}";
    readonly 'panel.stats.conflicts': "冲突 {count}";
    readonly 'panel.stats.lines': "+{additions}/−{deletions}";
    readonly 'panel.truncated': "列表已截断，完整变更请在本机 Git 工具中查看";
    readonly 'panel.empty': "工作区干净";
    readonly 'panel.error': "无法读取 Git 状态";
    readonly 'panel.retry': "重试";
    readonly 'panel.refresh': "刷新";
    readonly 'panel.refreshing': "刷新中…";
    readonly 'panel.openFolder': "在文件夹中打开";
    readonly 'compare.title': "分支比较";
    readonly 'compare.selectBase': "选择基准分支";
    readonly 'compare.aheadBehind': "领先 {ahead} · 落后 {behind}";
    readonly 'compare.noBranches': "没有可比较的分支";
    readonly 'compare.loading': "比较中…";
    readonly 'compare.expand': "展开分支比较";
    readonly 'compare.collapse': "收起分支比较";
    readonly 'status.staged': "已暂存";
    readonly 'status.unstaged': "未暂存";
    readonly 'status.untracked': "未跟踪";
    readonly 'status.conflict': "冲突";
    readonly 'status.binary': "二进制";
    readonly 'stale.label': "数据可能已过期";
};
/** English dictionary, key-identical to the Chinese source of truth. */
export declare const en: Record<GitDashboardKey, string>;
/** Key domain of the `git-dashboard` namespace (zh is the source of truth). */
export type GitDashboardKey = keyof typeof zh;
//# sourceMappingURL=locales.d.ts.map