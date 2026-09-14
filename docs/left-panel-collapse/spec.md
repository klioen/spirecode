# Spec: Projects 左栏折叠
Status: accepted。 Implements: `docs/left-panel-collapse/intent.md`。

## Requirements

- 右上角显示两个有明确 accessible name 的按钮：`Toggle projects panel`、`Toggle files panel`。
- 左栏展开时显示 ProjectRail 和 `Resize projects panel` separator。
- 左栏折叠时二者均不渲染，Grid projects 列宽为 0。
- `projectsCollapsed` 写入 workbench localStorage；旧存储无该字段时默认 false。
- 左栏展开时沿用 `projectsWidth`，不重置尺寸。
- ProjectRail 不显示 Copy Path 或 Close Project 按钮。
- 项目名称点击切换、双击 Reveal、Open Project 操作保持。

## Design

workbenchStore 增加 `projectsCollapsed` 和 `toggleProjects`。Workbench class 增加 `projects-collapsed`，CSS 将左列设为 0。左栏与 handle 使用条件渲染。左右布局图标分别使用 left/right panel 语义。

## Proof

- store 测试覆盖 projectsCollapsed persistence。
- Workbench 测试覆盖左右按钮和左栏/handle 隐藏。
- ProjectRail 测试断言不存在 copy/close controls。
- `pnpm check`、`pnpm bundle`、覆盖安装和 binary hash 校验。
