# Plan: 精简 Chat 空状态与输入提示（from docs/chat-copy-cleanup/spec.md 2026-09-16）

## Files that change
- `src/features/chat/ChatView.tsx`：删除空会话提示和无用的 `emptyLabel` 属性。
- `src/features/chat/ChatComposer.tsx`：统一输入占位为“随心输入”，删除快捷键提示。
- `src/features/chat/ChatView.test.tsx`：断言空会话不展示旧提示。
- `src/features/chat/ChatComposer.test.tsx`：断言新占位、旧提示缺失，并保留键盘行为覆盖。

## Order of work
1. 添加文案验收断言并运行定向测试确认失败。
2. 修改 ChatView 与 ChatComposer。
3. 运行 Chat 定向测试、类型检查和格式检查。

## Risks
- 删除空状态节点可能影响依赖其存在的布局；Chat transcript 本身仍保留。
- 最危险的是误删键盘逻辑；仅删除提示节点，不改 `onKeyDown`。
- 不新增状态栏或状态协议，避免扩大范围。

## Proof
- `pnpm exec vitest run src/features/chat/ChatComposer.test.tsx src/features/chat/ChatView.test.tsx`
- `pnpm typecheck`
- `pnpm exec prettier --check src/features/chat/ChatView.tsx src/features/chat/ChatComposer.tsx src/features/chat/ChatView.test.tsx src/features/chat/ChatComposer.test.tsx docs/chat-copy-cleanup/*.md`
