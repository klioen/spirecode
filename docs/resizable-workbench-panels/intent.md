# Intent: Workbench Panels 支持拖拽调整大小
Author: keliangliang。 Status: accepted。

> Terminal 底部 panel 部分已被 `docs/terminal-center-tabs/` 取代；当前只保留左右侧栏拖拽。

## Problem

当前 Workbench 使用固定尺寸：Projects 220px、Files/Changes 292px、Terminal 226px。用户无法根据项目名称、文件树深度、diff 内容或终端任务调整工作区比例。

## Proposed outcome

Projects 左栏和 Files/Changes 右栏可通过边缘分隔条拖拽调整大小。中央 Editor/Terminal tabs 自动占据剩余空间。尺寸在应用重启后恢复；右栏折叠后再次展开时恢复折叠前尺寸。

## Affected users and systems

所有 Pi App 用户；Workbench 布局、Zustand view state、Project/File/Git/Terminal 面板尺寸。

## Constraints

- 保持现有四区信息架构，不引入任意 Dock 或递归分屏。
- 左栏仅允许水平调整右边缘；右栏调整左边缘。
- 中央 Editor/Terminal tabs 没有独立尺寸值，它是侧栏之外的剩余空间。
- 必须限制最小/最大尺寸，不能把 Editor 挤出可用区域。
- 拖拽期间不得选中文本或触发 panel 内部点击。
- Terminal 作为中央 tab 时继续由现有 `ResizeObserver` 驱动 PTY resize。

## Open questions

无。
