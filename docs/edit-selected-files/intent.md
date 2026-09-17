# Intent: 允许编辑选中的文件
Author: keliangliang。 Status: accepted。

## Problem

Files 面板中选中的文本文件目前只能在 Monaco 中只读预览，用户无法直接修改并保存文件内容。

## Proposed outcome

- 从 Files 面板打开的受支持文本文件可直接编辑。
- 用户可通过 macOS 标准快捷键 `⌘S` 保存当前文件。
- 标签页展示未保存状态，保存成功后清除该状态。
- 保存仍受 worktree 根目录、`.git` 禁止访问和 symlink containment 边界保护。
- Git diff 继续保持只读。

## Affected users and systems

- 使用 Files 面板查看和修改 worktree 文件的 SpireCode 用户。
- Renderer 的 Monaco 文件编辑视图与编辑器标签页。
- preload allowlist、Electron IPC 契约和 filesystem domain。
- filesystem watcher、resource cache 与 Git Changes 刷新链路。

## Constraints

- Renderer 只能提交 `worktreeId + relativePath + content`，不得提交任意绝对路径。
- Main 必须复用现有路径保护，拒绝 traversal、`.git` 和 symlink escape。
- 仅 UTF-8 文本文件可编辑，正文不得进入 Zustand；dirty buffer 保持在编辑器组件内。
- 首版采用显式保存，不加入 autosave、Save As、编码转换或多文件批量保存。
- 外部文件发生变化且本地存在未保存内容时，不得静默覆盖本地编辑。

## Open questions

- 无。首版按显式 `⌘S` 保存和保守冲突提示实现。
