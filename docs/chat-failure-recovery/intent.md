# Intent: Chat 失败状态恢复路径
Author: product owner。 Status: accepted。

## Problem

MVP 发布审计发现：Chat 会话进入 `failed` 或 `auth-required` 状态后，Composer 被整体禁用且没有任何恢复动作。首次使用的用户遇到模型未认证（`CHAT_AUTH_REQUIRED`）时只看到一条错误文本，既不知道如何配置 pi 认证，也无法在修复后原地恢复会话，只能关闭或新建 Chat。Chat History 加载失败同样只显示错误文本，没有重试入口。

## Proposed outcome

1. `failed` / `auth-required` 状态下的 Chat 显示错误码、消息和明确的恢复操作：
   - `Retry` 按钮重新 attach 会话并恢复到正常 idle/failed 状态；
   - `auth-required` 额外提示如何配置 pi 认证（`~/.pi/agent`，或先在终端运行 `pi` 完成认证）。
2. Retry 过程显示 loading，不再保留旧的失败提示误导用户。
3. Chat History 加载失败时显示错误和 `Retry`，重试成功后回到正常分组列表。

## Affected users and systems

- 首次使用 SpireCode 且 pi 尚未认证/配置模型的用户；
- 遇到 provider 瞬时故障的用户；
- Renderer 的 `ChatView`、`ChatHistory` 及其测试。

## Constraints

- 不新增 IPC 命令：Retry 复用现有 `chat_session_attach` / `chat_session_list`。
- 不在本批实现应用内登录/认证 UI 或 API key 输入；认证仍在 pi 配置中完成。
- 错误信息不得包含凭据、完整 transcript 或环境值。
- Composer 在 failed/auth-required 下仍保持禁用，避免向已知失败的会话发送输入。

## Open questions

- 应用内认证向导（登录 URL、API key 配置界面）作为后续独立变更，取决于 pi 认证流程的产品化决策。
