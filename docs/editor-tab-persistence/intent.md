# Intent: Editor 与 Chat Tab 持久化
Author: product owner。 Status: accepted。

## Problem

SpireCode 重启后会丢失每个 worktree 的文件、Diff、Chat tab placement 和 active tab。Chat transcript 本身可以从历史恢复，但用户必须重新找到并打开会话；文件工作上下文也无法恢复。

## Proposed outcome

按 worktree 持久化轻量视图元数据：

- file tab：relativePath、preview、tab identity；
- diff tab：relativePath、scope、preview；
- chat tab：sessionId、title；
- activeTabId。

应用重启后恢复这些 tab。文件正文/diff 重新从 Main 加载；Chat 重新 attach transcript。Terminal PTY 不恢复。

## Constraints

- 不持久化文件正文、diff 文本、dirty draft、terminal output、PTY ID 或 Chat transcript。
- 使用 Renderer localStorage，不新增通用文件写入或 IPC。
- 持久化数据损坏时回退为空视图，不阻断应用启动。
- 只恢复仍属于当前 worktree 的元数据；不存在或非法 tab 丢弃。
