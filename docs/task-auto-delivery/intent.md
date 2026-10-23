# Task 自动 Git 交付 Intent

## Why

TaskRun 目前能保存 Agent 自报的 Draft PR/MR 链接，但 `needs_review` 不代表代码已经提交、推送并可在远端审查。交付副作用依赖模型记忆也无法可靠恢复。

## Outcome

- Main 在每个 Git Task 启动前记录 HEAD、dirty 状态、任务分支和 target。
- 结束时以 Git 事实判断是否有新 commit 或 staged、unstaged、untracked 变化，不猜测文件类型或需求文本。
- 有变化时由 Main 自动 stage、必要时 commit、非 force push，并创建或复用普通 Ready GitHub PR / GitLab MR；成功后才进入 `needs_review`。
- initial dirty 改动属于交付范围，选择 dirty existing worktree 时必须明确确认。
- Directory Project 或完全无 Git 变化时不创建空 commit/PR/MR。
- Request changes 复用同一 workspace、任务分支和 PR/MR。
- 自动化永不 approve、merge、发布、设置 reviewer/label/milestone/auto-merge。

## Risk

高风险：涉及 Git 远端写入、外部 CLI、凭据边界、持久化恢复、跨进程 DTO 兼容。用户已通过 Task intake 明确授权该范围。实现必须使用参数数组、受限输入、脱敏稳定错误和幂等探测。历史 Draft 报告必须继续可读。
