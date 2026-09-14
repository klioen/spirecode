# Intent: 移除 Add Origin
Author: user。 Status: accepted。

## Problem
New Worktree 弹窗在没有 `origin` remote 时显示 Add icon，并允许输入 URL 创建和 fetch origin；这超出了期望范围。

## Proposed outcome
无论仓库是否配置 `origin`，Base branch 右侧始终只显示 Refresh icon。应用不再提供添加 origin remote 的 UI 或后端 command。

## Affected users and systems
- New Worktree 弹窗。
- 前端 command binding 与 projects API。
- Tauri command 注册和 Rust worktree service。

## Constraints
- Refresh 仍只重新读取本地 Git 状态，不执行网络 fetch。
- 没有 origin 或没有已 fetch branches 时，Create 保持 disabled。
- 删除 Add Origin 的完整死代码、样式和测试，不保留不可达接口。

## Open questions
None。
