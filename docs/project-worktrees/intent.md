# Intent: Project Managed Worktrees
Author: keliangliang。 Status: accepted。

## Problem

SpireCode 当前一个 Project 只对应一个本地 Git working tree，无法从项目导航中基于远端分支创建隔离工作目录，也无法在应用内管理 worktree 的重命名和删除生命周期。

## Proposed outcome

- 每个 Project 行右侧显示 `+` 图标。
- 点击后打开 New Worktree dialog。
- Dialog 从后端读取 `origin/*` 远端分支，用户选择 base branch。
- 用户填写 worktree name；默认依次为 `worktree1`、`worktree2`……。
- managed worktree 默认创建到 `~/.pi/worktrees/<project-name>/<worktree-name>`。
- 创建成功后，在 Project 下显示 managed worktree 子项并自动选中。
- managed worktree 支持 rename 和 delete。
- Rename 同步修改 worktree name、local branch 和磁盘目录。
- Delete 移除 managed worktree 目录和 catalog record，但默认保留 local branch。
- Files、Git Changes、Editor tabs 和 Terminal 全部以具体 checkout/worktree 为作用域。
- 应用重启后恢复 Project 与 managed worktree catalog。

## Affected users and systems

- Projects rail、worktree context menu 和当前 checkout selection。
- Rust Project catalog/persistence。
- Git branch discovery、`git worktree add/move/remove` 和 branch rename。
- Filesystem watcher、Git status/diff、Terminal cwd。
- Editor/File/Changes 前端缓存 identity。

## Constraints

- V1 只管理应用创建的 worktree，不支持附加任意 external worktree。
- base branch 仅来自本地可见的 `origin/*` tracking refs，不允许前端提交任意 ref。
- worktree name 同时作为 display name、local branch 名和目录名；只允许安全字符。
- 默认名按 Project 独立单调递增，删除后不回退编号。
- worktree 根目录固定为 `~/.pi/worktrees/<project-name>/<worktree-name>`，绝对路径只由 Rust 生成。
- 使用 `git worktree add -b <name> --no-track --end-of-options refs/remotes/origin/<branch>`。
- 主 Project 目录不可 rename 或 delete。
- Rename 在存在运行中 Terminal 时拒绝，避免 shell cwd 指向已移动目录。
- Delete 对 dirty worktree 或运行中 Terminal 必须显式二次确认；branch 默认保留。
- Project 同名目录通过 ownership marker 防止不同 repository 共享或误删同一 managed root。

## Open questions

无。
