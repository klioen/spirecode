# Intent: Chat history 支持删除会话

Author: 用户。Status: approved。

## Problem

Chat history 只能搜索和打开历史会话，无法清理不再需要的会话。用户必须离开 SpireCode 使用 pi TUI 或手工处理 session 文件，操作割裂且容易误删。

## Proposed outcome

在 Chat history 的每个会话条目提供删除入口。用户确认后，将对应 pi session JSONL 移入系统废纸篓，并立即从历史列表移除。允许删除已打开但 idle 的会话，同时关闭对应 Chat tab；正在运行的会话拒绝删除并提示先停止任务。

## Affected users and systems

- Renderer：Chat history、EditorPane、Chat API、Chat runtime 与 editor tab 状态。
- Electron Main：IPC command、ChatService、pi adapter/session 生命周期。
- 本机 pi session 持久化文件与系统废纸篓。

## Constraints

- 删除必须二次确认，并显示会话标题。
- 只接受 `worktreeId + sessionId`，Renderer 不得传递任意文件路径。
- Main 必须从 pi `SessionManager.list(cwd)` 的结果重新解析并验证目标会话及归属。
- 使用 Electron `shell.trashItem` 移入系统废纸篓；失败时不得回退为永久删除。
- streaming 会话禁止删除；idle 会话即使已打开也可删除，并在成功后关闭 tab、detach subscription、清理 runtime。
- 删除失败时保留历史项和已打开 tab，并向用户展示错误。
- 不增加 npm 依赖，不实现批量删除或恢复界面。

## Open questions

无。用户已确认 idle 活动会话可直接关闭 tab 并删除，streaming 会话禁止删除。
