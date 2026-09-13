# Plan: Projects 侧栏名称列表（from `docs/project-rail-show-names/spec.md` 2026-09-13）

## Files that change

- `src/features/projects/ProjectRail.tsx`：项目名称行、标题和操作布局。
- `src/features/projects/ProjectRail.test.tsx`：名称、选中态和空状态回归。
- `src/styles/index.css`：220px Projects 面板和项目行样式。

## Order of work

1. 添加项目名称可见性的组件测试。
2. 将 tile DOM 改为图标 + 完整名称的 row。
3. 调整 Workbench grid 和侧栏样式。
4. 运行测试、完整检查和 bundle，覆盖安装。

## Risks

左栏加宽会压缩中央区域；通过 220px 固定栏和现有中央 `minmax(340px, 1fr)` 控制。移动 action 不能破坏 close/reveal/copy path 的现有语义。

## Proof

`pnpm test -- ProjectRail.test.tsx`、`pnpm check`、`pnpm bundle`。
