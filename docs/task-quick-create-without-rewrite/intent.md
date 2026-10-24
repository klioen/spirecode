# Intent

明确区分全局任务模块的直接表单创建入口与编辑器工具栏中的对话式任务 intake：前者命名为“快速创建任务 / Quick Create Task”，后者继续使用现有 “New Task” 名称和澄清、确认、提交流程。

同时完整移除直接创建和编辑表单中的 Task Rewrite（AI 优化）能力及其跨 Renderer、preload bindings、Electron IPC、AppState 和 Main task domain 的不可达实现，避免产品继续暴露无效入口或维护独立的临时 Pi runtime。

现有直接表单字段、草稿、校验、workspace 选择、automation/queue 行为，以及任务执行 Agent、TaskRun、结果上报、普通 Chat 和对话式 Task Intake 均不改变。

## Risk

本次变更删除跨进程命令契约和独立 Main runtime，且涉及大范围删除，按高风险变更处理。任务 intake 已明确确认范围、基线和执行授权。
