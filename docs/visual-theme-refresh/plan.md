# Plan: Pi App 双主题视觉系统（from `docs/visual-theme-refresh/spec.md` 2026-09-14）

## Files that change

- `src/features/theme/themeStore.ts` / test：system/light/dark、持久化和 media query。
- `src/features/theme/ThemeToggle.tsx` / test：右上角主题切换。
- `src/app/App.tsx` 或 `main.tsx`：主题初始化。
- `src/styles/index.css`：双主题 token 与所有组件视觉状态。
- `src/features/editor/EditorPane.tsx`：Monaco theme adapter。
- `src/features/terminal/TerminalInstance.tsx`：xterm theme adapter。
- `src/features/workbench/Workbench.tsx` / test：主题按钮接入。
- `src/styles/themeTokens.test.ts`：token 完整性和 raw hex adoption guard。

## Order of work

1. 为主题状态、切换按钮和 token 完整性添加失败测试。
2. 实现 theme store 与根节点 data-theme。
3. 定义 light/dark 语义 token，替换全局旧 token 和 raw hex。
4. 分模块优化 Projects、Header、Editor tabs、Files/Changes、Terminal 和反馈状态。
5. 将 Monaco/xterm 绑定到 theme adapter。
6. 运行完整检查与 bundle，分别验证 light/dark 截图。

## Risks

- 一次性替换颜色可能遗漏 Monaco/xterm 等非 CSS consumer；通过 adapter 测试固定。
- 系统主题变化与用户 override 可能冲突；store 明确区分 mode 和 resolvedTheme。
- 浅色模式下 raw Monaco `vs-dark` 或 xterm 深色背景会产生突兀黑块，必须同步完成。
- 全局 CSS 大改可能降低已有 active/hover 可见性；通过 token 和关键组件测试防回归。

## Proof

`pnpm test -- themeStore.test.ts ThemeToggle.test.tsx themeTokens.test.ts Workbench.test.tsx`、`pnpm check`、`pnpm bundle`，并提供浅色/深色截图。
