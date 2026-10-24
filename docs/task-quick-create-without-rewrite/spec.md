# Spec

## User-visible behavior

- 全局任务页的直接创建按钮和新建表单标题：
  - 中文：`快速创建任务`
  - 英文：`Quick Create Task`
- 仅新建场景改名；已有任务的编辑标题、字段和行为保持不变。
- 快速创建继续打开现有直接表单并保留全部现有字段、默认值、草稿、校验、project/workspace 选择及 automation/queue 行为。
- 新建和编辑表单均不再显示 AI 优化、建议对比、Apply、Reject、Undo 或 Cancel 控件。
- 编辑器工具栏的对话式 `New Task`、`TaskIntakeView` 及其澄清、确认和提交流程保持原名称与行为。

## Removed capability

以下 Task Rewrite 能力整体删除：

- Renderer `TaskRewriteControl`、rewrite API/事件类型、mock、样式、本地化文案及专属测试。
- preload/host binding 中的 rewrite commands 和声明。
- Electron command allowlist、参数校验、IPC dispatch 及专属测试。
- AppState rewrite service 初始化、事件转发、abort/dispose 和错误映射。
- Main task domain 独立 rewrite/Pi runtime 及专属测试。
- 仅为 rewrite 存在的生命周期代码。

代码不得继续暴露 `task_rewrite_start`、`task_rewrite_abort` 或 `TaskRewriteControl`。历史设计文档若保留背景，必须明确该能力已移除，不得描述为当前能力。

## Non-goals

- 不修改任务执行 Agent、TaskRun、任务结果上报或人工审查语义。
- 不修改普通 Chat。
- 不修改对话式 Task Intake 的安全、确认或提交流程。
- 不引入自动合并、发布或新的对话创建流程。
