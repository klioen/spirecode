# Plan: 编辑器空状态补充 Chat Agent 提示（from `docs/editor-empty-hints/spec.md` 2026-09-18）

## Files that change

- `docs/editor-empty-hints/{intent,spec,plan}.md`
- `src/features/editor/EditorPane.tsx`
- `src/features/editor/EditorPane.test.tsx`

## Order

1. 在现有空状态测试中增加 Chat Agent 文案断言；
2. 添加对应 JSX 提示；
3. 运行 targeted test 和 `pnpm check`。

## Proof

```bash
pnpm exec vitest run src/features/editor/EditorPane.test.tsx
pnpm check
```
