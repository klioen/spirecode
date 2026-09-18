# Plan: Editor 与 Chat Tab 持久化（from `docs/editor-tab-persistence/spec.md` 2026-09-18）

## Files that change

- `docs/editor-tab-persistence/{intent,spec,plan}.md`
- `src/features/editor/editorStore.ts`：持久化 schema、解析、恢复和写入。
- `src/features/editor/editorStore.test.ts`：red-green 覆盖恢复/非法数据/terminal 排除/clear。
- 可能更新 `src/features/editor/EditorPane.test.tsx`：验证恢复后的 Chat/File tab 正常渲染。

## Order of work

1. 先写 persistence helper 测试和 store restore 测试（red）。
2. 实现有限 schema parser 与 localStorage persistence。
3. 将所有 tab metadata mutation 接入持久化。
4. 运行 targeted tests 与完整 `pnpm check`。
5. 检查 diff，确认没有正文、draft、PTY、transcript 写入。

## Risks

- Store 测试共享 localStorage；每个测试必须显式清理 key，避免顺序依赖。
- 恢复 Chat tab 会触发 attach，必须依赖现有 worktree/session ownership 校验。
- 不持久化 dirty 状态，避免把已经不存在的内存 draft 伪装成可恢复文件。

## Proof

```bash
pnpm exec vitest run src/features/editor/editorStore.test.ts
pnpm check
```
