# Intent: 精简 Chat 空状态与输入提示
Author: 用户。 Status: accepted。

## Problem
Chat 中的空会话提示、快捷键提示和英文输入占位增加了不必要的界面文案。

## Proposed outcome
移除空会话提示与快捷键提示，并将空闲和运行中输入框占位统一为“随心输入”。

## Affected users and systems
SpireCode Chat Renderer 界面。

## Constraints
保留 Enter 发送、Shift+Enter 换行和 IME 防误发行为；不增加顶部状态栏；不展示 pi token 状态或模型容量排队状态；其他 Chat 文案不变。

## Open questions
无。
