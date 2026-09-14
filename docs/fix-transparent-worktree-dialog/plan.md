# Plan: 修复透明 Worktree Dialog（from `docs/fix-transparent-worktree-dialog/spec.md` 2026-09-14）

## Files that change

- `src/styles/index.css`：overlay token 和 dialog/input background 修复。
- `src/styles/themeTokens.test.ts`：未定义 token 使用 guard。

## Order of work

1. 添加未定义 CSS variable guard 并确认当前失败。
2. 替换 dialog 的无效 token，增加三个主题的 overlay token。
3. 运行目标测试、完整检查、bundle 并覆盖安装。

## Risks

CSS fallback 嵌套解析不应误报；本次 guard 只检查无 fallback 的 `var(--token)`，现有带 fallback 的尺寸变量不受影响。

## Proof

`pnpm test -- themeTokens.test.ts WorktreeDialog.test.tsx`、`pnpm check`、`pnpm bundle`。
