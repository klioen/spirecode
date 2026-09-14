# Intent: 启动时按 Project 数量决定自动选择
Author: keliangliang。 Status: accepted。

## Problem

SpireCode 启动加载 project catalog 后，会自动选择 Rust catalog 中保存的 active worktree，或在无有效选择时自动选择列表中的第一个 main worktree。用户希望应用启动后只展示 Projects 列表，不自动进入任何 Project。

## Proposed outcome

应用启动完成 catalog hydrate 后：Project 列表恰好只有一个 Project 时，自动选择该 Project 的 main worktree；列表为空或包含多个 Project 时，`activeWorktreeId` 保持 `null`。用户点击 worktree 或通过 Open Project 新增项目后仍进入具体 checkout。

## Affected users and systems

Projects store、App 启动 hydration、Workbench 空状态。

## Constraints

- 不删除或修改 Rust catalog 中的 persisted activeWorktreeId；前端启动时忽略它。
- 用户主动打开新 Project 后仍自动选中其 main worktree。
- 用户点击 worktree 后正常选中。
- 删除当前 managed worktree 后仍回退到同 Project main worktree。
- 后续 catalog refresh 若当前已有有效选择，应保留当前选择；仅首次启动 hydrate 应用数量判断规则。
- 单 Project 存在多个 managed worktree 时仍默认选择 main worktree，不恢复 persisted managed selection。

## Open questions

无。
