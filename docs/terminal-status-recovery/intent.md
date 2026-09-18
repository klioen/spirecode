# Intent: Terminal 退出状态可见性与重启
Author: product owner。 Status: accepted。

## Problem

终端 PTY 退出或出错后，UI 只把状态写进 store，不展示给用户：tab 标题仍是 `TerminalN`，终端视图内没有退出提示，输入也无反馈。用户无法区分正在运行和已经退出的终端，也没有恢复入口（审计 P1 断点）。

## Proposed outcome

1. Terminal tab 在 `exited` / `error` 状态显示状态标记。
2. 活动的 terminal tab 处于非 running 状态时，终端区域显示状态横幅（`Process exited.` / `Process failed.`）和 `Restart` 按钮。
3. `Restart` 关闭旧 PTY、移除旧 tab，并按现有创建流程启动新终端；新终端获得新的编号标题。

## Affected users and systems

- 使用 Terminal 的所有用户；
- `EditorPane`（tab 标记、状态横幅、restart 逻辑）与测试。

## Constraints

- 不新增 IPC 命令；Restart 复用 `terminal_close(force)` + `terminal_create` + `terminal_attach`。
- 不实现"原地复用同一 terminalId 的 PTY 重启"——后端 registry 以 terminalId 为生命周期键，新进程即新终端。
- TerminalInstance 组件本身不改动（状态更新已存在）。
- xterm 显示的退出输出（shell 自身的 exit 信息）不在本批处理。

## Open questions

- write-after-exit 的输入错误提示由后续 P1（Terminal UX 完善）统一处理。
