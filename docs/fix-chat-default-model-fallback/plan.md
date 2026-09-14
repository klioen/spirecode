# Plan: 修复 Chat 首次会话默认模型 fallback（from `docs/fix-chat-default-model-fallback/spec.md` 2026-09-15）

## Files that change

- `electron/domains/chat/piAdapter.ts`：注入 cwd-aware settings，扩展加载后为全新 session 严格应用默认模型。
- `electron/domains/chat/piAdapter.test.ts`：覆盖首次创建、历史恢复和不可用默认模型。
- `docs/fix-chat-default-model-fallback/{intent,spec,plan}.md`：记录根因、设计与证明。

## Order of work

1. 增加首次会话错误 fallback、历史会话和不可用模型测试，确认回归用例先失败。
2. 扩展 adapter 的 SDK seam，读取默认模型并区分新会话与历史会话。
3. 在扩展注册完成后解析、验证并设置全新 session 模型。
4. 运行 Chat 针对性测试和 `pnpm check`。
5. 重新 bundle、替换应用并验证新 Chat session 的 session JSONL 首个 `model_change` 为配置默认模型，且不启动新的 Ollama 请求。

## Risks

最危险的是覆盖历史 session 的模型，破坏对话连续性；通过在创建前读取 session context 是否已有 messages 严格区分。不能在扩展加载前解析模型，也不能硬编码 provider。若设置模型失败，必须 dispose 已创建 session，避免泄漏运行时资源。

## Proof

- 新增测试 red-green。
- `pnpm vitest run electron/domains/chat/piAdapter.test.ts electron/domains/chat/chatService.test.ts`
- `pnpm check`
- bundle、安装并进行真实新会话模型验证。
