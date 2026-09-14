# Spec: Origin Branch 空状态与 Refresh
Status: accepted。 Implements: `docs/worktree-origin-empty-state/intent.md`。

## Contract

`OriginBranchCatalog` 增加：

```text
originConfigured: boolean
branches: OriginBranch[]
defaultRef: string | null
nextName: string
```

Rust 通过 `git remote get-url origin` 判断 originConfigured，不依赖 branch 数量猜测。

## UI

- `originConfigured === false`：显示 `No origin remote configured. Add an origin remote, then refresh.`
- configured 且 branches 为空：显示 `No fetched origin branches. Run git fetch origin, then refresh.`
- 显示 `Refresh` 按钮，loading 时禁用并显示 `Refreshing…`。
- Refresh 失败保留上一次成功 catalog，并显示 error。
- Refresh 后当前 baseRef 仍存在则保留；否则选择 defaultRef/第一项/空。
- 无 branch 时 Create disabled。

## Proof

Rust 测试无 origin / 空 tracking refs / 正常 refs。前端测试两个空状态、refresh selection 和 failure preservation。完整 check/bundle。
