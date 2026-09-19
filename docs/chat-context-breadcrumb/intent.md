# Intent: Chat 上下文三级面包屑

Author: User. Status: accepted.

## Problem

Chat 顶部当前把 Project、Worktree 和 Branch 混合显示为 `project ▼ worktree · branch`，无法清晰表达三者的层级关系。

## Proposed outcome

顶部上下文导航按 `project > worktree > branch` 的顺序显示三级面包屑，使用户能立即确认当前 Chat 所属的项目、工作树和分支。

## Affected users and systems

- 使用 SpireCode Chat 和中央工作区的用户。
- Renderer 的 Workbench 顶栏与相关样式、组件测试。

## Constraints

- 复用 Renderer 已有的 Project/Worktree catalog 数据。
- 不新增 IPC 或 Main 进程能力。
- 无活动 Worktree 时继续显示 `No project open`。

## Open questions

无。展示顺序和范围已由用户确认。
