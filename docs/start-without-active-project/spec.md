# Spec: 启动 Catalog Hydration 不恢复选择
Status: accepted。 Implements: `docs/start-without-active-project/intent.md`。

## Requirements

- 新增显式启动 hydration action，例如 `hydrateCatalog(catalog)`。
- `hydrateCatalog` 安装 `catalog.projects`，但始终设置 `activeWorktreeId: null`。
- 普通运行期 catalog refresh 与 `setProjects` 继续保留有效选择。
- App 启动流程使用 `hydrateCatalog`，不再直接使用恢复 selection 的 `setCatalog`。
- Workbench 在 `activeWorktreeId === null` 时展示现有 EmptyWorkbench。
- ProjectRail 不显示 active worktree，直到用户选择。

## Proof

- store 测试：catalog 即使带 activeWorktreeId，hydrate 后仍为 null。
- store 测试：用户选择后普通 refresh 保留选择。
- App 测试：启动 project catalog 不自动进入 EditorPane。
- `pnpm check`、`pnpm bundle`。
