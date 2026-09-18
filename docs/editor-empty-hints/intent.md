# Intent: 编辑器空状态补充 Chat Agent 提示
Author: product owner。 Status: accepted。

## Problem

编辑器空状态只提示如何打开 Terminal，没有提示用户可以从 tab header 创建 Chat Agent，Agent 能力不够显眼。

## Proposed outcome

在现有 `Open a terminal from the tab header` 提示旁增加 `Open a Chat Agent from the tab header`，不改变交互行为。

## Constraints

- 仅修改空状态 UI 文案和对应测试；
- 不新增按钮或快捷键；
- 保持现有 minimal chrome 风格。
