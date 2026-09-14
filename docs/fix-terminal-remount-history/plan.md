# Plan: Terminal 输出重放缓存（from `docs/fix-terminal-remount-history/spec.md` 2026-09-14）

## Files that change

- `src/features/terminal/terminalStream.ts`：有界 history、lifecycle 和 replay。
- `src/features/terminal/terminalStream.test.ts`：重订阅、预算裁剪和 close 回归。

## Order of work

1. 添加已订阅输出在 remount 后重放的失败测试。
2. 将 pending map 替换为统一 history map。
3. 添加 1 MiB 预算裁剪与 lifecycle replay。
4. 验证 close 清理与 UTF-8 decode。
5. 运行完整检查、bundle、覆盖安装并校验 hash。

## Risks

- 同一 subscriber 重复调用 subscribe 会重复显示历史；调用方每次 mount 都创建全新 xterm，符合 replay 语义。
- 按 JS string 长度估算字节会失真；使用 TextEncoder 或 byte payload length 计算。
- 截断可能从多字节字符 chunk 边界开始，但每个原始 chunk完整保留，不在 chunk 内切割。

## Proof

`pnpm test -- terminalStream.test.ts`、`pnpm check`、`pnpm bundle`。
