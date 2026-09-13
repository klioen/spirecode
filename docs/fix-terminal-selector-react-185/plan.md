# Plan: 修复 Terminal 空 snapshot 无限更新（from `docs/fix-terminal-selector-react-185/spec.md` 2026-09-13）

## Files that change

- `src/features/terminal/TerminalPanel.test.tsx`：启动回归测试。
- `src/features/terminal/terminalStore.ts`：稳定空列表 selector。
- `src/features/terminal/TerminalPanel.tsx`：使用稳定 selector。

## Order of work

1. 添加无 Terminal tab 的组件测试并确认失败为 React maximum update depth。
2. 提取稳定空数组和 selector。
3. 运行目标测试、完整检查和 bundle smoke。

## Risks

最危险的是只让测试绕过 selector 而没有覆盖真实组件，因此测试直接渲染 `TerminalPanel`。不采用 shallow comparator，因为根因是 selector 每次主动创建新引用，固定 fallback 更简单。

## Proof

`pnpm test -- TerminalPanel.test.tsx`、`pnpm check`、`pnpm bundle`。
