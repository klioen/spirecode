# Spec: 启动 Catalog Hydration 的单 Project 自动选择
Status: accepted。 Implements: `docs/start-without-active-project/intent.md`。

## Requirements

- 启动 hydration 使用专用 `hydrateCatalog(catalog)`。
- `catalog.projects.length === 1` 时，选择该 Project 的 `kind:"main"` worktree；若异常缺少 main，则选择该 Project 第一条 worktree，否则 null。
- `catalog.projects.length === 0` 或 `> 1` 时，`activeWorktreeId: null`。
- 忽略 Rust catalog 中 persisted activeWorktreeId，不恢复上次 managed worktree。
- 普通运行期 catalog refresh 与 `setProjects` 继续保留当前有效选择。
- 用户主动 Open Project 后仍自动选择其 main worktree。
- 删除 active managed worktree 后仍回退同 Project main worktree。

## Proof

Store 测试覆盖 0/1/多个 Project 和单 Project 多 worktree；App 使用 hydrate action。完整 check/bundle。
