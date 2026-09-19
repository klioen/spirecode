# Plan: 精简 General Settings 并独立展示 Feedback（from docs/settings-general-feedback/spec.md 2026-09-18）

## Files that change

- `docs/settings-general-feedback/{intent,spec,plan}.md`：记录已确认需求、规格和实施证明。
- `src/features/settings/SettingsDialog.tsx`：移除 Diagnostics UI 和专用状态，将 Feedback 拆为独立设置行。
- `src/features/settings/SettingsDialog.test.tsx`：覆盖 Diagnostics 不再展示及 Feedback 独立保留并可调用。
- `src/i18n/{en,zh-CN}.ts`：删除 Diagnostics 文案，增加 Feedback 标题与说明。

## Order of work

1. 先将现有 Diagnostics 成功提示测试替换为目标行为测试，并运行确认测试在旧实现上失败。
2. 删除 Renderer 中 Diagnostics 行、复制动作和成功状态。
3. 新增独立 Feedback 设置行，保留现有错误处理和类型化命令。
4. 清理中英文 Diagnostics 文案并补齐 Feedback 标题与说明。
5. 运行 Settings 相关测试，再执行 `pnpm check`。

## Risks

- 最危险的是误删 Main 的诊断记录能力，影响启动错误排查；本次严格限制在 Renderer UI 和文案，不修改 Electron 诊断服务或 IPC。
- Feedback 原本与 Diagnostics 共用错误状态；拆分时需保留调用失败的可见错误。
- 不删除 Diagnostics IPC，避免对潜在其他调用者造成非必要破坏；仅移除当前 Settings 入口。

## Proof

- Renderer 测试断言 General 不含 Diagnostics 操作，Feedback 标题、说明、按钮存在且点击调用 `feedbackOpen`。
- `pnpm vitest run src/features/settings/SettingsDialog.test.tsx` 通过。
- `pnpm check` 全量通过。
