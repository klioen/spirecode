# Plan: 移除 Add Origin（from `docs/remove-add-origin/spec.md` 2026-09-14）

## Files that change

- `src/features/projects/WorktreeDialog.tsx`：统一为 Refresh icon；删除 Add icon、URL form 和 add state/action；更新 no-origin 提示。
- `src/features/projects/WorktreeDialog.test.tsx`：删除 add flow mock/test，覆盖无 origin 的 Refresh 行为和 Add UI 不存在。
- `src/styles/index.css`：删除 `.origin-form` 样式，保留 branch row/icon 样式。
- `src/features/projects/projectsApi.ts`：删除 `addOrigin`。
- `src/bindings/index.ts`：删除 `projectAddOrigin`。
- `src-tauri/src/app_state.rs`：删除 Add Origin wrapper。
- `src-tauri/src/commands.rs`、`src-tauri/src/lib.rs`：删除 command 和注册。
- `src-tauri/src/worktrees/mod.rs`：删除 add/fetch/rollback、URL validator、bounded network Git helper和专属测试，清理仅由其使用的 imports。
- `docs/remove-add-origin/{intent,spec,plan}.md`：记录新需求、接口删除和验证方式。

## Order of work

1. 先修改前端测试，断言无 origin 时显示并可点击 Refresh，且不存在 Add Origin 控件。
2. 简化 New Worktree UI，删除 Add Origin state、action、form 和样式。
3. 自 WebView 到 Rust service 逐层删除 `project_add_origin` 完整链路及专属测试/helper。
4. 全仓 grep 检查无残留，运行目标测试及 `pnpm check`。
5. 运行 `pnpm bundle`，覆盖 `/Applications/Pi App.app` 并核对 built/installed binary SHA-256。

## Risks

- 最危险的是只删 UI、遗漏可调用的 Tauri command；因此按 binding → command → service 全链路删除，并以全仓 grep 作为护栏。
- 删除 bounded Git helper 时必须确认它只服务于 Add Origin，避免影响其他 Git 操作。
- Refresh 在 catalog 初次加载前必须 disabled，避免加载中重复请求；正常空状态下保持可点击。
- 不采用“隐藏 Add UI 但保留后端”的方案，因为用户明确不需要该能力，保留会形成未使用攻击面和维护负担。

## Proof

```bash
pnpm test -- WorktreeDialog.test.tsx
rg -n 'project_add_origin|projectAddOrigin|addOrigin|Add origin remote|Origin URL' src src-tauri
pnpm check
pnpm bundle
```

健康结果：测试和检查全通过；grep 无匹配；App/DMG smoke 通过；安装版 binary hash 与构建版一致。
