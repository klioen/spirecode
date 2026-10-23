# Intent: Task 执行安全与 Workspace 回收

> **Auto-delivery amendment:** Current Git delivery, Ready PR/MR, dirty workspace, branch, failure, retry, and recovery rules are defined by `docs/task-auto-delivery/spec.md`; they supersede older Draft-only or optional-push statements in this document.


Status: accepted by user.

## Problem

Task/TaskRun 模型能够保留多次执行尝试，但当前生命周期存在三类问题：

- `task_report_result` 会在 Agent 真正 settled 前释放 active Run 和 workspace lease；失败路径也可能在 session 仍运行时释放资源，导致下一 Run 与旧 Agent 并发修改同一 worktree。
- Retry 只查看最新 Run；若最新 Run 尚未绑定 workspace，更早 Run 已创建的 managed worktree可能被遗漏并重复创建。
- 每个 Run 都创建持久 Pi session；Request changes 因而丢失连续上下文并产生大量 session。与此同时，completed Task 永久保留接近 1 GiB 的 managed worktree，缺少安全回收入口。

## Outcome

- Task 继续表示稳定意图，TaskRun 继续表示不可变的执行尝试；Retry 和 Request changes 仍创建新 Run。
- report 先持久化，只有 Agent settled 或恢复时确认 session idle 后才将 Run 标记为 reported、Task 标记为 needs_review并释放 workspace lease。
- 已启动 session 的失败路径先持久化 stop intent、abort session，再进入 failed；恢复会继续未完成的 stop intent。
- Task 在首次绑定 workspace 后持久化 resolved workspace identity；后续 Run 不再从单条历史记录猜测 workspace。
- Request changes 复用前一 Run 的 idle session；Retry 默认新建 session。共享 session 的 token usage 按 Run 时间窗口统计。
- completed Task 可显式清理自己创建的 clean、idle managed worktree；existing、dirty、busy、active 或 ownership 不一致的 workspace 永不自动/批量 force 删除。
- 清理删除 checkout/catalog record，但保留 local branch、Task/Run/report 和 Pi JSONL session；UI 明确标记 workspace 已清理，不能继续显示可打开的 Chat 操作。

## Non-goals

- Task 完成时自动删除 workspace。
- 自动删除 branch、remote branch、session transcript 或 Task 历史。
- TTL 自动删除、Task archive、force cleanup 或从已清理 branch 自动恢复 workspace。
- 并行执行同一 Task 的多个 Run。

## Risk

High risk: this changes SQLite schema, crash-recovery semantics, Pi session ownership, Git worktree deletion and Main/Renderer IPC. All external deletion remains Main-owned, identity-checked and recoverable through persisted cleanup intent.
