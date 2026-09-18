# Plan: 扩展关闭后的 Chat 默认模型 fallback（from `docs/fix-chat-model-extension-fallback/spec.md` 2026-09-18）

## Files that change

- `docs/fix-chat-model-extension-fallback/{intent,spec,plan}.md`
- `electron/domains/chat/piAdapter.ts`：默认模型 fallback。
- `electron/domains/chat/piAdapter.test.ts`：回归测试。

## Order

1. 写 unavailable default + available authenticated model 的失败测试；
2. 实现 fallback；
3. 运行 Chat targeted tests 和 `pnpm check`；
4. 提交并更新 PR。

## Risks

- 不得改变已经可用默认模型的行为；
- 不得选择未认证模型，否则会把初始化错误推迟到发送 prompt；
- 不修改用户设置，避免扩展开关操作产生隐式配置写入。
