# Intent: Chat 模型、思考级别与 Slash Command
Author: keliangliang。 Status: accepted。

## Problem

SpireCode Chat 输入框当前只能发送文本或停止运行，用户无法在会话内查看和切换 pi 的当前模型、调整模型支持的思考级别，也无法发现已加载的 extension command、prompt template 和 skill command。用户必须离开 GUI 修改配置或改用 pi TUI，Chat 无法完整承载常用输入工作流。

## Proposed outcome

- 在 Chat 输入框底部提供当前会话的模型选择器和思考级别选择器。
- 思考级别使用英文显示：`Off / Minimal / Low / Medium / High / XHigh / Max`。
- 模型列表只包含当前 pi runtime 已配置认证且可用的模型；思考级别随所选模型能力动态变化。
- 输入 `/` 时展示当前会话动态加载的 Slash Command 自动补全，支持 extension commands、prompt templates 和 skill commands。
- `/model [provider/model]` 与 `/thinking [level]` 可直接操作原生选择能力并与底部选择器同步。
- 不向 Renderer 暴露 pi SDK、认证材料、扩展实例或任意文件路径。

## Affected users and systems

SpireCode Chat 用户；React Chat composer、Renderer bindings、Electron IPC、ChatService、pi SDK adapter 和会话持久化。

## Constraints

- Renderer 保持 sandbox、context isolation 和窄化 IPC，不接收 Node 或 pi SDK 权限。
- 模型和命令必须从运行中的 pi session 动态发现，不能在前端维护静态目录。
- 模型、思考级别变更必须使用 pi AgentSession API 并保留其 session JSONL 持久化语义。
- Agent 运行中禁用模型和思考级别切换；普通 extension command 仍按 pi SDK 既有语义执行。
- 不把仅适用于 pi TUI、且 SpireCode GUI 未实现的 built-in command 暴露为可执行项。

## Open questions

无。
