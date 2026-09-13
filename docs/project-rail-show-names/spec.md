# Spec: Projects 侧栏名称列表
Status: accepted。 Implements: `docs/project-rail-show-names/intent.md`。

## Requirements

- 左栏宽度从图标 rail 扩为约 220px 的导航面板。
- 顶部显示 `PROJECTS` 标题和 Add Project 操作。
- 每个项目行展示仓库图标和 `project.name` 完整文本；溢出时单行省略。
- 当前项目具有明确背景、文字和左侧强调状态。
- 项目行点击切换，双击 Reveal 的现有行为保持不变。
- 当前项目的 Close 和 Copy Path 操作以行内/侧栏操作提供，不依赖底部无语义图标。
- 无项目时显示可操作的空状态。

## Design

保留 `ProjectRail` 模块，将 DOM 从 42px tile 列表改为 ThinkRail 风格的横向 row。Workbench grid 的 rail 列统一改为 220px，包括右栏折叠状态。项目行使用 `min-width: 0` 与 `text-overflow: ellipsis`。

## Proof

组件测试验证完整名称文本、选中状态和 Open Project 操作。运行完整 `pnpm check`、production bundle，并覆盖安装。
