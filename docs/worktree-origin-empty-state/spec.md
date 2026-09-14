# Spec: Origin Branch 空状态、Add Origin 与 Refresh
Status: accepted。 Implements: `docs/worktree-origin-empty-state/intent.md`。

## Contract

`OriginBranchCatalog`：

```text
originConfigured: boolean
branches: OriginBranch[]
defaultRef: string | null
nextName: string
```

新增 command：

```text
project_add_origin({ projectId, url }) -> OriginBranchCatalog
```

## Backend behavior

- Rust 通过 `git remote get-url origin` 判断 originConfigured。
- URL trim 后不能为空、不能含控制字符。
- 只允许 `https://`、`http://`、`ssh://`、`git://` 和 SCP-like `user@host:path` Git URL；拒绝 option-shaped URL。
- 在 repository mutation lock 下重新确认 origin 不存在。
- 执行 `git remote add origin <url>`，随后 `git fetch origin --prune`。
- fetch 成功后尝试 `git remote set-head origin -a`，失败仅影响 defaultRef 推断，不回滚已成功 fetch。
- fetch 失败时删除刚添加的 origin 作为补偿，并返回 Git stderr。
- 成功返回刷新后的 OriginBranchCatalog。

## UI behavior

### 未配置 origin

- 显示：`No origin remote configured. Add an origin URL to continue.`
- Base branch 右侧显示 Add icon，accessible name `Add origin remote`。
- 点击 Add icon 展开 URL input，placeholder 示例 `https://github.com/org/repo.git`。
- `Add origin` 提交时显示 `Adding…`，成功后隐藏 URL input、自动更新 branch select。
- 失败保留 URL input 和内容，并显示 error。

### 已配置 origin

- Base branch 右侧显示小型 Refresh icon，accessible name `Refresh origin branches`。
- configured 且 branches 为空：显示 `No fetched origin branches. Run git fetch origin, then refresh.`
- Refresh 只重新读取本地 Git 状态，不自动联网。
- Refresh 失败保留上一次成功 catalog。
- Refresh 后当前 baseRef 仍存在则保留，否则选择 defaultRef/第一项/空。

无 branch 时 Create disabled。

## Proof

Rust 测试 URL validation、add/fetch success、fetch failure rollback、existing origin conflict。前端测试 add flow、failure preservation、refresh icon/selection。完整 check/bundle。
