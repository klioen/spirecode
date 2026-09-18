# Plan: Chat 失败状态恢复路径（from `docs/chat-failure-recovery/spec.md` 2026-09-18）

## Files that change

- `docs/chat-failure-recovery/{intent,spec,plan}.md`：本批 SDLC 产物。
- `src/features/chat/ChatView.tsx`：retry token 状态、错误横幅（错误码 + 指引 + Retry）。
- `src/features/chat/ChatView.test.tsx`：红灯测试——失败横幅 Retry 行为、auth 指引、恢复成功路径。
- `src/features/chat/ChatHistory.tsx`：错误状态 Retry 按钮。
- `src/features/chat/ChatHistory.test.tsx`：失败 → Retry → 恢复测试。
- `src/styles/index.css`：错误横幅与 Retry 按钮样式（复用现有 chat-notice/token）。

## Order of work

1. 先写 ChatView 失败测试（red）：attach 拒绝后出现含错误码的横幅和 Retry；点击 Retry 再次 attach 且成功后恢复。
2. 先写 ChatHistory 失败测试（red）。
3. 实现 ChatView retry token 与横幅。
4. 实现 ChatHistory Retry。
5. 补充样式；运行 targeted tests、`pnpm check`。
6. 三遍自审后提交。

## Risks

- Retry effect 依赖数组需要包含 retry token；遗漏会不触发重新 attach。
- attach effect cleanup 与 detach 的既有 StrictMode 语义不能被 Retry 破坏；沿用现有 effect 结构。
- 不采用在 failed 状态重新启用 Composer 的方案：向已知失败会话发送输入会掩盖错误分类。

## Proof

```bash
pnpm exec vitest run src/features/chat/ChatView.test.tsx src/features/chat/ChatHistory.test.tsx
pnpm check
```
