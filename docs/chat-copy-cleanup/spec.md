# Spec: 精简 Chat 空状态与输入提示

## Requirements
- Chat 会话为空时不渲染 `Start a conversation with pi` 或替代空状态文案。
- 输入框在空闲和运行状态下均使用 `随心输入` 作为 placeholder。
- 不渲染 `Enter 发送 · Shift+Enter 换行`。
- Enter 发送、Shift+Enter 换行、IME 输入、follow-up 和 Stop 行为保持不变。
- 不增加状态栏，不接入 pi token 状态或模型容量等待状态。

## Design
- 在 `ChatView` 中删除空会话文案渲染及仅为该文案服务的 `emptyLabel` 属性。
- 在 `ChatComposer` 中统一 placeholder 并删除快捷键提示节点。
- 用现有组件测试覆盖文案不存在、placeholder 正确以及键盘行为不回退。

## Concerns
无跨进程接口或持久化变更。
