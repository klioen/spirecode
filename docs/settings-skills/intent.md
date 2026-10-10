# Intent: Settings Skills 管理
Author: 用户。 Status: accepted。

## Problem
SpireCode 的 Settings 目前只能查看只读 Extensions catalog，用户无法看到当前工作区中 Agent 可发现的 Skills，也无法在不修改 Pi 配置或 Skill 文件的情况下控制哪些 Skills 会进入新 Agent Session。

## Proposed outcome
在 Settings 左侧增加独立的 Skills 模块，展示当前工作区最终可发现的全部 Skills，并按系统内置、用户全局、项目级来源分组。每个 Skill 显示名称、描述和来源，并提供单 Skill 启停开关；变更持久化在 SpireCode 自有设置中，仅对新建 Agent Session 生效。

## Affected users and systems
- 使用 SpireCode Agent Chat 的桌面端用户。
- Renderer Settings UI、类型化 IPC、Electron Main Settings 领域。
- Pi SDK resource loader 与新 Agent Session 初始化流程。
- Pi 用户级和项目级 Skills；主线已移除历史 bundled `pi-sdlc` 依赖，因此当前没有 SpireCode 内置 Skill。

## Constraints
- 展示范围覆盖 SpireCode 内置 Skills、Pi 用户全局 Skills，以及当前工作区的项目级 Skills。
- 开关粒度为单个 Skill，不按 package 整体联动。
- 不修改 `~/.pi/agent/settings.json`、项目 `.pi/settings.json` 或任何 `SKILL.md`。
- 已运行的 Agent Session 不热更新；变更仅应用于新建 Session。
- 禁用后 Skill 不得进入新 Session 的系统提示词，也不得注册对应 `/skill:name` 命令。
- Renderer 不得获得 Node、任意文件系统、Shell、原始 IPC 或绝对路径操作能力。
- 项目级 Skill 只在用户已通过 SpireCode 打开、由 ProjectService 解析的 worktree 中加载；该显式打开动作沿用 Agent 工具对 worktree 的既有信任边界，并且 Skill 不得通过符号链接逃逸工作区。

## Open questions
无。需求口径已确认：展示最终可发现集合，按系统内置、用户、项目分组，并支持单 Skill 开关。
