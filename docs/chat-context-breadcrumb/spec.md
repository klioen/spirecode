# Spec: Chat 上下文三级面包屑

## Requirements

1. 有活动 Worktree 时，顶栏按 Project、Worktree、Branch 的固定顺序显示三个层级。
2. 层级之间使用明确的视觉分隔符，语义结果为 `project > worktree > branch`。
3. Branch 必须来自当前 Worktree 的实时 `git status`，而不是只使用创建或打开项目时持久化的 catalog branch；detached HEAD 或状态暂不可用时才回退 catalog 值。
4. Workbench 在活动 Worktree 切换时主动刷新 Git 状态，不要求用户先打开 Changes 面板；后续 `git://changed` 刷新也应同步更新面包屑。
5. Branch 不再使用前置圆点拼接到 Worktree；它是独立且不可被 flex 布局压缩隐藏的第三级。
6. 面包屑需提供可访问名称，以便测试和辅助技术确认完整上下文。
7. 无活动 Worktree 时保持现有空状态。

## Design

- `Workbench` 从 `useProjectsStore` 解析 `{ project, worktree }`，并订阅 `useChangesStore.byWorktree[worktree.id].snapshot.branch`。
- 活动 Worktree 变化时调用现有 `refreshChanges(worktreeId)`；Git watcher 继续通过同一 store 更新后续分支变化。
- 展示值优先使用非空的实时 snapshot branch，否则回退 `worktree.branch`。
- 使用纯展示分隔符，并通过 `aria-hidden` 避免辅助技术重复朗读。
- 保留 Branch 的等宽强调样式，移除作为文本内容的 `·`，并禁止 Branch flex 收缩。
- 不改变 DTO、IPC 或 Main 进程。

## Acceptance

- 测试能够通过面包屑导航的可访问名称找到该区域。
- 测试确认 Project、Worktree、实时 Branch 均显示，且 DOM 顺序正确。
- 测试确认 Workbench 主动刷新活动 Worktree，并在 snapshot branch 与 catalog branch 不同时显示 snapshot branch。
- 现有 Workbench 测试和项目完整检查通过。

## Concerns

无策略冲突。主要风险是顶栏窄宽度下内容拥挤；本次保持紧凑字号并允许面包屑容器收缩，不改变中央命令框布局。
