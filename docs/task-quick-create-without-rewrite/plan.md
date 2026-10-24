# Plan

1. 盘点直接表单入口、Task Rewrite 从 Renderer 到 Main 的完整调用链、专属测试和文档描述。
2. 先调整/补充 Renderer 测试，覆盖快速创建中英文文案，并确保 Task Intake 的 `New Task` 文案保持不变。
3. 更新全局任务直接创建入口和新建表单标题的本地化文案，不改编辑态文案与表单行为。
4. 删除 `TaskRewriteControl`，并从 Tasks API、bindings、Electron contracts/IPC、AppState 和 Main task domain 逐层移除 rewrite 能力及专属测试、mock、样式和文案。
5. 更新任务模块文档，将 AI 优化说明标记为已移除或从当前规范中删除，同时保留对话式 Task Intake 说明。
6. 运行 TaskForm、TaskPage、EditorPane/TaskIntake、bindings、Electron contracts/IPC、AppState 相关聚焦测试。
7. 搜索确认无 `task_rewrite_start`、`task_rewrite_abort`、`TaskRewriteControl` 或当前能力文案残留，运行完整 `pnpm check`，最后审查 Git diff。
