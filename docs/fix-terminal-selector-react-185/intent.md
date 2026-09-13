# Intent: 修复启动时 React #185
Author: keliangliang。 Status: accepted。

## Problem

应用恢复一个已有项目且该项目尚无 Terminal tab 时，`TerminalPanel` 的 Zustand selector 每次返回新的空数组，React 19 认为 external-store snapshot 持续变化并触发无限更新，最终显示 Minified React error #185。

## Proposed outcome

空 Terminal 状态使用稳定 snapshot；应用恢复已有项目时正常显示工作台，不发生无限渲染。增加组件级回归测试覆盖该启动状态。

## Affected users and systems

所有已打开项目但尚无 Terminal tab 的用户；React Terminal 面板和 Zustand selector。

## Constraints

不改变 Terminal 业务行为，不通过关闭 StrictMode 或吞掉 React 错误规避问题。

## Open questions

无。
