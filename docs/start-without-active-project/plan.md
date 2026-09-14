# Plan: 启动时不自动选中 Project（from `docs/start-without-active-project/spec.md` 2026-09-14）

## Files that change

- `src/features/projects/projectsStore.ts`：新增启动 hydration action。
- `src/features/projects/projectsStore.test.ts`：启动不恢复选择、运行期保留选择。
- `src/app/App.tsx`：启动使用 hydrate action。
- `src/app/App.test.tsx`：catalog 含 active worktree 时仍展示空工作台。

## Order of work

1. 添加 catalog hydrate 后 activeWorktreeId 应为 null 的失败测试。
2. 实现 `hydrateCatalog`，保留 `setCatalog` 运行期语义。
3. App 启动切换到 hydrate action。
4. 运行完整检查、bundle 并覆盖安装。

## Risks

- 复用 `setCatalog` 直接改语义会破坏运行期 refresh；因此新增专用 action。
- Open Project 成功仍应进入 main worktree，不能统一取消所有自动选择。

## Proof

`pnpm test -- projectsStore.test.ts App.test.tsx`、`pnpm check`、`pnpm bundle`。
