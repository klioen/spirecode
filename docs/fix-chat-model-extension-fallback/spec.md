# Spec: 扩展关闭后的 Chat 默认模型 fallback
Status: accepted。 Implements: `docs/fix-chat-model-extension-fallback/intent.md`。

- `configuredDefaultModel` 先检查 settings 默认模型；若存在且 provider 有认证，返回该模型。
- 若默认模型不可用，遍历 `modelRuntime.getAvailable()`，选择第一个 `PiModel` 且 `hasConfiguredAuth(provider)` 为 true 的模型。
- fallback 不写回 settings；只作为当前新 session 的 model 参数。
- available models 为空或全部未认证时，抛出原错误 `Configured default model ... is unavailable`，由 ChatService 映射为 `CHAT_MODEL_UNAVAILABLE`。
- 既有有效默认模型测试的调用顺序保持不变；新增 unavailable-default fallback 和 no-fallback 测试。
