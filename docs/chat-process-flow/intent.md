# Intent: 对齐 VolcClaw 最新 Chat 过程流
Author: user。 Status: accepted。

## Problem

SpireCode 当前将“深度思考”和连续工具调用渲染成两种独立折叠块。VolcClaw 当前产品层已经改为统一的 TransformPart 过程流：Reasoning 与 Tool 按真实顺序组成步骤，单步骤直接展示，多步骤才聚合；每个步骤前有语义 icon，整体无边框、灰色弱化，运行中的当前步骤使用 shimmer。

同时，SpireCode 当前消息列表缺少成熟的流式滚动跟随，Composer 的尺寸和阴影也比 VolcClaw 普通会话更重。

## Proposed outcome

- 将相邻 Thinking 与 Tool 统一投影为过程流，保持原 timeline 顺序。
- 单个过程步骤直接显示；两个及以上步骤折叠为过程摘要。
- 深度思考、过程摘要、每个工具步骤前都显示 16px 语义 icon。
- 已完成多步骤显示“已执行 X 项操作”；运行中优先显示当前工具语义并使用灰色 shimmer。
- Thinking 展开内容使用左侧浅灰引用线；Tool 展开后显示入参与输出。
- 折叠箭头默认隐藏，只在 hover、focus 或展开时出现。
- 普通 Thread/Composer 对齐约 960px；Composer 使用 24px 圆角、紧凑普通会话高度、无常驻大阴影。
- 增加不抢阅读位置的流式贴底和“回到底部”按钮。

## Affected users and systems

- SpireCode Chat 用户。
- 仅 Renderer Chat 组件、样式、测试和对应 SDLC 文档。

## Constraints

- 不修改 Electron Main、preload、IPC、Chat API、runtime、reducer、wire types 或持久化。
- 使用现有 Remix Icon，不增加图标依赖。
- 保持 Markdown 原始 HTML 禁用和安全 URL 策略。
- 保持 Enter、Shift+Enter、IME、64 KiB、follow-up、Stop 恢复语义。
- 不增加头像、Pi 标签、Copy、Like/Dislike、时间戳等消息 chrome。

## Open questions

无。
