# Spec: Chat 严格应用 pi 默认模型
Status: accepted。 Implements: `docs/fix-chat-default-model-fallback/intent.md`。

## Requirements

- adapter 必须从 pi `SettingsManager` 读取当前 cwd 合并后的默认 provider/model。
- 创建全新 session 时，应先允许 ResourceLoader 注册扩展 provider，再解析配置的默认模型并通过 `session.setModel()` 应用。
- 打开已有消息的 session 时不得覆盖 session 保存的模型。
- 默认 provider 和 model 均已配置，但扩展加载后模型不存在或未配置认证时，创建全新 session 必须失败。
- 未配置默认模型时保留 pi SDK 自身 fallback 行为。
- adapter 继续共享一个 `ModelRuntime`，避免重复 provider runtime。

## Design

扩展 `PiSdk` seam，暴露 `SettingsManager.create()`。每次加载 session 时创建 cwd-aware settings manager，并显式传给 `createAgentSession()`。创建完成后根据 `sessionManager.buildSessionContext().messages` 判断是否为历史 session：只有全新 session 才读取默认 provider/model，从已经完成扩展加载的共享 `ModelRuntime` 查找模型、验证认证并调用 `session.setModel()`。

历史 session 依赖 SDK 原有恢复逻辑。默认模型缺失时抛出的错误由现有 Chat error mapper 转换为不泄露凭据的 `MODEL_UNAVAILABLE`。

## Proof

- 回归测试复现首次 session 初始 fallback，但 adapter 在返回前切换到配置默认模型。
- 测试历史 session 不调用 `setModel()`。
- 测试配置默认模型不可用时拒绝创建。
- `pnpm check` 全部通过。
