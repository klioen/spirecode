# Plan: Agent、Editor、Terminal Settings 控制面（from `docs/settings-control-plane/spec.md` 2026-09-18）

## Files that change

- `docs/settings-control-plane/{intent,spec,plan}.md`
- `src/features/settings/SettingsDialog.tsx`、新增 `settingsStore.ts`：schema、UI、持久化。
- `src/features/settings/SettingsDialog.test.tsx`、新增 `settingsStore.test.ts`：red-green。
- `src/features/editor/EditorPane.tsx`：Monaco 设置接入。
- `src/features/terminal/TerminalInstance.tsx`：xterm 设置接入。
- `src/styles/index.css`：设置说明/复制反馈（必要时）。

## Order

1. 写 settingsStore 和三个 section 的失败测试；
2. 实现 schema persistence 和 controls；
3. 接入 Monaco/xterm；
4. targeted tests、`pnpm check`、提交。

## Risks

- xterm 运行时 options 更新必须通过已有实例，不重建 terminal；
- 设置值必须有限枚举，不能把任意 localStorage JSON 传入 Monaco/xterm；
- Agent 配置只显示路径，不读取或展示凭据。
