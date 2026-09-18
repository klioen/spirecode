# Plan: Chat history 删除会话

From `docs/chat-history-delete/spec.md`。Status: approved，用户已确认。

## Files that change

- `docs/chat-history-delete/{intent,spec,plan}.md`：需求、设计、计划和验证记录。
- `electron/domains/chat/{types,piAdapter,chatService}.ts`：安全解析 session、busy/lifecycle 控制、移入系统废纸篓。
- `electron/domains/chat/{piAdapter,chatService}.test.ts`：目标归属、路径校验、busy、idle dispose、trash 成败和竞争回归。
- `electron/appState.ts`：将 Electron `shell.trashItem` 作为受控依赖注入 ChatService。
- `electron/contracts.ts`、`electron/ipc.ts`：增加 allowlisted `chat_session_delete` 及严格参数 schema/dispatch。
- `src/bindings/{generated,index}.ts`：暴露 typed delete command，并安全清理该 session 的 renderer subscription。
- `src/features/chat/{chatApi,hostChatApi,ChatHistory}.tsx?`：扩展 API，增加删除按钮、确认 Dialog、pending/error 与成功后本地移除。
- `src/features/chat/ChatHistory.test.tsx`：确认/取消、阻止误打开、pending、防重复、成功/失败、active 项删除测试。
- `src/features/editor/EditorPane.tsx`：成功删除后关闭对应 tab 并清理 Chat runtime。
- `src/features/editor/EditorPane.test.tsx`：打开/非打开/active idle 会话删除后的集成状态测试。
- `src/styles/index.css`：条目操作、危险态、确认 Dialog、忙碌与 focus 样式。

## Order of work

1. 提交用户确认后的 intent/spec/plan，形成审计基线。
2. 先补 Main 红测：不存在会话、错误 worktree、缺失/逃逸路径、streaming/busy 拒绝、idle session dispose 后 trash、trash 失败保留文件可重开、同 session attach/delete 竞争。
3. 先补 Renderer 红测：删除按钮不打开会话；取消无请求；确认参数正确；pending 防重复；成功移除条目并关闭匹配 tab/runtime；失败保留条目和 tab。
4. 运行针对性测试确认旧实现失败，并提交 red 测试基线；实现阶段不削弱测试。
5. 实现 adapter/ChatService 删除边界：目标只能来自当前 canonical cwd 的 SDK list；完成 stat/realpath/存储根验证；加入同 session 生命周期串行化或 deleting guard；注入 `trashItem`。
6. 贯通 command allowlist、IPC 参数 schema、bindings、ChatApi 和 host adapter；确保 detach/subscription cleanup 使用 identity compare，避免影响新订阅。
7. 实现 ChatHistory 行操作与确认 Dialog。只在 Main 返回成功后更新列表；失败显示错误并允许重试。
8. 在 EditorPane 成功回调关闭 `chatResourceId(worktreeId, sessionId)`，由 ChatView unmount detach，再清理 `chatRuntime.remove(sessionId)`；验证 active tab fallback 沿用 store 规则。
9. 完成样式和键盘/焦点行为，检查 hover、focus-within、窄面板、长标题以及 Dialog 的明暗主题。
10. 运行针对性测试、`pnpm check`、`pnpm build`；review diff 与安全边界，更新本计划 Execution results。

## Risks

- **最大风险：生命周期竞争。** attach/send 与 delete 同时发生可能造成已删文件仍在运行或新订阅被旧删除清理。以 Main 的 per-session deleting guard/queue 为唯一仲裁，并在 Renderer 保留 subscription identity compare。
- **数据风险：路径误删。** 绝不接受 Renderer path；目标必须来自 SDK 当次 list，canonical cwd 必须一致，realpath 必须是受信 pi session 根中的普通文件。
- **部分失败：dispose 成功、trash 失败。** 不关闭 Renderer tab；文件仍在，可由下一次 attach 重建。测试证明失败后 list/attach 可恢复。
- **UI 风险：按钮嵌套或点击冒泡。** 将打开按钮和删除按钮作为 sibling，不依赖 stopPropagation 修复非法 DOM。
- 不采用 `window.confirm`：视觉与键盘体验不一致。
- 不采用 pi TUI 的 unlink fallback：永久删除违背“移到废纸篓”承诺。
- 不做批量删除、撤销/恢复列表或 session 重命名，避免扩大范围。

## Proof

```bash
pnpm exec vitest run \
  electron/domains/chat/piAdapter.test.ts \
  electron/domains/chat/chatService.test.ts \
  src/features/chat/ChatHistory.test.tsx \
  src/features/editor/EditorPane.test.tsx
pnpm check
pnpm build
```

手工验收：

1. 非当前历史项 hover/focus 显示删除；取消后无变化，确认后从列表消失且可在系统废纸篓看到 JSONL。
2. 删除已打开 idle Chat：对应 tab 关闭，其他 tab 不受影响，History 保持可用。
3. 删除 streaming Chat：被拒绝，条目和 tab 保留，提示先停止任务。
4. 模拟 trash 失败：条目和 tab 保留，可重试并继续打开会话。
5. 搜索过滤、日期分组、outside click、Escape 与选择打开等原 History 行为不回归。

## Execution results

- Red：新增删除用例在旧实现下 5 项失败，明确缺少 Main `delete()` 和 History 删除入口；测试基线提交 `a494081`。
- Green：删除相关定向验证共 6 个测试文件、58 个测试全部通过，覆盖 adapter raw metadata、Main lifecycle/path/trash、IPC 参数、History 确认与 EditorPane tab 清理。
- `pnpm typecheck` 通过；`pnpm build` 通过（Renderer 与 Electron Main），仅保留既有 Monaco dynamic import 与 chunk size 警告。
- `pnpm check` 的 format、brand、lint、typecheck 及 274/275 测试通过；唯一失败为未改动的 `electron/domains/git/git.test.ts` porcelain parser 期望与 `origin/main` 当前实现不一致。本变更定向测试与所有构建通过。
- 未在真实打包应用中执行系统废纸篓手工验收；`shell.trashItem` 通过依赖注入和文件 fixture 自动化验证。
