# Spec: Project Managed Worktrees
Status: accepted。 Implements: `docs/project-worktrees/intent.md`。

## Domain model

### Project

现有 `ProjectSummary` 保持 repository-level identity，新增主 checkout 信息和 children：

```ts
interface ProjectSummary {
  id: string;
  name: string;
  path: string;              // main checkout root
  lastOpenedAt: number;
  worktrees: WorktreeSummary[];
}

interface WorktreeSummary {
  id: string;
  projectId: string;
  name: string;
  path: string;
  branch: string;
  baseRef: string;
  kind: "main" | "managed";
  lastOpenedAt: number;
}
```

主 checkout 也作为一个 `WorktreeSummary(kind:"main")` 暴露，ID 为现有 V1 Project ID，以保持现有 resource/cache identity。Repository-level Project 获得新的稳定 UUID，只在 catalog 和 rail 分组使用。

## Persistence migration

`state.json` 从 version 1 升级到 version 2：

```text
CatalogV1.projects[].id -> V2 main Worktree.id
CatalogV1.activeProjectId -> V2 activeWorktreeId
V2 Project.id -> 新 UUID
```

迁移时通过 canonical `git-common-dir` 将同仓库 checkout 分组。迁移必须显式执行；合法 V1 文件不得被备份为 corrupt。

V2 原子写继续使用现有 temp + fsync + rename。

## Checkout scope

Rust 和 TypeScript 的资源 command 在本次迁移后使用 `worktreeId`：

```text
fs_read_dir
fs_read_file
git_status
git_diff_file
terminal_create
terminal_list
```

短期 wire 参数名允许保持 `projectId` 以减少 Tauri serde 变更，但内部 DTO、函数和前端 store 变量必须改为 worktree identity；最终 bindings 暴露 `worktreeId`。

Editor/file/diff/terminal IDs 均包含 worktreeId，防止不同 checkout 的同路径资源碰撞。

## Git branch discovery

新增：

```text
git_list_origin_branches(projectId)
  -> { branches: [{ ref, name }], defaultRef: string | null }
```

后端执行：

```text
git for-each-ref --format=<...> refs/remotes/origin
```

过滤 symbolic ref `origin/HEAD`，返回完整 `origin/foo` identity 和展示名 `foo`。默认优先 `refs/remotes/origin/HEAD` target，否则 `origin/main`，否则列表第一项。

## Worktree creation

新增 command：

```text
worktree_create({ projectId, name, baseRef }) -> WorktreeSummary
```

### Validation

- `name` trim 后 1–48 字符。
- 允许 ASCII 字母、数字、`-`、`_`；首尾必须为字母或数字。
- 拒绝 `.`、`..`、控制字符、路径分隔符、以 `-` 开头。
- `baseRef` 必须精确存在于本次后端 origin branch catalog；再验证 full ref 为 `refs/remotes/origin/*`。
- branch、managed path 和 catalog name 三者都必须唯一。

### Default name

每个 Project 独立计算最小未用的单调占位：

```text
worktree1, worktree2, worktree3...
```

编号同时避开：

- catalog 中已有 worktree name；
- `refs/heads/<name>`；
- managed worktree 目录。

删除后不承诺复用；catalog 增加 `nextWorktreeSequence`，成功创建后递增。

### Path

Rust 在用户目录生成：

```text
~/.pi/worktrees/<project-name>/<name>
```

`project-name` 使用现有 Project display name，但必须经过与 worktree name 相同的安全 path-segment 校验。Project managed root 包含 `.pi-worktree-owner.json`，记录 repository Project ID 和 canonical git-common-dir。创建、rename、delete 前都验证 marker；若同名 Project 指向不同 repository，则拒绝并提示目录冲突，不自动复用或删除。

创建命令：

```text
git -C <project-root> worktree add
  <managed-path>
  -b <name>
  --no-track
  --end-of-options
  refs/remotes/origin/<branch>
```

### Concurrency and rollback

- 每个 Project 使用 repository mutation mutex，串行 create。
- 锁内重新计算 default/uniqueness。
- `git worktree add` 成功但 catalog save/watcher setup 失败时：
  - `git worktree remove --force <path>`
  - 删除刚创建 local branch
  - 返回结构化错误。
- 只有 catalog 持久化成功后才返回 WorktreeSummary。

## Worktree rename

新增：

```text
worktree_rename({ worktreeId, name }) -> WorktreeSummary
```

仅允许 `kind:"managed"`。name 使用创建时相同 validation/uniqueness。

操作顺序：

1. 获取 repository mutation mutex。
2. 重新读取 worktree 和 project，验证 ownership marker。
3. 拒绝存在运行中 Terminal 的 worktree。
4. 验证目标 branch/path/name 均未占用。
5. 在 worktree cwd 执行 `git branch -m <new-name>`。
6. 在 main project root 执行 `git worktree move <old-path> <new-path>`。
7. 更新 catalog 的 name/path/branch 并原子保存。
8. 重启该 worktree watcher，更新前端完整 snapshot。

失败补偿：

- branch rename 成功、worktree move 失败：执行 `git branch -m <old-name>`。
- Git 两步成功、catalog save 失败：尝试 `git worktree move <new> <old>` 和 branch rename rollback；若补偿失败，返回含 recovery details 的错误，绝不静默继续。

