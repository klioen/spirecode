# Plan: Project/Worktree 可搜索，Branch 仅展示（from `docs/breadcrumb-context-switcher/spec.md` 2026-09-19）

## Files that change

- `docs/breadcrumb-context-switcher/{intent,spec,plan}.md`：同步需求调整，记录 Branch 从切换器降为只读展示。
- `src/features/workbench/BreadcrumbSwitcher.tsx`：删除 branch menu/catalog/switch 流程，只保留 Project/Worktree 下拉和只读 branch 文本。
- `src/features/workbench/BreadcrumbSwitcher.test.tsx`：删除 branch 下拉测试，增加 Branch 非 button、无 listbox 能力的断言，保留 Project/Worktree 搜索与可访问性交互测试。
- `src/features/workbench/Workbench.tsx`、`Workbench.test.tsx`：移除 branch switch refresh callback 集成，继续传入 live branch 展示值。
- `src/styles/index.css`：将 branch 样式从 trigger 拆为只读展示，删除 branch popover/loading/pending 的专用样式。
- `src/i18n/{en,zh-CN}.ts`：删除不再使用的 branch 搜索、列表、加载、占用和切换文案。
- `electron/contracts.ts`、`electron/ipc.ts`：删除 local branch list/switch command 和路由。
- `electron/domains/git/{types,service,git.test}.ts`：删除本地分支枚举、占用检测及真实切换实现和测试。
- `electron/appState.ts`：删除 branch switch 与 catalog 同步编排。
- `src/bindings/{generated,index}.ts`、`src/features/projects/projectsApi.ts`：删除 local branch DTO、typed commands 和 feature API。

## Order of work

1. 先调整 BreadcrumbSwitcher 测试，断言 Branch 为只读文本且 Project/Worktree 下拉继续工作；运行确认旧实现失败（red）。
2. 精简 BreadcrumbSwitcher 的 level/options/state，只保留 Project 和 Worktree；移除 branch 请求、竞态控制、错误恢复和 refresh callback。
3. 更新 Workbench 集成、样式和中英文文案。
4. 删除完整 branch IPC/binding/GitService/AppState 能力及对应后端测试，避免无入口写能力残留。
5. 全仓搜索 `LocalBranch`、`git_list_local_branches`、`git_switch_local_branch`、`switchLocalBranch`，确认零残留。
6. 运行针对性测试和完整 `pnpm check`。

## Risks

- 删除 branch 逻辑时可能误伤 Project/Worktree 的共享键盘、pending 或 outside-click 行为；通过保留对应回归测试约束。
- Branch 从 button 改回文本后可能失去原有紧凑布局；保留独立 `.breadcrumb-branch` 样式和 `flex-shrink` 行为。
- 只隐藏 UI 而保留 IPC 会留下不必要的 Git 写能力，因此必须同时清理 Main、preload bindings、feature API 和测试。
- 不保留“未来可能使用”的 branch catalog 接口；当前产品语义明确为只读展示，最小权限优先。

## Proof

```bash
pnpm exec vitest run src/features/workbench/BreadcrumbSwitcher.test.tsx src/features/workbench/Workbench.test.tsx
rg -n "LocalBranch|git_list_local_branches|git_switch_local_branch|switchLocalBranch|listLocalBranches" electron src
pnpm check
```

验收标准：Project/Worktree 可点击并搜索；Branch 仅展示当前值，不可聚焦为按钮、无下拉框；branch list/switch IPC 和实现完全删除；完整检查退出码为 0。
