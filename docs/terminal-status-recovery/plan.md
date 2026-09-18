# Plan: Terminal 退出状态可见性与重启（from `docs/terminal-status-recovery/spec.md` 2026-09-18）

## Files that change

- `docs/terminal-status-recovery/{intent,spec,plan}.md`
- `src/features/editor/EditorPane.tsx`：tab 状态标记、状态横幅、`restartTerminal`、共享 `disposeTerminal` 提取。
- `src/features/editor/EditorPane.test.tsx`：红灯测试——标记、横幅、Restart 全链路、close 错误保留 tab。
- `src/styles/index.css`：`.tab-status`、`.terminal-status-banner`、`.terminal-status-restart` 样式。

## Order of work

1. 先写 EditorPane terminals describe 下的失败测试（red）。
2. 实现 tab 标记与横幅。
3. 提取 disposeTerminal 并实现 restartTerminal。
4. 样式；targeted tests、`pnpm check`；自审后提交。

## Risks

- restart 与 closeTab 共享清理逻辑时，容易漏掉 terminalStream.close 或 store.close；用共享函数消除分叉。
- 横幅放在 EditorPane 层而不是 TerminalInstance 内，避免向被 mock 的组件传新 prop 造成测试盲区。

## Proof

```bash
pnpm exec vitest run src/features/editor/EditorPane.test.tsx
pnpm check
```
