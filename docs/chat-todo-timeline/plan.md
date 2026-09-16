# Plan: Chat Todo 时间线卡片（from `docs/chat-todo-timeline/spec.md` 2026-09-15）

## Files that change

- Add `docs/chat-todo-timeline/{intent,spec,plan}.md` — 固化已确认需求、设计、安全边界与实施证明。
- Modify `electron/domains/chat/piAdapter.ts` and tests — 让 Main 的 session wrapper 暴露 active branch entries，保持 pi SDK 对象不跨边界。
- Modify `electron/domains/chat/wire.ts` and tests — allowlist/校验 `pi-todo-state`，转换实时 entry 与历史 branch timeline，继续丢弃其他 custom entries。
- Modify `electron/domains/chat/chatService.ts` and tests — attach 快照读取统一 timeline source，并保留现有 sequence fence、有界缓冲和 ownership 语义。
- Modify `electron/domains/chat/types.ts` — 增加 Main 内部安全 Todo DTO/event shape。
- Modify `src/features/chat/types.ts` — 增加 Renderer Todo timeline item 和 `todo_update` event。
- Modify `src/features/chat/sessionReducer.ts` and tests — 按 entry ID 幂等加入 Todo 快照。
- Add `src/features/chat/TodoListCard.tsx` and test — React/CSS Todo 卡片、计数、状态 marker、explanation 和可访问性。
- Modify `src/features/chat/ChatView.tsx` and test — 在 transcript 中渲染 Todo 卡片。
- Modify `src/features/chat/chatDisplayItems.ts` and tests — Todo 作为 process 分组边界并保持原始顺序。
- Modify `src/features/chat/index.ts` if public feature exports require it。
- Modify `src/styles/index.css` and relevant layout guard test — 使用现有 token 增加低噪声 Todo 卡片样式。

## Order of work

1. 为 wire normalization 写失败测试，固定 allowlist、字段裁剪、限制和未知 custom entry 隔离。
2. 为 active branch snapshot 写失败 adapter/service 测试，固定权威 message snapshot、Todo 历史顺序以及 attach fence 行为。
3. 扩展 Main DTO、PiSession wrapper 与 wire timeline normalization；保留 `session.messages` 的 compaction/custom-message 语义，仅从 branch 提取 allowlisted Todo，使实时和快照共用 Todo normalization。
4. 扩展 Renderer DTO 和 reducer，并以失败测试固定 Todo entry ID 的插入与幂等更新。
5. 为 TodoListCard 和 ChatView 写失败测试，再实现四状态、计数、explanation、ARIA 和 timeline 渲染。
6. 更新 display projection，使 Todo 明确切断相邻 Tool segment；补边界测试。
7. 添加仅使用现有 token 的样式与 CSS 护栏，不引入新依赖或消息 chrome。
8. 运行 focused Main/Renderer tests，再运行 `pnpm check`；修复发现的类型、格式、lint 或回归。
9. 检查最终 diff，确认没有 raw custom entry、pi SDK 对象、Node 能力或 transcript 数据进入 Zustand/Renderer 边界。

## Risks

- 最高风险是 raw branch message 绕过 pi 的 compaction/custom-message 恢复语义；保留 `session.messages` 为权威消息源，只从 branch 提取 Todo，并用兼容性测试固定既有投影。
- attach 读取期间可能同时收到 `entry_appended`；必须沿用快照 fence 与事件缓冲，不能在 adapter 中另建旁路订阅。
- 任意扩展都可写 custom entry；wire 必须采用严格 allowlist 和重建 DTO，禁止透传 `entry.data`。
- 每次 Todo 更新保留完整快照会增加 timeline item 数，但单卡最多 20 项且 runtime 已有 2,000 item 上限，第一版不另设折叠/压缩策略。

## Alternatives deliberately rejected

- 不复用 `pi-tui` renderer：其输出面向 ANSI terminal，不适合沙箱 Renderer。
- 不从 `todo_write` tool result 文本解析进度：会丢失结构、状态、解释和历史恢复能力。
- 不只监听实时 `entry_appended`：重新打开会话后会丢失 Todo。
- 不将 Todo 放入 Zustand、localStorage 或独立持久化：pi SessionManager JSONL 仍是唯一事实源。
- 不先做常驻 widget：transcript snapshot 与 pi TUI 当前语义一致，且历史和恢复边界更清晰。

## Proof

```bash
pnpm test -- electron/domains/chat/wire.test.ts electron/domains/chat/piAdapter.test.ts electron/domains/chat/chatService.test.ts
pnpm test -- src/features/chat/sessionReducer.test.ts src/features/chat/chatDisplayItems.test.ts src/features/chat/TodoListCard.test.tsx src/features/chat/ChatView.test.tsx
pnpm check
```

人工检查：启动开发应用，触发包含 pending/in_progress/completed/blocked 的 `todo_write`，确认卡片实时出现；关闭并从 Chat History 重开，确认历史卡片按原顺序恢复。
