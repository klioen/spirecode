# Task 自动 Git 交付 Spec

## 1. Git 变化与执行起点

- Git Task 在 Agent 开始前持久化 `baselineHead`、`initialDirty`、`branch`、`target`。
- 结束时 `HEAD != baselineHead` 或 porcelain v2 显示 staged、unstaged、untracked 任一变化即需要交付。
- initial dirty 全部纳入 `git add -A`；UI 明确警告这些改动会与 Agent 改动一起提交、推送。
- 无变化不 commit、不 push、不创建 PR/MR。Directory Project 跳过整个 Git 交付。

## 2. 分支与 target

- `new_managed` 使用 managed worktree 独立分支，target 为创建 Task 时 `baseRef` 去除 `origin/`。
- `existing` 在 prompt 前创建确定性的 `spire/task-<task-id>` 独立分支；dirty 变化随分支保留。target 优先为启动分支的 `origin/*` upstream，否则为 `origin/HEAD`；无法得到有效 target 时失败。
- 分支、target 和 worktree catalog 必须一致并持久化在 saga step。后续 Run 必须复用；不得直接推送原分支或默认分支。

## 3. 交付步骤

1. 持久化 delivery intent。
2. `git add -A`；若 index 非空则创建非空 commit，已有 Agent commit 时不创建空 commit。
3. 仅用显式非删除 refspec push 到 `origin`，禁止 force/force-with-lease。
4. 从 origin 的常见 HTTPS/SSH URL 识别 GitHub/GitLab。
5. 通过受限 `gh api` / `glab api` 参数数组查询或创建 PR/MR；创建请求不传 Draft 选项。
6. 再查询并验证 URL、provider、head、target、open 状态和 `draft=false`。
7. 将 Main 验证后的 HTTPS URL、kind、draft 状态写入 Run report，再进入 `needs_review`。

Agent 自报 change request 不构成交付证明，Main 不将其写入最终报告。

## 4. 复用、失败与恢复

- Request changes 复用同一 worktree、任务分支和已验证 PR/MR；新变化 push 后更新原单，不重复创建。
- 原 PR/MR closed/merged/deleted、remote task branch 丢失、identity 不匹配或查询结果歧义时安全失败，等待人工处理。
- commit/push/create 前写 intent；恢复先探测本地 HEAD、remote branch 及按 repository+head+target 精确匹配的单据。已完成副作用只 adopt，不重复 commit/建单。
- 交付失败的 Retry 复用同一 Run、report、workspace、branch 和 saga，不重新运行 Agent；错误标记 retryable 或 manual-action。
- 本地改动、commit、session 及已完成远端副作用全部保留。

## 5. 安全与错误

- Renderer 不接收绝对 path、任意命令、refspec、token 或原始 provider 响应。
- Git/CLI 均 `shell:false`、参数数组、超时和输出上限；CLI 使用最小环境并丢弃 stderr。
- 稳定错误覆盖：origin/provider 不支持、target/branch 冲突、CLI 缺失、未认证/无权限、push 失败、provider 响应非法、PR/MR missing/closed/draft/mismatch/ambiguous。
- 错误、事件和 IPC 不包含凭据、绝对路径或远端响应正文。

## 6. 报告与 UI 兼容

- `changeRequest.draft` 为 boolean；新自动交付必须是 `false`，历史 `true` 保持可读。
- Task detail 将 code delivery 作为显著区域，显示 provider 和 Ready/Draft 状态，保留安全外链确认。
- 最新结果、completed Task 和历史 Run 均保留链接；无变化、Directory 或尚无远端产物时不显示空链接。
- Accept 仅把 Task 置为 completed，不 approve/merge/release。

## 7. Acceptance

覆盖无变化、initial dirty、Agent commit、existing 分支/target、GitHub/GitLab Ready 创建与复用、CLI/auth/push/provider 失败、Agent 假链接拒绝、历史 Draft、Directory 跳过，以及 commit/push/create/persist 各崩溃点的幂等恢复。
