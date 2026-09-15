# Plan: 修复 Chat timeline Flex 收缩（from `docs/fix-chat-timeline-collapsed/spec.md` 2026-09-15）

## Files that change

- Add `docs/fix-chat-timeline-collapsed/{intent,spec,plan}.md` — 事故证据、修复边界与验证计划。
- Add `src/features/chat/chatLayout.test.ts` — 静态样式护栏，要求 transcript 直接子项不收缩并保持滚动。
- Modify `src/styles/index.css` — timeline 直接子项 `flex-shrink: 0`，Thinking/Tool group 保持正常 header 高度。

## Order of work

1. 添加会在当前 CSS 下失败的回归测试。
2. 修改 Chat 局部 CSS，不触碰事件和数据层。
3. 运行 focused test、`pnpm check`、生产打包。
4. 替换 `/Applications/SpireCode.app`，打开真实长会话并读取计算高度验证。

## Risks

- 禁止收缩会增加 transcript 的 scrollHeight；这是预期行为，容器已有 `overflow-y: auto`。
- 选择器只作用于 `.chat-transcript` 直接子项，避免影响 Tool 内部布局。

## Proof

```bash
pnpm test -- src/features/chat/chatLayout.test.ts
pnpm check
pnpm bundle
```

运行态验证：真实会话中 `.chat-thinking` 和 `.chat-tool-group` 的计算高度至少覆盖 38px header，而不是 2px。
