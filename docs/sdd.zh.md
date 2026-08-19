# DSH Git 工作区看板 SDD（纯扩展版）

> **说明**：本文为设计草案存档。已发布行为以仓库根目录 [README.md](../README.md) 为准（例如后续已加入受上限约束的小文件 unified diff 预览）。

状态：提案。交付形式：仓外 profile 插件。目标：在不修改 deepseek-harness 源码的前提下，为当前 Session 提供轻量、只读的 Git 工作区摘要。

## 1. 约束与结论

本方案只允许新增一个安装在 profile 目录中的插件包及其构建产物。不得修改 `packages/`、`apps/`、`docs/`、`.agents/notes/`、Gateway、Connection、`api-remotes` 或 Web 快照目录。

因此不采用原 SDD 的三项仓内假设：

- 不增加 `loopbackOnlyEndpoints` 或 endpoint authority resolver。插件 Remote 只能使用现有 Gateway 的 `trusted-host` 传输策略。
- 不修改 `packages/api/remotes`。浏览器半边在自身 `apply()` 中调用现有 `ctx.remote.$mount()` 挂载本插件生成的 Remote contribution。
- 不把包加入 monorepo workspace 或仓内聚合面。插件通过 `dsh.bundle.patch` 和 profile 的 `dsh.profile.bundles` 加载。

安全取舍是本方案的硬边界：MVP 不把文件内容、unified diff、`.git` 内容或完整 stderr 返回浏览器，只返回分支和文件级统计。这样可以使用现有 `trusted-host`，但仍会向已授权的远程连接暴露仓库名称、分支名和变更元数据。推荐只在本机 Web 绑定上启用；若部署允许 LAN trusted host，使用者必须接受这项元数据暴露。

## 2. MVP 范围

### 目标

- 当前 Session 绑定一个已注册 Workspace 且该目录位于 Git 工作树内时，在会话头部显示一个紧凑入口。
- 入口显示当前分支或 detached HEAD、工作区是否有改动、变更文件数、增删行数、ahead/behind 和冲突数。
- 展开看板后显示受限的文件级变更列表，以及本地分支和 remote-tracking branch 的摘要比较。
- 信息过多时只显示前 N 项并标记截断；用户可打开 Workspace 文件夹，使用系统 Git 工具查看完整 diff。
- 所有操作只读，不修改索引、工作树、分支、远程、提交或 Session 日志。

### 非目标

- 不显示完整 patch，不在浏览器解析 unified diff，不构造 IDE 级语义 diff。
- 不实现 stage、unstage、commit、checkout、merge、rebase、fetch、pull、push、stash、删除文件或写入仓库。
- 不使用文件 watcher、常驻轮询、完整提交历史、PR/MR API、账号登录或远程 Git 服务。
- 不把 Git 状态写入模型上下文、系统提示词、SessionEventMap 或 durable storage。

附件图片只作为“右上角摘要卡、展开查看、过多信息交给外部工具”的交互参照。图片中的仓库名、分支名、数字、权限状态和按钮不属于实现输入。

## 3. 插件交付形态

### 3.1 单包结构

插件包名示例：`dsh-git-dashboard`。它同时包含 Host 半边和 Browser 半边，避免维护两个需要同步安装的包：

```text
dsh-git-dashboard/
  package.json
  cordis.patch.yml
  src/index.ts                 # Host plugin / Remote service
  src/types.ts                 # Remote 的 client-safe 数据类型
  src/client/index.ts          # Browser plugin
  src/client/GitDashboard.tsx
  src/client/*.module.css
  src/client/locales.ts
  tests/
```

包的 `package.json` 声明：

- `dsh.bundle.patch: "./cordis.patch.yml"`，使它可以被 profile 当作 bundle 安装。
- `exports["./client"]`，供 Client Module Loader 发现 Browser 半边。
- `exports["./remote"]`，发布 Typert 生成的 Client Remote contribution。
- `dsh.client.platform: "web"` 及最小 `dsh.client.inject` 列表。

`cordis.patch.yml` 只插入本插件自己的 Host 行，例如：

```yaml
- insert:
    - id: git-dashboard
      name: dsh-git-dashboard
      config:
        command: git
        maxFiles: 100
        maxBranches: 100
```

补丁不覆盖 `web-app` 或 `api-remotes` 的现有行，也不需要修改 dsh 安装目录。安装方式沿用现有 profile 流程：

```sh
dsh plugin --profile web add /path/to/dsh-git-dashboard
dsh --profile web
```

### 3.2 Remote 挂载

