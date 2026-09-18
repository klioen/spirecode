# Spec: Chat history 删除会话

Status: approved。

## Requirements

1. 每个 Chat history 条目在 hover、focus-within 时显示独立删除按钮；删除按钮具有包含会话标题的可访问名称，点击不能触发打开会话。
2. 点击删除后显示二次确认对话框，明确说明会话标题及“移到废纸篓”；取消不产生副作用。
3. 确认期间仅锁定目标条目的删除操作并提供忙碌状态，避免重复提交；History 浮层不得因确认交互被误关闭。
4. 删除请求只传 `worktreeId` 和 `sessionId`。Main 重新调用 pi session list，在对应 canonical worktree cwd 中按 sessionId 找到目标，拒绝不存在、无路径、路径不在 pi sessions 根内或归属不匹配的记录。
5. Main 使用 Electron `shell.trashItem` 将 session JSONL 移到系统废纸篓；不使用 shell 命令，不回退到 `unlink` 或永久删除。
6. 若会话在 Main runtime 中且 `isStreaming` 或非 idle，则返回 `CHAT_SESSION_BUSY`，不改变文件、runtime、订阅和 UI。
7. 对 idle 会话，Main 先停止该会话的事件投递并释放 session；释放成功后移到废纸篓。删除成功后清理 ownership/runtime 记录。若 trash 失败，错误返回 Renderer；之后仍可通过列表重新打开该文件（若文件仍存在）。
8. Renderer 删除成功后从当前 History 列表移除该项。如果对应 Chat tab 已打开，则关闭该 tab、detach ChatView 订阅并清理 `chatRuntime` 缓存；其他 tab 和当前选择按 editor store 既有关闭规则处理。
9. 删除失败时 History 保持该项，已打开 tab 不关闭，通过现有全局错误机制展示可理解错误。
10. 删除当前 active idle Chat 被允许；删除成功后 History 浮层保持打开，焦点回到合理的相邻条目、搜索框或空态。

## Design

### Main 与持久化

- `PiAdapter` 增加按 cwd 解析删除目标的能力，返回由 SDK `SessionManager.list(cwd)` 得到的 session info/path，不信任 Renderer 路径。
- `ChatService.delete(worktreeId, sessionId)`：
  1. canonicalize worktree root；
  2. 检查内存 session 状态，busy 则拒绝；
  3. 从 adapter list 解析唯一目标和 session path；
  4. 验证目标 cwd 与 canonical root 一致、path 是实际文件且位于 pi sessions 存储根；
  5. 对已加载 idle session unsubscribe + dispose；
  6. 调用注入的 `trashItem(path)`；
  7. 成功后清理 sessions/owners。
- `trashItem` 从 `AppState` 注入 Electron `shell.trashItem`，单元测试使用 fake，避免 ChatService 直接依赖 Electron。

### IPC 与 Renderer API

- 增加 allowlisted `chat_session_delete` command，参数仅 `worktreeId`、`sessionId`。
- 扩展 bindings、`ChatApi.delete` 和 `hostChatApi`；删除完成时清理该 session 对应 renderer subscription，使用现有 generation/identity 检查避免删掉更新的订阅。

### UI

- `ChatHistory` 增加 `onDelete`，本地维护 sessions、目标确认状态、pending sessionId 和 mutation error；成功才过滤条目。
- 使用项目现有 Radix Dialog 呈现确认，而非 `window.confirm`，保持 Electron UI 和键盘可访问性一致。
- `EditorPane` 在删除成功回调中按 `chatResourceId` 关闭匹配 tab，并调用 `chatRuntime.remove(sessionId)`；该回调发生在 Main 成功之后。
- 删除按钮与条目主按钮分离，使用同一行容器布局，避免嵌套 button。

## Security and failure behavior

- Renderer 永远无法指定 session 文件路径。
- path 必须来自本次 SDK list，经过 realpath/stat，并验证是普通文件；验证 session cwd 与 canonical worktree root 一致。
- 不调用 shell 字符串或 `trash` CLI；Electron `shell.trashItem` 是唯一删除机制。
- dispose/trash 任一步失败都返回结构化 ChatError；busy 与 not found 分别使用现有 `CHAT_SESSION_BUSY`、`CHAT_SESSION_NOT_FOUND`。

## Concerns

- **Concern:** dispose 成功但 trash 失败时，已打开 UI 仍保留 tab，但底层 session 已释放。设计要求后续 ChatView attach 可从仍存在的 session 文件重建；测试必须覆盖重试与重新 attach 能力。
- 删除与 attach/send 的竞争必须在 ChatService 内串行化同一 session 的生命周期操作，否则可能在删除过程中重新 attach。实现应增加 per-session mutation queue 或删除中标记。
- pi 自带 TUI 在 `trash` 不可用时会永久 unlink；本功能刻意不采用该 fallback，以满足用户可恢复的删除语义。
