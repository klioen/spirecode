# Intent: SpireCode 品牌图标
Author: User。 Status: accepted。

## Problem

当前应用图标是青黄双环图形，表达更接近协作或太极，没有直接体现 SpireCode 的产品名称、代码工具属性与向上构建的品牌含义。应用内侧栏和空工作台仍用纯文本字母 `S`，与安装包图标也不一致。

## Proposed outcome

设计并应用统一的“Code Spire”品牌图标：以代码括号构成向上收拢的尖塔轮廓，中央负空间呈现 `S` 的动势。图标在 macOS、Windows、Linux 安装产物和应用内品牌位置保持一致，在 16px 到 1024px 均可辨识。

## Affected users and systems

- macOS Dock、Windows 开始菜单、Linux Desktop 中的 SpireCode 用户。
- Electron builder 的 macOS、Windows、Linux 图标资源。
- Project Rail 和空工作台中的应用品牌标记。

## Constraints

- 保留 SpireCode 现有深色界面、青色主强调色和少量暖黄色高光。
- 图标不能依赖文字、细线或复杂纹理来识别。
- 维护一个矢量 SVG 源；平台位图资源必须由同一几何生成。
- 不引入新的 npm runtime dependency。
- 不改变 Renderer 安全边界、IPC 或业务功能。

## Open questions

无。用户已确认“代码尖塔 + S 负空间”方向。
