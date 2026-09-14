# Intent: Worktree Origin Branch 空状态与刷新
Author: keliangliang。 Status: accepted。

## Problem

New Worktree dialog 在 Project 未配置 origin，或 origin 尚未 fetch 分支时，只显示空下拉框，用户无法判断原因，也无法在外部修复 Git 配置后重新加载。

## Proposed outcome

Dialog 明确区分“未配置 origin”和“origin 没有已 fetch 分支”。未配置 origin 时，Base branch 右侧显示 Add icon，点击后填写 Git remote URL，后端添加 origin 并 fetch；已配置 origin 时显示 Refresh icon，重新读取本地 tracking refs。

## Affected users and systems

Origin branch DTO、Rust branch discovery、NewWorktreeDialog。

## Constraints

- 不自动联网 fetch。
- 不在 WebView 执行 shell。
- 有分支时 Refresh 仍可手动刷新并保留/修正 selection。

## Open questions

无。
