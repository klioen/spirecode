# Plan: Chat 统一过程流与智能滚动（from `docs/chat-process-flow/spec.md` 2026-09-15）

## Files that change

- Add `docs/chat-process-flow/{intent,spec,plan}.md` — 已确认需求、设计和实施证明。
- Add `src/features/chat/chatDisplayItems.ts` and test — 将相邻 Thinking/Tool 投影为单步骤或多步骤 process segment。
- Add `src/features/chat/ProcessFlow.tsx` and test — 过程摘要、单步骤、semantic icon、运行 shimmer、失败状态与折叠层级。
- Modify `src/features/chat/ThinkingBlock.tsx` — 作为过程步骤渲染，支持 icon、引用线、紧凑展开内容。
- Modify `src/features/chat/ToolCard.tsx` — 显示原始 tool name、工具类型 icon、参数摘要，以及单卡片 input/output 双 Tab 详情。
- Replace/remove `src/features/chat/ToolGroup.tsx` as needed — 收敛到统一 ProcessFlow，保留兼容导出仅在必要时。
- Add `src/features/chat/useChatScrollController.ts` and test — 近底跟随、用户滚离、ResizeObserver、回到底部。
- Modify `src/features/chat/ChatView.tsx` and test — 使用过程投影、scroll controller 和回到底部按钮。
- Modify `src/features/chat/ChatComposer.tsx` and test — 普通会话几何与 running action 视觉层级。
- Modify `src/features/chat/ChatMessage.tsx` only if user bubble/streaming integration requires DOM hooks。
- Modify `src/features/chat/index.ts` — 导出新组件/工具。
- Modify `src/features/chat/chatLayout.test.ts` — 固定 960px thread、无边框过程流、引用线、hover disclosure、24px Composer。
- Modify `src/styles/index.css` — 过程流、shimmer、滚动按钮、Thread/Composer/User bubble 样式。

## Order of work

1. 为 process projection 写失败测试，固定邻接分段和单/多步骤规则。
2. 为 semantic icon、原始 tool name、运行 shimmer、折叠行为和 input/output 双 Tab 写失败组件测试。
3. 实现 ProcessFlow，并将 Tool 详情收敛为单卡片双 Tab。
4. 为 scroll controller 写 mock layout 测试，实现近底跟随和用户阅读保护。
5. 接入 ChatView，避免改变 runtime/reducer。
6. 调整 Thread、Composer、User bubble 和过程流样式，增加 CSS 护栏。
7. 运行 focused tests、`pnpm check`、`pnpm build`。
8. 用真实历史 session 运行态检查 process icon、折叠、滚动与计算样式。

## Risks

- 最高风险是滚动控制器抢夺用户阅读位置；必须用明确阈值和用户向上滚动状态门控。
- Process 分组若跨 message/notice 会破坏时间顺序；纯函数测试必须覆盖 flush 边界。
- Tool icon 映射必须有 unknown fallback，不能假设只有 pi 内置工具。
- CSS 调整不能重新引入 timeline flex shrink 回归。

## Alternatives deliberately rejected

- 不复制 VolcClaw 的虚拟列表：当前无性能证据，先迁移滚动状态机。
- 不引入 `@agentic-design/ui`、Arco 或 VolcClaw 私有组件。
- 不在 Main/reducer 中创建 process DTO：这只是展示投影。
- 不引入 avatar、消息 action bar、raw HTML/iframe/media。

## Proof

```bash
pnpm test -- src/features/chat
pnpm check
pnpm build
git diff --exit-code -- electron src/features/chat/chatApi.ts src/features/chat/hostChatApi.ts src/features/chat/chatRuntime.ts src/features/chat/sessionReducer.ts src/features/chat/types.ts
```
