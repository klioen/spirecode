# Plan: Origin Branch Add/Refresh Icon（from `docs/worktree-origin-empty-state/spec.md` 2026-09-14）

## Files that change

- `src-tauri/src/worktrees/mod.rs`：remote URL validation、add/fetch/rollback。
- `src-tauri/src/commands.rs` / `lib.rs`：`project_add_origin`。
- `src/bindings/index.ts`：command binding。
- `src/features/projects/projectsApi.ts`：addOrigin API。
- `src/features/projects/WorktreeDialog.tsx` / test：Add/Refresh icon 与 URL form。
- `src/styles/index.css`：inline icon 和 URL form。

## Order of work

1. 添加 Rust URL/add rollback 与前端 add flow 失败测试。
2. 实现 project_add_origin。
3. 实现 no-origin Add icon/URL form；configured 使用 Refresh icon。
4. 完整检查、bundle、覆盖安装。

## Risks

- fetch 可能慢，command 必须在 blocking pool，UI 显示 adding state。
- remote add 成功但 fetch 失败必须移除 origin，不能留下半配置状态。
- 不接受任意 shell 字符串；所有 Git 参数使用数组。

## Proof

`cargo test worktrees`、`pnpm test -- WorktreeDialog.test.tsx`、`pnpm check`、`pnpm bundle`。
