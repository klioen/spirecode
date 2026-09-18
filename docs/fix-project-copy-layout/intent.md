# Intent: 移除 Project Copy path 并修复顶部布局
Author: product owner。 Status: accepted。

## Problem

Project 管理菜单中的 Copy path 不符合当前产品需求，应移除。顶部 Command Center 已删除但 topbar 仍保留三列网格，导致 Settings、主题和面板图标跑到窗口中间，而不是右侧。

## Proposed outcome

- 删除 Project Copy path 的 Renderer、IPC、API、测试和产品文档入口；
- topbar 使用左侧项目 breadcrumb + 右侧 layout actions 两列布局，四个图标固定在右侧。

## Constraints

- 保留 Reveal in Finder 和 Close project；
- 不恢复 Command Center；
- 不改变 Settings/Theme/panel buttons 的行为。
