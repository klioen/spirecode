# Intent: 参考 VolcClaw 重设计 Chat 前端
Author: user。 Status: draft。

## Problem

当前 SpireCode Chat 已具备输入、流式消息、Thinking、Tool card、队列和 Stop 的基本能力，但界面仍偏原型化：输入框层级弱、流式状态使用文字提示、Thinking 与 Tool 展示较重，整体消息流缺少成熟 Agent Chat 的视觉节奏。

用户希望参考 `~/Code/volcclaw-monorepo` 的 Chat UI 实现，改善输入框、流式输出、工具调用和 Thinking 等前端体验。

## Proposed outcome

在不改变 Electron Main、IPC、Chat API、事件协议和持久化逻辑的前提下，将现有 Chat Renderer 调整为更接近 VolcClaw ChatKit 的文档流式 Agent Chat：

- 更突出、可自动增长的圆角 Composer，发送与停止使用明确的图标化状态；
- user 使用轻量气泡，assistant 使用无卡片 Markdown 文档流，流式输出使用低干扰光标/状态动画；
- Thinking 显示为“深度思考”，默认折叠，展开后查看完整思考内容；
- 连续 Tool 调用聚合为默认折叠的“已执行 X 项操作”，展开后逐项查看工具名、入参和输出；
- 保持队列、错误、重连、空状态和键盘/IME 行为完整；
- 通过 Renderer 组件测试和完整 `pnpm check` 证明既有行为未回退。

## Affected users and systems

- 受影响用户：使用 SpireCode 中央 Chat Tab 的桌面端用户。
- 受影响系统：仅 `src/features/chat/` Renderer 组件、对应测试和 `src/styles/index.css` Chat 样式。

## Constraints

- 只改前端，不修改 `electron/`、preload、IPC channel、Chat API、Chat runtime/reducer 协议或持久化格式。
- 参考 VolcClaw 的交互与视觉组织，不直接引入其内部 `@agentic-design/ui`、`@chat-lab/*` 或 Arco 依赖。
- 继续使用项目现有 React、Remix Icon 和主题 token；Markdown 选择独立、固定版本的 Renderer 依赖，不引入 VolcClaw 私有包。
- 保留 Enter 发送、Shift+Enter 换行、IME 防误发、64 KiB 限制、running follow-up、Stop 恢复文本和 unknown tool fallback。
- 不在本次增加附件、富文本编辑器、模型选择、消息反馈、原始 HTML 渲染或后端能力。

## Open questions

无阻塞问题。采用 VolcClaw 的核心方向：宽 Markdown 文档流、浅色层级、默认折叠的“深度思考”、按连续区段聚合且默认折叠的“已执行 X 项操作”、底部悬浮圆角 Composer，并适配 SpireCode 现有深浅主题。
