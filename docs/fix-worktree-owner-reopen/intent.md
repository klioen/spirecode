# Intent: 修复重新添加项目后无法创建 Worktree
Author: keliangliang。 Status: accepted。

## Problem

项目关闭后重新添加会生成新的 Project ID，但 `~/.pi/worktrees/<project-name>/.pi-worktree-owner.json` 保留旧 Project ID。即使 marker 的 canonical `gitCommonDir` 与当前项目完全一致，创建 New Worktree 仍报 `managed root belongs to another repository`。

当前现场中：

- marker Project ID：`9f1e783b-9e80-40e0-af2f-b78204c68478`
- 当前 catalog Project ID：`19a30cfa-ae6d-4099-ae74-98ee7dbf3a77`
- 两者 Git common dir 均为 `/Users/bytedance/Code/pi-extensions/.git`
- 已有 `worktree1` 仍由该仓库的 `git worktree list` 正常登记，且工作区干净

因此错误是 catalog identity 变化被误判为 repository identity 冲突。

## Proposed outcome

- 同一 canonical Git common dir 的项目重新加入后，可以继续使用原 managed root 并创建新 worktree。
- ownership marker 安全迁移到当前 Project ID。
- canonical Git common dir 不同的同名项目仍严格拒绝，不能接管或删除其他仓库的 managed root。
- 已有但未进入当前 catalog 的 Git worktree 不被自动删除、移动或覆盖。

## Affected users and systems

关闭后重新添加项目、重置应用状态或经历 catalog migration 的用户；Projects catalog、Worktree ownership marker 和 New Worktree 流程。

## Constraints

不删除现有 managed worktree，不放宽 symlink 防护，不仅靠手工修改 marker；Git 仓库身份以 canonical `git-common-dir` 为准。

## Open questions

无。现场 marker、catalog 和 Git topology 已核对。
