# Plan: Origin Branch 空状态与 Refresh（from `docs/worktree-origin-empty-state/spec.md` 2026-09-14）

## Files that change

- `src-tauri/src/worktrees/mod.rs`：originConfigured 探测与测试。
- `src/bindings/generated.ts`：DTO 字段。
- `src/features/projects/WorktreeDialog.tsx` / test：empty notice、refresh 和错误保持。
- `src/styles/index.css`：notice/refresh 布局。

## Order of work

1. 添加 Rust/前端失败测试。
2. 扩展 DTO 和 branch discovery。
3. 实现 refresh state machine。
4. 完整检查、bundle、覆盖安装。

## Proof

`cargo test worktrees`、`pnpm test -- WorktreeDialog.test.tsx`、`pnpm check`、`pnpm bundle`。
