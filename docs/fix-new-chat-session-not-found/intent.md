# Intent: 修复 New Chat 的错误 session-not-found 提示

Status: accepted

## Problem

在 SpireCode 中点击 `New chat` 后，界面可能显示 `CHAT_SESSION_NOT_FOUND: Chat session not found`，即使刚创建的会话随后仍可继续使用。

当前 `ChatView` 挂载时并行请求 session attach 与 config。Main 端 attach 能够注册或恢复 session，而 config 只接受已注册的 live session。React effect 的重挂载以及 IPC attach/detach 交错还可能让旧 subscription 的清理与新 attach 竞争。现有测试分别覆盖正常 attach 和 config，但没有覆盖真实挂载时序。

## Desired outcome

- 新建或从历史打开 Chat 时，不因 attach/config 生命周期竞争显示错误的 session-not-found。
- 配置只在 authoritative attach 成功后加载。
- 重复或过期的 detach 是安全、幂等的，不影响当前 attachment。
- 真正不存在的 session 仍返回 `CHAT_SESSION_NOT_FOUND`。

## Affected system

- Renderer Chat attach/config 生命周期。
- Electron Main Chat session detach 语义。
- Chat service 与 component regression tests。

## Constraints

- 不改变 pi JSONL transcript 的 source-of-truth 地位。
- 不把 transcript 内容放进 Zustand 或 localStorage。
- 不削弱 worktree/session ownership 校验。
- 不混改当前工作区中的 Settings and Extensions 功能。
