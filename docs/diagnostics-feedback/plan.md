# Plan: 本地日志、诊断与反馈（from `docs/diagnostics-feedback/spec.md` 2026-09-18）

## Files that change

- `docs/diagnostics-feedback/{intent,spec,plan}.md`
- `electron/domains/diagnostics/service.ts`、tests：日志/诊断服务。
- `electron/contracts.ts`、`electron/ipc.ts`、`src/bindings/index.ts`：受限 API。
- `electron/appState.ts`、`electron/main.ts`：logger 生命周期/关键错误接入。
- `src/features/settings/SettingsDialog.tsx`、tests：用户入口。
- `package.json`：版本/反馈 URL 只读配置（若需要）。

## Order

1. 写 diagnostics service 和 IPC allowlist 测试；
2. 实现日志轮转、脱敏诊断；
3. 接入 Main 错误和 Settings UI；
4. 完整门禁并提交。

## Risks

- 诊断泄露隐私：只允许固定字段和日志尾部，不能复用任意 error details；
- feedback URL 必须固定常量，不能由 Renderer 传入任意 URL；
- 打开日志目录失败只显示错误，不影响主业务。
