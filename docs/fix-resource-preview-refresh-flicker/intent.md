# Intent: 修复 AI 写代码时 Changes 资源预览闪烁
Author: SpireCode team。 Status: accepted。

## Problem

AI Chat 持续写文件时，文件 watcher 高频发送 `filesystem://changed` 和 `git://changed`。当前编辑器把每次 Git 事件都视为整个 worktree 的 Diff 缓存失效；已显示的 Changes 文件预览会立即切回 `Loading resource…`，随后又显示内容。连续事件使这一过程高频重复，形成明显闪烁。

## Proposed outcome

Changes 文件已有可显示内容时采用 stale-while-revalidate：后台读取最新 Diff，同时继续显示上一版内容；最新有效请求完成后原地更新。首次打开无缓存资源时仍显示加载状态，并保留现有竞态保护。

## Affected users and systems

使用 AI Chat 编写代码、同时查看 Changes 文件 Diff 的用户；Renderer 的资源缓存、资源预览加载状态和 Git watcher 刷新链路。

## Constraints

不降低文件 watcher 和 Changes 列表刷新频率；不把文件或 Diff 正文放入 Zustand；旧请求不得覆盖较新的资源版本或导航结果。

## Open questions

无。
