# Intent: 修复主题切换出现电脑模式
Author: keliangliang。 Status: accepted。

## Problem

右上角主题切换当前在 `system → light → dark` 三种状态间循环，除了白天和夜晚图标还会显示电脑图标。系统跟随是设置策略，不应表现成第三套可见主题；电脑图标让用户误以为应用提供了第三种主题。

## Proposed outcome

主题按钮只提供白天与夜晚两种明确状态，点击时在 `light ↔ dark` 之间切换，界面永远只显示太阳或月亮图标。

## Affected users and systems

所有使用右上角主题切换按钮的 SpireCode 用户；影响 Renderer 的主题 store、主题按钮及本地持久化状态。

## Constraints

- 保留现有浅色和深色配色、Monaco 与 xterm 的主题联动。
- 兼容本地存储中已有的 `system` 值，并按启动时的系统外观迁移。
- 不新增第三种主题状态或额外设置入口。

## Open questions

无。用户已确认改为纯二态主题切换。
