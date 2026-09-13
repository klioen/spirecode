# Intent: Projects 侧栏展示项目名称
Author: keliangliang。 Status: accepted。

## Problem

当前 Projects 侧栏宽度只有 68px，每个项目被渲染为图标和名称前两个字母，无法直接识别项目。ThinkRail 的项目导航以文件夹图标和完整项目名称作为每行的主要内容。

## Proposed outcome

将左侧 Projects 栏改为可读的项目列表：每行展示文件夹/仓库图标和完整项目名称，名称过长时截断并通过 title 显示完整路径；选中状态、打开项目、关闭项目、Reveal 和 Copy Path 行为保持可用。

## Affected users and systems

所有使用多个本地项目的用户；`ProjectRail`、Workbench grid 和左栏样式。

## Constraints

- 视觉和信息层级参考 ThinkRail。
- V1 没有 workspace 子层，不添加无功能的展开箭头、workspace 数量或创建 workspace 按钮。
- 不改变 Projects 后端或状态模型。
- 窄窗口下中央编辑区仍保有可用最小宽度。

## Open questions

无。
