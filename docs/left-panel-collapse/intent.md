# Intent: Projects 左栏支持折叠并简化项目行操作
Author: keliangliang。 Status: accepted。

## Problem

右上角当前只有 Files/Changes 右栏折叠按钮，Projects 左栏无法折叠。项目行还包含 Copy Path 和 Close 两个按钮，增加视觉噪音，不符合当前简洁导航目标。

## Proposed outcome

在右上角布局操作区增加 Projects 左栏折叠图标，与现有右栏折叠图标并列。折叠时 Projects panel 和其 resize handle 隐藏，中央主区域占用释放空间；再次展开恢复之前宽度。项目行只保留项目名称选择和双击 Reveal，移除 Copy Path 与 Close 按钮。

## Affected users and systems

Workbench header、Grid、workbenchStore、ProjectRail 和 panel resize handle。

## Constraints

- 左栏折叠状态持久化到现有 `pi-app.workbench.v1`。
- 折叠不关闭项目、不删除项目状态。
- Projects 宽度值保持，展开后恢复。
- 右栏折叠与拖拽行为保持不变。
- 移除复制与关闭 UI 后不删除后端 commands，避免扩大本次范围。

## Open questions

无。
