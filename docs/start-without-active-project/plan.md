# Plan: 单 Project 启动自动选择（from `docs/start-without-active-project/spec.md` 2026-09-14）

## Files that change

- `src/features/projects/projectsStore.ts`：hydrate 数量规则。
- `src/features/projects/projectsStore.test.ts`：0/1/multiple catalog regression。

## Order of work

1. 更新启动 hydrate 失败测试为数量矩阵。
2. 实现恰好一个 Project 时选 main worktree。
3. 运行完整检查、bundle 并覆盖安装。

## Proof

`pnpm test -- projectsStore.test.ts`、`pnpm check`、`pnpm bundle`。
