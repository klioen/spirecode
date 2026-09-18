# Plan: 文件保存冲突恢复（from `docs/file-conflict-recovery/spec.md` 2026-09-18）

## Files that change

- `docs/file-conflict-recovery/{intent,spec,plan}.md`
- `src/features/editor/EditorPane.tsx`：冲突操作状态、Reload/Compare/Overwrite、只读磁盘版本视图。
- `src/features/editor/EditorPane.test.tsx`：red-green 覆盖三个动作和失败保留 draft。
- `src/styles/index.css`：冲突操作按钮和 compare 内容样式。

## Order of work

1. 写 FILE_CONFLICT 三个动作的失败测试。
2. 实现 `refreshDisk`/`reload`/`compare`/`overwrite`，统一 pending/error 处理。
3. 增加条件 UI 与样式。
4. targeted tests、`pnpm check`、diff review。

## Risks

- Overwrite 的关键风险是使用旧 version；必须强制先读再写，并保留 `expectedVersion`。
- Reload 可能丢失本地内容，只通过显式按钮触发。
- Compare 不能覆盖当前编辑器 content，避免用户误以为本地 draft 已被替换。

## Proof

```bash
pnpm exec vitest run src/features/editor/EditorPane.test.tsx
pnpm check
```
