# Intent: Pi App 视觉主题与层级优化
Author: keliangliang。 Status: accepted。

## Problem

当前 UI 大量使用相近的黑灰色，panel、header、editor、tab 和选中行之间的层级差异很弱；边框不清晰，选中态主要依赖一条细线，项目和文件等列表难以快速识别。应用也只有固定深色主题。

## Proposed outcome

建立统一的浅色/深色语义主题：浅色以蓝绿色为主色，深色以浅绿色为强调色。Panels、Header、Editor、Terminal、边框、hover、selected、focus 和 feedback 都使用语义 token；选中状态同时具备背景、文字、图标和强调边框，整体清晰但不过度鲜艳。

## Affected users and systems

Workbench、Projects、Editor tabs、Files、Changes、Terminal、Monaco、全局反馈和空状态。

## Constraints

- 保留当前紧凑开发工具布局，不改功能和信息架构。
- 浅色主题主色使用低饱和蓝绿色；深色主题使用低饱和浅绿色。
- 不使用高饱和荧光色或大面积品牌色背景。
- 边框和选中态必须在两个主题下都清晰可见。
- Monaco 和 xterm 必须跟随主题，不能保留固定深色画布。
- 组件不继续新增 raw hex；新增颜色集中在主题 token。

## Open questions

主题切换入口采用右上角图标按钮，默认跟随系统并允许用户覆盖。
