# Intent: 修复文件树空路径和 Changes spawn EBADF
Author: keliangliang。 Status: draft。

## Problem

打开项目后，文件区域报 `relativePath is empty or too large`，导致根目录无法加载、文件无法展示；Changes 区域报 `Showing last result · spawn EBADF`，无法刷新 Git 状态。

现场诊断确认存在两个独立但同时暴露的问题：

- Renderer 使用空字符串表示 worktree 根目录，但 Main IPC 的通用文本校验拒绝所有空字符串。
- 打包应用为所有持久化 worktree 使用 Chokidar 递归监听。当前 Main 进程持有约 10,700 个文件描述符，其中约 10,674 个为普通文件，主要来自被监听仓库的 `node_modules`；文件描述符压力最终使 Git 子进程在 spawn 阶段报 `EBADF`。

## Proposed outcome

- 文件树可用 `relativePath: ""` 读取 worktree 根目录，但文件读取、diff 和其他文本参数仍拒绝空值。
- 文件监听不再按仓库文件数量线性占用文件描述符；多个持久化项目存在时，Git status 仍能稳定创建子进程。
- 文件系统与 Git 变化通知、外置 Git metadata 监听、关闭清理行为保持可用。

## Affected users and systems

所有打开项目的用户；Renderer 文件树、Electron IPC 参数校验、Main 文件监听器和 Git 子进程执行。

## Constraints

- Renderer 继续只传 `worktreeId + relativePath`，不放宽路径穿越和 symlink escape 防护。
- 不通过重试或隐藏 `EBADF` 掩盖资源问题。
- 不为修复引入 shell command string；Git 继续使用参数数组。
- 保持现有 watcher 事件 topic 和 payload 契约。

## Open questions

无。根因已由调用链、运行进程 FD 数量和打开文件样本确认。
