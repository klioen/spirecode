# Spec: Chat 失败状态恢复路径
Status: accepted。 Implements: `docs/chat-failure-recovery/intent.md`。

## 1. Scope

### Included

- `ChatView` 在 `failed` / `auth-required` 状态渲染可操作错误横幅：
  - 显示错误码与消息；
  - `Retry` 按钮触发重新 attach；
  - `auth-required` 附带认证指引文案。
- Retry 将 runtime 状态置回 `loading` 后重新执行 attach 流程；成功后加载 config 并恢复交互。
- `ChatHistory` 错误状态增加 `Retry`，重试成功后恢复分组渲染。

### Excluded

- 应用内认证/登录 UI、API key 输入。
- 失败 turn 的消息级 resend/edit-and-retry。
- Composer 在失败状态下重新启用。
- Chat rename/delete/export 等会话管理能力。

## 2. ChatView 行为

- attach 失败（含 `CHAT_AUTH_REQUIRED`、`CHAT_FAILED`）与运行中 `session_error` 都落入同一错误横幅。
- 横幅内容：

```text
[错误码] 消息
(auth-required 时) 认证指引：Sign in to pi by running `pi` in a terminal or configuring auth under ~/.pi/agent, then retry.
[Retry]
```

- Retry 语义：
  1. 将该 session 的 runtime 状态设置为 `loading`；
  2. 重新运行 attach effect（通过递增 retry token 触发）；
  3. attach 成功后照常 hydrate 并加载 config；
  4. attach 再次失败则回到同一横幅。
- Retry 期间不显示旧错误横幅（loading 状态下隐藏）。
- 认证指引是静态文本，不自动打开外部 URL。

## 3. ChatHistory 行为

- `list` 失败时在错误状态内显示 `Retry`。
- 点击 Retry 重新调用 `api.list`；成功后正常渲染，失败则回到错误状态。

## 4. 验收

- attach 抛出 auth/failed 错误后：横幅包含错误码与 Retry；Composer 禁用。
- 点击 Retry 后 `attach` 被再次调用；成功后横幅消失、Composer 可用。
- auth-required 横幅包含 `~/.pi/agent` 指引。
- ChatHistory 失败 → Retry → 成功恢复列表。
- 既有 `pnpm check` 全绿。
