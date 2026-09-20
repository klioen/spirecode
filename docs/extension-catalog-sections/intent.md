# Intent: Extensions 按系统内置与用户自定义分组

> [!IMPORTANT]
> **Superseded.** 本文记录曾经区分 bundled 与 user extensions 的历史需求。现行方向见 [`docs/remove-pi-extensions-dependency/`](../remove-pi-extensions-dependency/intent.md)：移除 bundled catalog，Extensions 只反映用户通过标准 Pi settings 配置并实际解析到的资源。

Author: 用户。 Status: superseded。

## Problem
Settings 的 Extensions 当前把 SpireCode、Pi、package 以及 global/project scope 混在同一个列表中，用户无法快速区分应用自带能力和自己在 Pi settings 中配置的扩展；当前 bundle 还包含不再需要的 `pi-failover`。

## Proposed outcome
Extensions 页面分为“系统内置”和“用户自定义”两个区块。系统内置固定展示 SpireCode 随应用发布的 `pi-web-access`、`pi-memory`、`pi-todo`、`pi-subagents`、`pi-goal`、`pi-plan`；用户自定义展示 `~/.pi/agent/settings.json` 中显式声明的 packages/extensions。两类扩展均沿用新 Agent session 生效的启停语义。`pi-failover` 从 SpireCode bundle 和默认加载集合移除。

## Affected users and systems
- SpireCode Settings → Extensions 用户。
- Electron Main 的 extension catalog、启停过滤与 Pi Agent 新会话资源加载。
- Pi extension staging、App/DMG resources、完整性检查与 smoke tests。

## Constraints
- Renderer 不读取 settings 或应用 bundle，不获得文件系统路径操作能力。
- 系统内置集合必须与实际打包和运行时加载集合一致，不能在 UI 中另写一份漂移列表。
- 用户自定义配置只由 Main 解析；不修改 `~/.pi/agent/settings.json`，开关继续写入 SpireCode 自有覆盖状态。
- 同一用户 package 的多个 extension entry 整体启停；同名 bundled package 不重复展示或加载。
- 已有 Agent session 不热卸载 extension；变更对新会话生效。
- `pi-sdlc` 是 skills package，不显示为 extension。

## Open questions
- 无。`pi-env` 不打包；`pi-failover` 移除；系统内置 extension 集合固定为上述六项。
