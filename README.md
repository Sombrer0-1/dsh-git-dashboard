# dsh-git-dashboard

DeepSeek Harness（`dsh`）的**仓外**只读 Git 工作区看板插件。安装到 web profile 后，在会话头部右侧显示分支与变更摘要；可展开查看文件列表、分支比较，并对小改动做 unified diff 预览。

不修改 deepseek-harness 源码；通过 `dsh.bundle.patch` + `dsh.profile.bundles` 加载。

## 功能

- 会话头部入口：当前分支 / detached HEAD、脏文件数
- 看板：已暂存 / 未暂存 / 未跟踪 / 冲突计数，文件级 `+N/−M`（相对 HEAD；未跟踪按全新增并入汇总）
- 同一文件可同时标记「已暂存」与「未暂存」（索引相对 HEAD 有改、工作区相对索引又有改）
- 点击文件：相对 HEAD 的小 diff 预览（含未跟踪的全新增预览）；过大 / 二进制 / 冲突则说明原因
- 分支比较：选择基准分支，查看 ahead/behind 与文件摘要
- 仅 loopback 且 Host 允许时：「在文件夹中打开」

默认上限：变更合计 ≤ **500** 行，单文件 diff stdout ≤ **256 KiB**（可在配置中改）。

## 要求

- Node `^22.19 || >=24`（与 dsh 一致；Windows 上常用 `nvm use 24.15.0`）
- 已安装并可运行的 `dsh`（例如 `@deepseek-ai/dsh`）
- 本机 `git` 可执行
- web profile：`$DSH_HOME/profiles/web`（未设 `DSH_HOME` 时一般为 `~/.dsh/profiles/web`）

## 安装

以下以 Windows + profile `web` 为例。先确保能跑通：

```bat
nvm use 24.15.0
dsh --version
```

### 1. 装进 web profile

```bat
nvm use 24.15.0
cd %USERPROFILE%\.dsh\profiles\web
corepack pnpm add git+ssh://git@github.com:Sombrer0-1/dsh-git-dashboard.git
```

HTTPS：

```bat
corepack pnpm add github:Sombrer0-1/dsh-git-dashboard
```

固定某一 commit / tag（推荐生产使用）：

```bat
corepack pnpm add git+ssh://git@github.com:Sombrer0-1/dsh-git-dashboard.git#v0.1.0
```

### 2. 写入 profile bundles

编辑 `%USERPROFILE%\.dsh\profiles\web\package.json`，确认 `dsh.profile.bundles` **包含** `dsh-git-dashboard`，且排在 `@deepseek-ai/dsh-base`（以及你已有的 web / 其它 bundle）**之后**，例如：

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-git-dashboard"
      ]
    }
  }
}
```

### 3. 链接 Host 运行时依赖（重要）

`pnpm` / `link:` 安装后，Node 往往从**插件真实路径**解析依赖，走不到 `$DSH_HOME/profiles/node_modules`。在**本包安装目录**执行一次：

```bat
nvm use 24.15.0
cd %USERPROFILE%\.dsh\profiles\web\node_modules\dsh-git-dashboard
node scripts\link-runtime-deps.mjs
```

脚本会把 `cordis`、`dsh-typert-protocol`、`dsh-subprocess`、`dsh-timeout`、`dsh-workspace`、`schemastery`、`zod` 等 junction 到本地 `node_modules/`，指向 dsh 维护的 `profiles/node_modules`。

若报 `Cannot find package '@deepseek-ai/dsh-typert-protocol'`，几乎总是漏了这一步；先跑过一次任意 `dsh web`（让 dsh heal profiles/node_modules），再重跑脚本。

### 4. 验证并重启

```bat
nvm use 24.15.0
dsh --profile web --dump-config
```

应出现 `# == dsh-git-dashboard`。然后**重启** `dsh web`，浏览器强刷。

### 卸载

从 `dsh.profile.bundles` 去掉包名，再在 profile 目录：

```bat
corepack pnpm remove dsh-git-dashboard
```

卸载不会自动清理你曾写入的其它 settings。

## 配置

`cordis.patch.yml` 默认值（可在 profile 覆盖同名插件 `config`）：

| 字段 | 默认 | 含义 |
|---|---|---|
| `command` | `git` | Git 可执行文件 |
| `timeoutMs` | `2000` | 单次 git 命令超时 |
| `maxStatusBytes` | `1048576` | `git status` stdout 上限 |
| `maxNumstatBytes` | `524288` | numstat stdout 上限 |
| `maxFiles` | `100` | 列表最多文件数 |
| `maxBranches` | `100` | 分支列表上限 |
| `maxDiffBytes` | `262144` | 单文件 diff 预览字节上限 |
| `maxDiffChangedLines` | `500` | 单文件预览变更行（增+删）上限 |

## 安全说明

- Remote 走 Gateway 现有 **`trusted-host`**，不另做 loopback-only。
- 会向已授权客户端暴露仓库名、分支名、路径、行数统计；小 diff 预览会传输该文件的 unified diff 文本（受上述上限约束）。
- 推荐本机 loopback 使用；若 LAN trusted host 可连，请自行评估元数据与小 diff 暴露。

## 仓库内容

| 路径 | 说明 |
|---|---|
| `src/` | Host + Client 源码 |
| `lib/` | **已构建产物**（profile 加载的是这里，不是 `src/`） |
| `cordis.patch.yml` | 插入 `git-dashboard` 插件行 |
| `scripts/link-runtime-deps.mjs` | 安装后链接 Host peers |
| `scripts/build-client.mjs` | Client ModuleLoader 打包（开发用） |
| `tests/` | vitest |
| `docs/sdd.zh.md` | 设计草案（部分 MVP 边界已被后续实现放宽，以本 README 为准） |

本仓库自带 `lib/`，**安装方无需在 monorepo 里构建**即可使用。

## 本地开发（可选）

若要改源码并重建：对照 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 源码，在 harness 旁开发更方便（TypeScript 工程与 vitest 别名依赖 monorepo）。独立仓库侧请以已提交的 `lib/` 为准对外发布；改完后在 harness 环境构建，再把新的 `lib/` 同步进本仓库提交。

## License

MIT
