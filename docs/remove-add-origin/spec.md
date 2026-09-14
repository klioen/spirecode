# Spec: 移除 Add Origin
Status: accepted。 Implements: `docs/remove-add-origin/intent.md`。 Supersedes the Add Origin portions of `docs/worktree-origin-empty-state/spec.md`。

## UI behavior

- Base branch 右侧始终显示 Refresh icon，accessible name 为 `Refresh origin branches`。
- Refresh icon 在初次 catalog 尚未加载、正在 refresh 或正在创建 worktree 时 disabled。
- 点击 Refresh 只调用现有 `git_list_origin_branches`，重新读取本地 Git remote/tracking refs，不执行 fetch。
- 未配置 origin 时显示：`No origin remote configured. Configure and fetch origin outside Pi App, then refresh.`
- 已配置 origin 但没有 tracking branches 时继续显示：`No fetched origin branches. Run git fetch origin, then refresh.`
- 任一空状态下 Create disabled。
- 不显示 Add icon、Origin URL input 或 Add origin action。

## Removed interface

完整删除：

```text
project_add_origin({ projectId, url }) -> OriginBranchCatalog
```

并删除对应的 frontend binding/API、Tauri command/registration、AppState wrapper、Rust add/fetch/rollback/URL validation 实现及专属测试。

## Proof

- 前端测试覆盖无 origin 时 Refresh icon、点击后重新读取 catalog，且不存在 Add Origin 控件。
- 生产代码不再找到 `project_add_origin`、`projectAddOrigin`、`addOrigin`、`Add origin remote` 或 `Origin URL`；测试可保留后两者用于负向断言。
- `pnpm check` 和 `pnpm bundle` 通过。
