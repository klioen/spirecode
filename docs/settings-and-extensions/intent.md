# Intent: 设置中心与 Extensions 管理
Author: 用户。 Status: accepted。

## Problem
SpireCode 右上角没有统一设置入口，用户也无法查看和开关来自 SpireCode 与 Pi 的 Extensions。

## Proposed outcome
在右上角增加设置图标和设置模态框。模态框包含通用、Agent、Extensions、编辑器、终端分类；首个交付完整实现 Extensions 列表及开关。列表覆盖全局与当前工作区中的 `.spirecode`、`.pi` 扩展及 Pi 配置声明的扩展。

## Affected users and systems
- SpireCode 桌面端用户。
- Renderer 设置界面、Electron Main 设置领域、类型化 IPC、Pi Agent 新会话初始化。

## Constraints
- Renderer 不得获得 Node、任意文件系统、Shell 或原始 IPC 权限。
- Extensions 以 `worktreeId` 为作用域，由 Main 解析真实路径。
- 开关不能删除或重命名用户扩展文件。
- Extensions 可执行任意本地代码，项目扩展必须明确标注作用域和安全风险。
- 已运行 Agent 不强制中断；变更用于新会话。

## Open questions
- 非 Extensions 分类中的高级设置在后续变更中逐步接入；本次只展示已有可用能力，避免无效控件。
