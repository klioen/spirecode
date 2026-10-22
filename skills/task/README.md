# 通用 Task Skill

`task` 是一个标准 Agent Skill：从目标、输入、允许动作、产物和验收检查建立
执行约定，而不是通过 `coding / review / diagnose` 枚举分派工作。
同一个 Skill 可执行实现、PR/MR 审查、排查、文档编写和其他有界任务。

## 文件

- `SKILL.md`：通用执行流程和行为边界。
- `references/report.md`：通用报告结构及现有 SpireCode 上报协议的映射。
- `references/examples.md`：不同任务目标的具体示例，不是类型注册表。

Skill 版本为 `1.0.0`，只有 Markdown 文件，不安装依赖，不注册工具或执行脚本。

## 在 SpireCode Task 中使用

无需安装目录或修改全局 `skills` 配置。Main 将 `SKILL.md` 正文和报告规范作为
只读文本编译进应用，仅在 TaskRun 的首条 input message 中自动注入实际内容，
同时附带 Skill 版本、SHA-256、本次任务要求和 `runId`。用户的 title/description
保持原值，普通 Chat 和任务文案优化不会自动注入，也不新增全局开关。

首次发送 input 前，Main 在现有 Run journal 的 `task_skill` step 保存最大
32 KiB 的规范快照。恢复后重新发送仍使用同一快照；已发送的 input 不会重复
提交。新 Run（重试或请求修改）各自保存执行时的版本，即使复用旧 Session。
同一 Run 补交报告只引用原版本和摘要，不重复注入整份 Skill。历史 Run 没有
快照时保留旧执行语义，不用当前版本冒充其原始规范；快照损坏时停止新输入。

实际组合后的 input 随 Pi 会话持久化和归档，规范快照不依赖 worktree。这里只
编译 Main 的固定指令文本，未恢复其他内置 packages/extensions 的自动加载。
应用更新需要重新构建/安装；本仓库中的 Skill 修改不会热更新正在运行的 Run。

## 在其他 Pi 会话中显式使用

目录仍是标准 Agent Skill。如果确实希望在普通 Chat 中使用，可以主动将目录
路径追加到自己的 `skills` 配置并使用 `/skill:task`；这不是 SpireCode Task 的
前置条件。要保持 Task-only 行为，不要全局配置该目录。已有会话不会被热修改。

## 约定示例

- “审查这个 PR/MR，交付带位置、严重程度和证据的问题清单；不修改代码，
  不对外发布。报告注明实际审查的 commit 和未覆盖范围。”
- “排查登录失败原因，交付原因判断、证据和待验证假设；不修改代码。
  无法证明原因时如实说明缺口，不自动实施修复。”
- “实现指定行为，在已有许可范围内验证，交付代码改动和验证报告；
  不改无关模块，不自动 commit、push 或发布。”

## 能力边界

报告类任务不会因发现问题而获得改代码的授权。验收检查由明确要求和可验证
的目标导出；报告中逐项评估，最终仍由用户验收。在 SpireCode 中沿用
`task_report_result` 的现有字段，丰富产物和检查结果放在 `summary`，
没有可执行检查时允许 `tests: []`，不修改数据库协议。

**Skill 是行为指令，不是强制权限沙箱。** 现有 Task Session 仍有普通 coding
能力。本次不承诺阻止模型通过 shell 修改代码；强制只读需另行实现 Main/工具
或 OS 级能力策略。也不实现 PR/MR 地址解析器、远端 provider 集成、产物 schema
注册或任务级验收字段。缺少权限、输入或工具时，Skill 要求
报告阻塞，不伪造结果、不自动安装工具或更改认证。
