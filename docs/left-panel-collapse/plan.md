# Plan: Projects 左栏折叠（from `docs/left-panel-collapse/spec.md` 2026-09-14）

## Files that change

- `src/features/workbench/workbenchStore.ts` / test：projectsCollapsed 和持久化。
- `src/features/workbench/Workbench.tsx` / test：左栏 toggle、条件渲染、Grid class。
- `src/features/projects/ProjectRail.tsx` / test：移除 copy/close controls。
- `src/styles/index.css`：projects-collapsed Grid 和删除 project-actions 样式。

## Order of work

1. 添加 store、Workbench、ProjectRail 失败测试。
2. 实现左栏折叠状态和 header 按钮。
3. 移除项目行复制/关闭控件和无用代码/CSS。
4. 全仓库检索旧 UI 文案和 class。
5. 运行完整检查、bundle、覆盖安装并校验 hash。

## Risks

- 两侧同时折叠时 Grid 与 handle 定位需正确。
- `resizeRight` 计算必须在左栏折叠时按 0 宽处理，否则右栏最大宽度被错误限制。
- 旧 localStorage hydration 需向后兼容。

## Proof

`pnpm test -- Workbench.test.tsx workbenchStore.test.ts ProjectRail.test.tsx`、`pnpm check`、`pnpm bundle`。
