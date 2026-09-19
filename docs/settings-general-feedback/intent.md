# Intent: 精简 General Settings 并独立展示 Feedback
Author: 用户。 Status: accepted。

## Problem
Settings > General 中的 Diagnostics 操作占据独立区域，但用户不需要在设置界面复制诊断信息或显示日志；Feedback 又混在该区域中，信息层级不清晰。

## Proposed outcome
从 General Settings 完整移除 Diagnostics 界面，将 Feedback 作为独立设置行保留。Electron Main 的底层诊断记录能力继续保留，避免影响启动错误和崩溃排查。

## Affected users and systems
- SpireCode 桌面端用户。
- Renderer General Settings 页面与中英文文案。
- Electron Main 诊断服务不在本次删除范围内。

## Constraints
- Feedback 继续通过现有类型化 IPC 打开反馈入口。
- 不删除 Main 的 DiagnosticsService、日志记录或现有 IPC，以避免扩大变更范围。
- General 页面不再出现 Diagnostics、Copy diagnostics、Reveal logs 或复制成功提示。
