# Plan: 移除 Project Copy path 并修复顶部布局（from `docs/fix-project-copy-layout/spec.md` 2026-09-18）

## Files that change

- `docs/fix-project-copy-layout/{intent,spec,plan}.md`
- `src/features/projects/ProjectRail.tsx`、测试；
- `src/features/projects/projectsApi.ts`、`src/bindings/index.ts`；
- `src/features/workbench/Workbench.test.tsx`、`src/styles/index.css`；
- `electron/contracts.ts`、`electron/ipc.ts`（若 command contract 当前仍暴露 copy）；
- `docs/project-actions/{intent,spec}.md`。

## Order

1. 先移除 Copy path 测试期待并确认 red；
2. 删除 Copy path UI/API/IPC；
3. 修复 topbar grid 与 breadcrumb 收缩；
4. 运行 targeted tests、`pnpm check`；
5. 提交并重新安装 smoke。

## Risks

- 误删通用 clipboard 能力：只删除 project path command，不删除 settings Agent path copy 或系统 clipboard 服务；
- 顶部布局必须保留 Electron 拖拽区与 no-drag controls。
