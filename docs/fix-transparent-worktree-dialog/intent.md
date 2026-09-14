# Intent: 修复 Worktree Dialog 透明背景
Author: keliangliang。 Status: accepted。

## Problem

New Worktree、Rename Worktree 和 Delete Worktree dialog 使用未定义的 CSS variables：`--modal-backdrop`、`--panel-bg`、`--input-bg`、`--editor-bg`。浏览器丢弃对应 background 声明，导致遮罩、弹窗和输入框看起来透明。

## Proposed outcome

所有 Worktree dialogs 使用现有双主题语义 token，具备清晰不透明 panel、可见边框、遮罩和输入控件背景；浅色/深色主题都正常。

## Affected users and systems

Worktree create/rename/delete dialogs 和主题 token guard。

## Constraints

不新增另一套 panel/input token；复用 `--elevated-bg`、`--control-bg`、`--border-strong` 和现有 shadow。遮罩允许使用专用主题 token。

## Open questions

无。