Host 半边导出 `GitDashboardGateway extends TypertRemoteService`，服务名为 `gitDashboard`。Browser 半边注入现有 `remote`，在自己的生命周期中执行：

```ts
const dispose = await ctx.remote.$mount(gitDashboardRemote)
```

挂载失败应让插件行失败并记录诊断，不得使会话壳、布局或其他插件崩溃。插件 dispose 时调用返回的 disposer；生成产物由插件自己的构建脚本产生，仓内 Typert 聚合和 CI 生成门禁不在本交付范围。

## 4. Host Remote 设计

### 4.1 方法与返回数据

MVP 只提供三个方法：

```text
snapshot(workspaceId) -> GitSnapshot
branches(workspaceId) -> GitBranch[]
compare(workspaceId, baseRef) -> GitCompareSummary
```

所有方法只接受 `ctx.workspaceRegistry` 已登记的 `WorkspaceId`。客户端不能传任意 cwd；Host 从 Workspace 实体读取规范化目录。

`GitSnapshot` 的最小字段：

```text
kind: repository | not-repository | unavailable
repositoryName: string
scopePrefix: string
head: { oidShort: string, ref?: string }
upstream?: { ref: string, ahead: number, behind: number }
counts: {
  files: number
  staged: number
  unstaged: number
  untracked: number
  conflicts: number
  additions: number
  deletions: number
}
files: [{
  path: string
  status: added | modified | deleted | renamed | copied | unmerged | untracked
  staged: boolean
  binary: boolean
  additions: number | null
  deletions: number | null
}]
complete: boolean
observedAt: number
```

`GitBranch` 只包含 `ref`、显示名、短 OID 和 `local | remote` 类型。`GitCompareSummary` 包含 base/head ref、两个 OID、ahead/behind、同样的 counts/files 和 `complete`。它表示文件级 diff 摘要，不包含文件内容。

### 4.2 Git 采集

Host 使用 `ctx.subprocess`，每次请求都提供完整 argv、cwd、超时、取消信号和 stdout 上限，不经过 shell，不调用网络：

- 状态：`git status --porcelain=v2 --branch -z --untracked-files=all -- <literal scope>`。
- 行数：两次 `git diff --numstat -z`，分别读取 index 和 worktree 侧。
- 分支：`git for-each-ref` 读取本地和 remote-tracking refs。
- 比较：先将 `baseRef` 解析为固定 commit OID，再使用 `rev-list --left-right --count` 和 `diff --numstat --name-status -z` 产生摘要。

只解析 NUL 分隔的状态、路径、数字和 ref，不读取 unified diff。每个命令设置有限的超时和输出上限；超过上限时停止采集并返回 `complete: false`，禁止把部分结果当成精确总数。

### 4.3 路径与错误

状态结果中的路径必须是仓库相对 POSIX 路径。Host 拒绝 NUL、绝对路径、`..` 逃逸和 Git magic pathspec；比较 ref 必须解析为 commit。Workspace 不存在、目录不是 Git 工作树、Git 不可执行、超时和输出超限分别返回稳定错误码，浏览器只显示本地化文案，不透传 stderr 或绝对路径。

Workspace 位于父仓库内时，状态查询使用相对仓库根的 scope pathspec，避免把父仓库中其他 Workspace 的改动泄露到看板。

### 4.4 配置

可配置项仅保留部署相关的少量字段：`command`、`timeoutMs`、`maxStatusBytes`、`maxNumstatBytes`、`maxFiles`、`maxBranches`。配置在插件加载时校验；建议默认值为 `git`、2000ms、1 MiB、512 KiB、100、100。没有硬编码的仓库规模假设，插件也不建立跨请求缓存。

## 5. Browser 体验

### 5.1 入口

Browser 半边注册现有 `conversation.session.header.utilities` session-scoped list slot，使入口位于会话头部右侧且不抢占标题旁的上下文 action。没有当前 Workspace、Workspace 不是 Git 仓库或快照明确返回 `not-repository` 时，组件返回 `null`，不留下空白占位。

入口内容保持一行：分支图标、分支名或短 OID、`N 个文件`。干净工作区只显示分支，不显示无意义的零计数。长分支名省略，完整值放在可访问名称和 tooltip 中。

### 5.2 看板内容

打开后使用一个轻量浮层，不做多层卡片嵌套：

