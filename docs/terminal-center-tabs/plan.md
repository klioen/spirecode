# Plan: Terminal 中央资源 Tabs（from `docs/terminal-center-tabs/spec.md` 2026-09-13）

## Files that change

- `src/features/editor/editorStore.ts` / test：Terminal tab union、编号和状态。
- `src/features/editor/EditorPane.tsx` / test：New Terminal、Terminal tab/content、异步关闭。
- `src/features/terminal/TerminalInstance.tsx`：状态写回中央 store。
- 删除 `src/features/terminal/TerminalPanel.tsx`、对应测试和 `terminalStore.ts`/test。
- `src/features/workbench/Workbench.tsx` / test：删除底部 panel、Terminal toggle/handle。
- `src/features/workbench/workbenchStore.ts` / test：删除 terminal height/collapse persistence。
- `src/styles/index.css`：两行 Workbench 布局、中央 tab action 和中央 Terminal 样式，删除底栏样式。
- 更新 `docs/resizable-workbench-panels/*`：反映 Terminal panel 已被后续设计取代。

## Order of work

1. 写 editorStore Terminal tab 编号与共存测试。
2. 将 Terminal 创建/attach/状态/关闭接入 EditorPane。
3. 删除独立 TerminalPanel/store。
4. 删除 Workbench 底栏、折叠与高度 resize 状态。
5. 清理旧 CSS 和所有引用。
6. 运行完整检查、bundle 并覆盖安装。

## Risks

- create 成功但 attach 失败会泄漏 PTY；失败路径必须主动 close。
- 关闭 tab 是异步操作，不能先删除 UI 后悄悄留下 PTY。
- `TerminalInstance` 卸载只释放 xterm view，不应自行终止 PTY，后端生命周期仍由 tab close 管理。
- 迁移后若残留 terminal localStorage 字段，应在 hydration 时忽略，不继续写回。

## Proof

`pnpm test -- editorStore.test.ts EditorPane.test.tsx Workbench.test.tsx`、`pnpm check`、`pnpm bundle`。
