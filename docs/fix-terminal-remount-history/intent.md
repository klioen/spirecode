# Intent: 修复切换 Project 后 Terminal 内容丢失
Author: keliangliang。 Status: accepted。

## Problem

某个 Project 打开的 Terminal 在切换到其他 Project 后会卸载 xterm view。PTY 仍继续运行，但前端 stream 只缓存无 subscriber 时的新输出；切回原 Project 并重新打开 Terminal 时，先前已经显示过的内容无法重建，因此画面为空。

## Proposed outcome

Terminal 输出在前端保留有界历史；任何 xterm view 重新订阅时先重放历史，再继续接收实时输出。只有真正关闭 Terminal tab 时才清理历史。

## Affected users and systems

Terminal 中央 tabs、project 切换、terminalStream 和 xterm view 生命周期。

## Constraints

- 不重启或重新 attach PTY。
- 历史缓存必须有内存上限。
- 保持原始 byte chunk 的顺序和 UTF-8 streaming decode。
- exit/error 状态可重放，但不能重复副作用或产生新 PTY。

## Open questions

无。
