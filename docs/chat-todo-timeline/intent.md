# Intent: 在 SpireCode Chat 展示 Todo 进度
Author: user。 Status: accepted。

## Problem

SpireCode 已经捆绑并加载 `pi-todo`，模型也能调用 `todo_write`，但 Chat wire 当前会丢弃 `entry_appended`，快照只读取 `session.messages`。因此 `pi-todo` 通过 `pi.appendEntry("pi-todo-state", ...)` 保存的进度既不会实时显示，也不会在重新打开会话后恢复。

## Proposed outcome

- 在 Chat transcript 中按更新时间线展示 Todo 快照卡片，对齐 pi TUI 的展示语义。
- 卡片显示完成数/总数、可选 explanation，以及 pending、in progress、completed、blocked 四类状态。
- 实时 `entry_appended` 与历史会话恢复使用同一安全 DTO 和同一 React 组件。
- 未知或非法 custom entry 不进入 Renderer。

## Affected users and systems

- 使用 SpireCode Chat 和 `pi-todo` 的用户。
- Electron Main Chat adapter/wire/snapshot 管线。
- Renderer Chat timeline、reducer、React 组件和样式。

## Constraints

- Renderer 不接触 pi SDK、Node API、原始 session entry 或任意 custom data。
- Main 只 allowlist `customType === "pi-todo-state"`，并严格校验、裁剪字段后再跨 IPC。
- Todo 是 transcript 快照卡片，不是常驻 widget；每次更新保留一条历史快照。
- 不复用 pi-tui ANSI renderer；React 使用同一状态协议独立渲染。
- 不改变 `todo_write` 的执行、授权或持久化语义。
- Zustand 仍不保存 Chat transcript 或 Todo 正文。

## Open questions

无。
