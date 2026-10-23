# Intent

让左侧栏的 Tasks 与 Projects 成为稳定、互斥的主工作区入口，避免重复点击 Tasks 意外返回编辑器。

风险判定：标准变更；它改变用户可见的跨组件导航行为，但不涉及跨进程接口、持久化或安全边界。

# Spec

- 点击 Tasks 后，主面板始终显示 Tasks 页面；重复点击 Tasks 不关闭该页面。
- 点击 Projects 标题、任一项目或 worktree 后，主面板返回项目工作区。
- 点击项目下的 session 后，主面板返回项目工作区并打开对应 session。
- Tasks 的选中态与主面板显示保持一致。

# Plan

1. 添加 Workbench 回归测试，覆盖 Tasks 重复点击以及 Projects 导航退出 Tasks。
2. 将 Tasks 导航从 toggle 改为幂等打开，并把 Projects 导航意图从 ProjectRail 传给 Workbench。
3. 在 ProjectRail 的 Projects 标题、项目与 worktree 点击路径触发该导航意图，同时保留 session 的现有行为。
4. 运行聚焦测试、类型检查与项目完整检查。
