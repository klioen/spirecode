# Intent: Settings Memory 文档查看
Author: 用户。 Status: accepted。

## Problem
SpireCode 的 Settings 中无法查看 Pi Memory 已生成的核心文档，用户需要离开应用并直接访问 `~/.pi/agent/memories`。

## Proposed outcome
在 Settings 中增加 Memory 模块，只读展示 `memory_summary.md` 和 `MEMORY.md`，并允许分别配置 Phase 1/Phase 2 的 Model 与 Reasoning Effort。用户可在两个文档之间切换，无需打开项目或访问文件系统。

## Affected users and systems
- 使用 Pi Memory 的 SpireCode 桌面端用户。
- Renderer Settings 界面、类型化 IPC、Electron Main 的只读 Memory 数据访问。

## Constraints
- 文档范围只包含 `memory_summary.md` 和 `MEMORY.md`，不展示 rollout summaries、skills、raw memories、worker log 或 SQLite 数据。
- 配置范围只包含 Phase 1/Phase 2 Model 和各自的 Reasoning Effort，不增加 Recall、Automatic Processing 或 token limit 等其他设置。
- Memory 是全局功能，不依赖当前 project/worktree。
- Renderer 不得获得 Node、任意文件系统、Shell、原始 IPC 或绝对路径。
- Main 只允许读取固定逻辑文档 ID，不能接受 Renderer 提供的路径。
- 默认读取 `~/.pi/agent/memories`；若设置 `PI_MEMORY_DIR`，与 pi-memory 使用相同覆盖目录。
- 功能严格只读，不创建、修改或删除 Memory 数据。

## Open questions
无。
