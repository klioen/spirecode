# Spec: Terminal 输出重放缓存
Status: accepted。 Implements: `docs/fix-terminal-remount-history/intent.md`。

## Requirements

- 每个 terminalId 保存最近的输出历史，订阅期间和无订阅期间的 output 都进入缓存。
- 新 subscriber 注册时先按原顺序重放历史 output，再接收实时消息。
- 历史按字节预算裁剪，默认上限 1 MiB；从最旧 chunk 开始丢弃。
- exit/error 作为最新 lifecycle 消息保存并在重订阅时重放一次。
- unsubscribe 不清缓存；`terminalStream.close(id)` 清 subscriber、history、lifecycle 和 decoder。
- UTF-8 byte payload 保持原始 payload 缓存，解码仍在 xterm subscriber 中按顺序进行。

## Design

`terminalStream` 为每个 terminal 维护 `{ output: TerminalMessage[], bytes, lifecycle? }`。`push` 先写 history，再投递当前 subscriber。`subscribe` 重放 output 和 lifecycle。为避免第一次订阅把 attach 前缓存重复两次，history 是唯一缓存，不再维护独立 pending map。

## Proof

- 先订阅并收到输出，unsubscribe 后重新订阅，完整重放。
- 无 subscriber 时输出仍可在后续订阅重放。
- 超过预算时淘汰最旧输出。
- close 后不重放。
- `pnpm check`、`pnpm bundle`。
