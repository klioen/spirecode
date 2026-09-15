# Spec: 修复 Chat timeline Flex 收缩
Status: accepted。 Implements: `docs/fix-chat-timeline-collapsed/intent.md`。

## Scope

- 为 `.chat-transcript` 的直接 timeline 子项设置 `flex-shrink: 0`。
- 为 Thinking 和 Tool group 明确设置最小高度，防止折叠 header 被压成边框。
- 添加样式回归测试，确保滚动容器和不收缩规则同时存在。

## Excluded

- Main、IPC、wire normalization、runtime、reducer 和模型调用。
- Thinking/Tool 的内容或分组规则调整。

## Acceptance

- 长历史会话中 `.chat-thinking` 和 `.chat-tool-group` 的 header 可见。
- transcript 继续纵向滚动。
- `pnpm check` 与 `pnpm bundle` 通过。