Worktree ID 保持不变，因此 editor/file/diff/terminal resource identity 不变化；因运行 Terminal 已被拒绝，不存在 cwd 移动后的活跃 shell。

## Worktree delete

新增：

```text
worktree_delete({ worktreeId, force }) -> { ok: true }
worktree_inspect_delete(worktreeId) -> {
  dirty: boolean;
  terminalCount: number;
  branch: string;
}
```

仅允许 `kind:"managed"`，main 永远拒绝。

默认 `force:false` 时：

- 通过 porcelain status 检查 staged、unstaged、untracked 三类未 commit 改动；任一存在即拒绝并返回 `WORKTREE_DIRTY`，且不得执行 `git worktree remove`；
- running Terminal 拒绝并返回 `WORKTREE_BUSY`。

UI 先 inspect：若 dirty 或 terminalCount > 0，显示破坏性确认，明确说明会终止 Terminal 并丢弃未提交修改。确认后调用 `force:true`。

删除顺序：

1. repository mutation mutex + ownership marker validation。
2. `force:true` 时关闭该 worktree 的所有 Terminal。
3. stop watcher、clear Git lock/cache。
4. clean + `force:false` 执行 `git worktree remove <path>`；只有用户确认后的 `force:true` 才执行 `git worktree remove --force <path>`。
5. 从 catalog 删除 record，原子保存。
6. 保留 local branch，不执行 `git branch -D`。
7. 清理空的 project managed root（marker 除外时可保留）。

若 Git remove 失败，catalog 不变，并恢复 watcher。若 Git remove 成功但 catalog save 失败，保留 recovery error；启动 reconciliation 通过 `git worktree list --porcelain` 识别 missing managed record，允许用户重试 cleanup。

删除 active worktree 后，选择同 Project 的 main worktree；前端清理该 worktree 的 file tree、changes、editor tabs 和 terminal stream state。

## Watcher and Git metadata

每个 checkout 使用独立 watcher ID/root。Managed linked worktree 的 `.git` 是文件，因此 watcher 同时监听：

- worktree root；
- `git rev-parse --path-format=absolute --git-dir` 返回的 worktree-specific git dir。

Worktree root 事件触发 file + git invalidation；git-dir metadata 事件仅触发 git invalidation。

## Tauri contracts

新增 commands：

```text
project_catalog
worktree_create
worktree_select
worktree_list
worktree_reveal
worktree_rename
worktree_inspect_delete
worktree_delete
git_list_origin_branches
```

为兼容现有前端，`project_list` 可暂时返回嵌套 ProjectSummary；新增 Project 打开后创建 main worktree record 并激活它。

## Frontend navigation

ProjectRail：

```text
Project Name                  +
  main branch
  worktree1
  worktree2
```

- Project name 行不再直接代表 active checkout。
- 点击子 worktree 选择 checkout。
- `+` 始终在 Project 行右侧，accessible name `Create worktree for <project>`。
- 创建中按钮 disabled，并在项目下显示 `Creating worktree…`。
- Managed worktree row 提供 context menu：Rename、Delete。
- Main worktree 不显示 Rename/Delete。

## New Worktree dialog

字段：

- Base branch：select，列出 origin branch name。
- Worktree name：text input，打开 dialog 时填入后端返回的 `nextName`。

交互：

- 打开时加载 branch catalog 与 nextName。
- Create 按钮在 loading、空 branch、name validation error、creating 时 disabled。
- 创建失败保留 dialog 和输入并显示错误。
- 成功后更新 catalog、展开 Project、选中新 worktree、关闭 dialog。
- Escape/Cancel 不创建任何资源。

## Workbench

Workbench 从 `activeWorktreeId` 解析 active Project + Worktree：

```text
Topbar: Project / Worktree · branch
EditorPane(worktreeId)
FileTree(worktreeId)
ChangesPanel(worktreeId)
Terminal cwd = selected worktree.path
```

Project 切换仍保留每个 worktree 独立 tabs/terminal state。

## Rename dialog

- 打开时预填当前 name。
- 前端执行同一基础格式校验，后端始终重复权威校验。
- 成功后原位更新 row，保持 active selection 和 Worktree ID。
- 失败保留 dialog/input 并显示错误。

## Delete confirmation

- 首次点击 Delete 调用 inspect。
- clean 且无 Terminal：普通确认。
- dirty 或 busy：破坏性确认，列出 dirty/busy 状态。
- 成功后切回 main worktree；失败保持当前 selection。

## Out of scope

- attach external worktree。
- fetch/prefetch remote branch。
- remote 列表不含 origin 之外的 remote。
- detached worktree。

## Proof

- V1→V2 migration 不丢 Project ID/resource identity。
- origin branch parser 过滤 symbolic HEAD。
- name validation/sequence/create concurrency/rollback。
- rename branch + path 成功和各阶段补偿。
- delete clean/dirty/busy/force/main-refusal/branch-preservation。
- 两个 worktree 同相对路径的 file/diff/editor cache 完全隔离。
- Terminal cwd 指向 selected worktree。
- ProjectRail dialog、loading/error/success 流程。
- `pnpm check`、`pnpm bundle`、真实临时 Git remote + worktree 集成测试。
