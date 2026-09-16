# Plan: Chat 模型按 Provider 分组（from `docs/chat-model-provider-groups/spec.md` 2026-09-17）

## Files that change

- `docs/chat-model-provider-groups/{intent,spec,plan}.md`：记录已批准需求、设计和证明。
- `src/features/chat/ChatComposer.tsx`：按 provider 构造稳定分组并渲染原生 optgroup。
- `src/features/chat/ChatComposer.test.tsx`：覆盖分组、标签回退、稳定顺序和模型切换参数。

## Order of work

1. 在现有 selector 测试中增加多个同 provider 模型、分组结构和展示文案断言。
2. 运行测试并确认当前平铺实现失败。
3. 在 ChatComposer 中按首次出现顺序归组，不改变 option 的 `provider/id` value。
4. 运行目标测试、格式检查和完整 `pnpm check`。
5. 检查 diff，确认没有覆盖工作区中的其他未提交变更。

## Risks

最主要风险是展示文案变化后丢失唯一性，但原生 select 的行为由 option value 决定，因此继续保留 `provider/id`。另一风险是用对象排序意外改变后端顺序，因此采用单次遍历和 Map 的插入顺序，不做字母排序。

不在后端预分组，因为这是纯展示结构，修改 DTO 会扩大 IPC 和 Main 范围。

## Proof

```bash
pnpm exec vitest run src/features/chat/ChatComposer.test.tsx
pnpm format:check
pnpm check
```

计划已于 2026-09-17 获用户确认。

## Implementation proof

- Chat Composer 定向测试通过：1 个测试文件、7 个测试。
- 定向 Prettier、ESLint 和 Renderer/Electron TypeScript 检查通过。
- 完整检查通过：brand、format、lint、typecheck，以及 45 个测试文件中的 199 个测试。
- 当前 shell 未暴露 `node` / `pnpm`，因此使用 SpireCode Electron 可执行文件的 `ELECTRON_RUN_AS_NODE=1` 模式直接运行相同的项目工具。
