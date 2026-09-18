# Spec: 移除 Project Copy path 并修复顶部布局
Status: accepted。 Implements: `docs/fix-project-copy-layout/intent.md`。

## Copy path removal

- 移除 `commands.projectCopyPath`、`projectsApi.copyPath`；
- 移除 ProjectRail 的 Copy path 菜单项、反馈状态和测试；
- 更新 `docs/project-actions/{intent,spec}.md`，Project 菜单只保留 Reveal in Finder / Close project。
- 如果存在历史 IPC command contract，删除其 allowlist 和对应测试。

## Topbar

- `.topbar` grid 改为 `grid-template-columns: minmax(0, 1fr) auto`；
- `.project-crumb` 允许收缩并省略过长内容；
- `.layout-actions` 位于 auto 右侧列并 `justify-self: end`；
- layout actions 的四个按钮保持可点击（`-webkit-app-region: no-drag`）。

## Acceptance

- Project 菜单不存在 Copy path；
- Project Reveal/Close 仍可用；
- Workbench 仍渲染四个右上角 controls；
- `pnpm check` 全绿。
