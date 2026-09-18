# Plan: 在 Chat 显示模型容量等待状态（from docs/chat-model-capacity-status/spec.md 2026-09-16）

## Files that change
- `electron/domains/chat/piAdapter.ts` 与测试：绑定受限 extension UI，将 working message 发为内部事件。
- `electron/domains/chat/wire.ts` 与测试：白名单归一化临时状态并清理不可信显示文本。
- `electron/domains/chat/chatService.ts` 与测试：保存 activity，并加入 attach snapshot。
- `electron/domains/chat/types.ts`、`src/features/chat/types.ts`、`src/bindings/generated.ts`：扩展窄类型协议。
- `src/features/chat/sessionReducer.ts` 与测试：应用状态更新与清除。
- `src/features/chat/ChatView.tsx` 与测试、`src/styles/index.css`：在 composer 上方展示临时状态。

## Order of work
1. 写 pi adapter、wire、service、reducer 和 ChatView 红测，覆盖设置、更新、清除及快照恢复。
2. 实现受限 UI bridge 和 `extension_status` 事件。
3. 实现 Main 状态保存、Renderer 状态管理和临时提示 UI。
4. 运行定向测试、完整检查、打包、安装和 smoke test。

## Risks
- 最危险的是绑定完整 extension UI 后让交互式扩展误以为可弹窗；受限 context 对交互方法立即返回取消值，只有 working message 被桥接。
- 状态事件可能包含 ANSI/control characters；在 Main wire 边界清理并截断。
- 放弃桥接所有 `setStatus`，避免把与当前模型请求无关的常驻 footer 状态展示在 Chat。

## Proof
- `pnpm exec vitest run electron/domains/chat/piAdapter.test.ts electron/domains/chat/wire.test.ts electron/domains/chat/chatService.test.ts src/features/chat/sessionReducer.test.ts src/features/chat/ChatView.test.tsx`
- `pnpm check`
- `pnpm bundle`
- 安装后签名、app.asar 哈希与 `scripts/smoke-app.sh` 校验。
