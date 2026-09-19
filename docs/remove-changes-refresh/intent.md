# Intent: 移除 Changes 手动刷新图标
Author: user。 Status: accepted。

## Problem
Changes 工具栏中的手动刷新图标增加了不必要的界面元素；Changes 已在面板加载和 Git 状态变化时自动刷新。

## Proposed outcome
移除 Changes 工具栏的刷新图标，仅保留 List/Tree 视图切换，同时维持现有自动刷新行为。将右侧 Files/Changes 面板切换从文字标签改为图标按钮，进一步减少界面文字和占用宽度。

## Affected users and systems
- 使用 Changes 面板查看 Git 改动的 SpireCode 用户。
- Renderer 中 Changes 组件、Workbench 右侧面板切换、国际化文案及组件测试。
- 不改变 Electron Main、Git 状态协议或事件订阅。

## Constraints
- 面板首次加载仍调用 `refreshChanges`。
- 收到 `git://changed` 事件时仍自动刷新 Changes 并使 diff 失效。
- List/Tree 切换行为保持不变。
- Files/Changes 切换继续具备本地化 accessible name、title 和当前选中态。
