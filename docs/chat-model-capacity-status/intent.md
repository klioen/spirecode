# Intent: 在 Chat 显示模型容量等待状态
Author: 用户。 Status: accepted。

## Problem
TraeX 模型容量不足时，pi TUI 会显示 `TraeX is waiting for model capacity · position 362`，但 SpireCode Chat 没有反馈，用户会误以为请求卡住。

## Proposed outcome
模型容量排队期间，在 Chat 输入框上方显示 pi provider 提供的临时等待文案；状态更新时替换，释放后自动消失。

## Affected users and systems
SpireCode Chat、Electron Main 中的 pi SDK adapter、Chat 事件协议。

## Constraints
不增加顶部状态栏；不显示 token 统计；不与用户 follow-up 队列混淆；不硬编码排队位置；状态内容由 pi extension UI API 提供。

## Open questions
无。
