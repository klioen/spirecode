# Spec: 可搜索的 Project/Worktree 面包屑切换器
Status: accepted。 Implements: `docs/breadcrumb-context-switcher/intent.md`。

## Interaction model

顶部保持 `Project > Worktree > local branch` 三层视觉结构：

- Project 和 Worktree 名称是 button，点击打开该层 popover，并关闭另一层。
- Local branch 是只读文本状态，不是 button，不暴露 `aria-haspopup`，不能打开 popover。
- 两个 popover 顶部为自动聚焦搜索框，下方为候选 listbox。
- 搜索按可见名称进行 trim 后的大小写不敏感子串匹配；空查询展示全部候选。
- 当前项使用 `aria-selected` 和视觉 selected state；无结果时显示本地化 empty state。
- ArrowDown/ArrowUp 移动 active option，Enter 选择，Escape 关闭并把焦点还给触发按钮。
- pointerdown 发生在整个 switcher 外部时关闭；内部交互不得被误判为 outside click。
- 交互区域受 topbar `no-drag` 约束，不能被 Electron window drag region 吞掉点击。

## Project selection

Project 候选来自现有 `useProjectsStore.projects`，按 catalog 当前顺序展示并按 project name 搜索。

选择不同 Project 时：

1. 选取该 Project 的 `kind === "main"` worktree；若不存在，选第一个 worktree。
2. 调用现有 `worktree_select` 持久化 active worktree 和 last-opened metadata。
3. Main 成功后更新 Renderer store，并关闭 popover。
4. Project 没有 worktree 时禁用该选项并标记 unavailable。

当前 Project 被选择时只关闭 popover，不产生重复 IPC。

## Worktree selection

Worktree 候选仅来自当前 Project 的 `worktrees`，按可见 worktree name 搜索；辅助信息展示 branch name，以便区分上下文。

选择时复用现有 `worktree_select`。成功后更新 `activeWorktreeId`；失败时保持当前选择，并通过现有 Projects store error/toast 展示错误。

## Local branch display

- Local branch 只展示当前 worktree 的 branch，不提供候选、搜索或切换动作。
- 显示值继续使用 `liveBranch ?? active.worktree.branch`：Git status 已返回时以真实 HEAD 为准，否则使用 catalog 快照。
- Branch 保留紧凑等宽胶囊样式和长名称的布局保护，但使用非交互元素。
- 删除本变更曾新增的 `LocalBranch`/`LocalBranchCatalog` DTO、`git_list_local_branches`、`git_switch_local_branch`、GitService 枚举/切换实现及 Renderer API，避免保留无 UI 入口的仓库写能力。

## State and failure behavior

- popover、query、active option 和 pending 状态属于组件本地 view state，不写 Zustand。
- Project/worktree catalog 和 active worktree 继续由 `useProjectsStore` 管理。
- 选择期间防止重复操作；失败时 popover保持打开并显示现有 toast。
- active worktree 因 Project Rail 等外部入口改变时，关闭旧 popover，避免旧上下文操作。

## Accessibility and localization

- Project/Worktree trigger 是有可读名称的 button，并暴露 `aria-haspopup="listbox"`、`aria-expanded`、`aria-controls`。
- 搜索框使用 combobox/listbox 语义，选项使用 option 语义。
- Branch 是普通只读文本；实际名称保持原样，不翻译。
- 保留 Project、Worktree、Search、No matches、Unavailable 等中英文语义文案；删除 branch 搜索、加载、占用和切换文案。

## Out of scope

- 任何 local/remote branch 的枚举、搜索、切换、创建、删除、重命名或 fetch。
- 在 Project 下拉中新增/关闭 Project，或在 Worktree 下拉中新建/重命名/删除 worktree。
- 更改 Project rail 的展开状态和交互。

## Proof

- Renderer 测试覆盖两层触发、搜索过滤、Project main/fallback、Worktree 选择、错误保留、键盘操作、Escape、outside click，以及 Branch 不可交互。
- 回归测试确认没有 branch list/switch command、binding 或 feature API 残留。
- `pnpm check` 全量通过。
