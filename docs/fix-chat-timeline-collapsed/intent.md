# Intent: 修复长会话中 Thinking 与 Tool UI 被压扁
Author: user。 Status: accepted。

## Problem

新版 Chat 中 Thinking 和工具调用数据已经从 Main 正确传入 Renderer，DOM 也已生成，但长会话里 `.chat-thinking` 与 `.chat-tool-group` 的计算高度只有 2px，导致用户看起来像“没有渲染”。

根因是 `.chat-transcript` 使用纵向 Flex 且自身滚动，子项保留默认 `flex-shrink: 1`；当内容总高度超过 viewport 时，浏览器会压缩 timeline item，而折叠组件最终只剩边框高度。

## Proposed outcome

Chat timeline 的直接子项不参与纵向压缩，由 transcript 自身滚动承载溢出。Thinking、Tool group、消息和 notice 在长会话中保持正常内容高度。

## Affected users and systems

- 长 Chat session 的 SpireCode 用户。
- 仅 Renderer Chat 样式和对应测试。

## Constraints

- 不修改 Electron Main、IPC、Chat 数据归一化、runtime 或 reducer。
- 保持 Thinking 和工具组默认折叠。
- 保持 transcript 自身滚动。

## Open questions

无。
