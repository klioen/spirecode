# Intent

移除项目侧栏中隐蔽且与单击选择叠加的 Worktree 名称双击显示目录交互，同时保留明确的 Project 管理菜单显示入口。

风险判定：标准变更；它改变局部用户可见交互和中英文提示，但不修改 IPC/API、文件系统边界或持久化格式。

# Spec

- 双击项目侧栏中的 Worktree 名称不得调用 `projectsApi.revealWorktree`。
- 单击 Worktree 仍选择对应工作区并打开 Projects 工作区。
- Worktree 悬浮提示继续显示路径和分支，但英文和中文均不包含双击显示说明。
- Project「…」管理菜单中的 Reveal in Finder / 在访达中显示功能及错误处理保持不变。
- 底层 worktree reveal IPC/API 和文件树相关操作不在本次变更范围内。

# Plan

1. 添加 ProjectRail 回归测试，覆盖单击选择与导航、双击不 reveal，以及中英文 tooltip 文案。
2. 移除 Worktree 名称按钮的双击 handler 及仅供该入口使用的组件内 reveal 包装函数。
3. 更新中英文 Worktree tooltip 文案，仅保留路径和分支。
4. 运行 ProjectRail 与国际化聚焦测试，并运行 `pnpm check`。