1. 顶部显示仓库名、scope、HEAD、upstream 和刷新时间。
2. 统计行显示 staged、unstaged、untracked、conflict、`+additions/-deletions`。
3. 文件列表默认显示最多 `maxFiles` 项，按冲突、未跟踪、已修改、已删除排序；超出上限显示“列表已截断”。
4. 分支比较是折叠区，先选择本地或 remote-tracking branch，再显示文件级 counts 和列表。
5. 操作只有刷新、展开/折叠、在文件夹中打开。打开文件夹复用现有 `host.openPath`，仅在 `connection.isLoopback` 且 Host 宣布 `canOpenPath` 时显示。

看板不显示完整 diff。用户需要逐行内容时从“在文件夹中打开”进入系统资源管理器、编辑器或 Git 客户端；这是本插件对“大文本解析和传输”的明确替代路径。

### 5.3 刷新与可访问性

刷新时机只有：首次打开、Workspace 或 Session 切换、用户点击刷新、Session 从 running 变为 idle、页面从 hidden 恢复可见。没有 watcher 和定时轮询。每次请求带 AbortController 和 generation，旧 Workspace 或旧比较结果不能覆盖新结果。

浮层支持 Escape 关闭、焦点回收、键盘操作、窄屏换行、深色主题和 reduced-motion。错误保留上一份快照但标记 stale；首次失败显示可重试状态。

## 6. 安全与限制

- 现有 Gateway 把此 Remote 视为 `trusted-host`，插件无法从外部追加 loopback-only endpoint。推荐仅绑定 `127.0.0.1`；不能把浏览器侧 `isLoopback` 检查当作 Host 安全控制。
- 不发送文件内容、patch、完整日志或任意路径；只发送受上限约束的 Git 元数据。
- Git argv 使用数组，固定关闭 pager、terminal prompt、外部 diff/textconv 和网络行为；继承环境仍交给 `ctx.subprocess` 的 scrub 逻辑。
- 不接受任意 cwd；WorkspaceId、path、ref 均在 Host 端重新解析和校验。
- 不写 Session 日志，所以看板数据不是模型可见输入，也不会影响回放或 SDK。

如果未来必须在浏览器内显示逐行 patch，需要先重新评估传输权限：纯扩展无法实现 endpoint loopback 硬限制，只能在明确接受 trusted-host 源码暴露后另做 opt-in，或等待 dsh 核心提供权限扩展点。这不属于本 MVP。

## 7. 实现与验证

### 阶段 A：插件骨架

1. 创建仓外包、`package.json`、`cordis.patch.yml`、Host entry 和 Browser `./client` entry。
2. 用仓库已发布/已安装的 Typert generator 生成本包的 `./remote`，把生成物随插件发布；不修改仓库生成配置。
3. 通过 profile 安装，验证 Host 行和 Browser roster 均被加载，且卸载能释放 Remote mount。

### 阶段 B：只读 Git 采集

1. 先实现状态、numstat、refs 的有界解析，再实现 branch compare summary。
2. 用临时 Git 仓库覆盖 clean、staged、unstaged、untracked、rename、conflict、detached HEAD、无 upstream 和嵌套 Workspace。
3. 验证非法 WorkspaceId/path/ref、Git 缺失、超时、取消、输出超限和插件 dispose 后没有孤儿进程。

### 阶段 C：Browser 看板

1. 实现 header utility、浮层、统计行、受限文件列表、分支比较和 openPath 操作。
2. 测试首次加载、Workspace 切换的 stale response、手动刷新、Session idle 刷新、空仓库/非仓库隐藏和失败重试。
3. 在本地 `dsh --profile web` 中做窄屏、键盘、深色主题和真实 Git 仓库手测。

仓外插件不进入 dsh 的 `test:coverage`、`verify-package-invariants`、`test:web`、`test:gui` 或 `doc-sync` 门禁，因此验收报告只能列出插件自己的 typecheck、lint、unit test、构建和手测结果，不能声称仓内 PR 门禁通过。

### MVP 验收标准

- Git Workspace 显示分支和变更摘要；非 Git Workspace 完全不显示入口。
- 看板只显示有界的文件级状态、行数和分支比较，不传输文件内容。
- Workspace 切换、取消和刷新不会出现旧数据覆盖新数据。
- 所有 Git 操作只读；非法路径/ref 被 Host 拒绝；超限结果带截断标记。
- “在文件夹中打开”只在既有 Host 能力允许且连接为 loopback 时出现。
- 插件可以通过 profile 安装/卸载，卸载后没有活跃请求、定时器或子进程。

## 8. 后续选项

可独立评估的后续项：浏览器内 patch（需要权限决策）、commit 历史卡片、文件级外部编辑器 reveal、可配置状态过滤和真实文件 watcher。它们都不应混入本 MVP，也不应要求修改 dsh 核心以外的隐式兼容层。
