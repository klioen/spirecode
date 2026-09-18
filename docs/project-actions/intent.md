# Intent: Project 级管理入口
Author: product owner。 Status: accepted。

## Problem

Project 后端已经支持 close、reveal 和 copy path，但 Projects 侧栏没有 Project 级入口。用户只能打开和切换项目，无法从 UI 关闭项目、在 Finder 中定位项目目录或复制项目路径。

## Proposed outcome

每个 Project heading 提供可访问的管理菜单：

- Close project：从 catalog 移除项目，不删除磁盘目录；成功后选择剩余项目的可用 worktree。
- Reveal in Finder：打开项目目录。
- Copy path：复制项目 canonical path，并给出短暂成功反馈。

## Constraints

- 所有操作继续通过现有 typed IPC/API；Renderer 不接触路径或 shell。
- Close 前由 Main 负责终止 watcher、PTY 和 Chat 等运行资源。
- 本批不增加删除磁盘目录能力。
- Project 菜单与 Worktree 菜单互斥，点击外部关闭。

## Open questions

无。
