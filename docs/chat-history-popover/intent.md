# Intent: Chat history 浮层视觉与关闭交互优化

Status: approved，用户已确认。

## Problem

用户反馈 Chat panel 的 chat history 不美观，打开后点击其他区域无法关闭。
现状是 `ChatHistory` 使用标题和无分组的默认按钮列表；`EditorPane` 只在入口切换或选择会话时关闭，没有 outside-pointer 或 Escape 处理。

## Proposed outcome

将历史列表优化为与现有主题一致的紧凑、可搜索浮层，并提供可靠的外部点击与键盘关闭行为。

## Affected users and systems

Renderer 的 ChatHistory、EditorPane 及其样式和测试。

## Constraints

不改 Main、IPC、会话持久化及 Chat runtime；不增加依赖；不引入阻挡外部操作的全屏遮罩；兼容明暗主题与窄面板。

## Open questions

无；用户已确认 spec 与 plan 中的视觉方向及实施范围。
