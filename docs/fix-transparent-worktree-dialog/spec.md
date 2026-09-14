# Spec: Worktree Dialog 语义背景
Status: accepted。 Implements: `docs/fix-transparent-worktree-dialog/intent.md`。

## Requirements

- backdrop 使用定义完整的 `--modal-overlay` token。
- light/dark/root 三个主题都定义 `--modal-overlay`。
- dialog 使用 `--elevated-bg`，输入/select 使用 `--control-bg`。
- dialog border 使用 `--border-strong`，shadow 使用 `--shadow`。
- CSS 中不得残留未定义的 `--modal-backdrop`、`--panel-bg`、`--input-bg`、`--editor-bg`。
- theme token 测试验证所有 `var(--token)` 都在主题声明中定义，或带有有效 fallback。

## Proof

`pnpm test -- themeTokens.test.ts WorktreeDialog.test.tsx`、`pnpm check`、`pnpm bundle`。
