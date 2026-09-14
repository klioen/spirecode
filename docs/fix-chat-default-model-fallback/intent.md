# Intent: 修复 Chat 首次会话忽略默认模型
Author: keliangliang。 Status: accepted。

## Problem

SpireCode Chat 首次创建 pi session 时，没有使用 `~/.pi/agent/settings.json` 配置的 `traex/gpt-5.6-sol`，而是静默 fallback 到 Ollama，进而触发 Ollama 启动 `llama-server`。

现场复现确认 `ModelRuntime.create()` 初始没有由扩展注册的 TraeX 模型；`createAgentSession()` 加载扩展后 TraeX 才进入 runtime，但首次会话已完成模型 fallback。同一 runtime 创建第二个会话才会使用配置的默认模型。

## Proposed outcome

- 全新 Chat session 在接受第一条消息前使用配置的默认 provider/model。
- 历史 session 继续恢复其保存的模型，不被当前默认模型覆盖。
- 配置了默认模型但扩展加载后仍不可用时，创建会话明确失败，不静默调用其他 provider。

## Affected users and systems

SpireCode Chat 用户；Electron Main 的 pi SDK adapter、pi 扩展 provider 初始化和 session 模型恢复。

## Constraints

不修改用户 pi 配置，不硬编码 TraeX，不改变历史会话模型语义，不把凭据或 provider 细节传给 Renderer。

## Open questions

无。
