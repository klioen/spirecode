# Spec: 在 Chat 显示模型容量等待状态

## Requirements
- TraeX 模型容量排队时，在 composer 上方展示类似 `TraeX is waiting for model capacity · position 362` 的临时状态。
- 排队位置变化时原位更新，不追加 transcript 消息。
- provider 清除等待状态后，提示自动消失。
- 重新 attach 时快照包含当时有效的临时状态，避免 attach 窗口丢事件。
- 用户 follow-up 队列继续使用现有“待处理”区域，两者语义独立。
- 不增加顶部状态栏，不展示 token 状态。

## Design
- pi adapter 为 SDK session 绑定受限 `ExtensionUIContext`，mode 使用 `rpc`，使 extension 的 `ctx.hasUI` 为 true。
- 受限 UI 仅把 `setWorkingMessage(message?)` 转换为内部 `extension_status` 事件；其余对话框、widget、footer、editor 等方法使用安全默认值或 no-op。
- 选择 `setWorkingMessage` 而不是所有 `setStatus`：TraeX 容量等待同时设置 working message，释放时清除；这样不会把 plan、lark、pi-web 等常驻 footer 状态误放进 Chat。
- ChatService 将事件归一化并保存当前 `activity`，随 snapshot 和实时 envelope 发送。
- Renderer reducer 保存 `activity`，ChatView 在 ChatComposer 之前渲染紧凑的 `role=status` 行。

## Concerns
- `bindExtensions()` 会触发 `session_start` 和资源发现，这是 SDK host 启用 extension UI 的标准入口；需测试确保只绑定一次。
- 扩展可能发送 ANSI 颜色或控制字符；Main 必须清理 ANSI、换行及控制字符并限制长度后再发给 Renderer。
- 不支持 extension 的交互式 select/confirm/input；这些方法仍返回取消/default，避免在 Electron Main 中悬挂。
