# Plan: SpireCode MVP Release Readiness P0（from `docs/release-readiness-p0/spec.md` 2026-09-18）

## Files that change

### Quality gate

- `eslint.config.js`：固定 Renderer TypeScript parser 的 `tsconfigRootDir`，排除 `.delta`。
- `.gitignore`：忽略本地 `.delta` 管理目录（若尚未忽略）。
- `electron/domains/git/git.test.ts`：按 parser 稳定输出和完整 `GitChange` 合约更新断言。

### Worktree deletion

- `electron/domains/worktrees/index.ts`：删除 branch destruction 步骤。
- `electron/domains/worktrees/worktrees.test.ts`：增加 branch preservation 回归测试并更新调用断言。
- `src/features/projects/WorktreeDialog.tsx`：删除确认文案改为保留 local branch。
- `src/features/projects/WorktreeDialog.test.tsx`：验证新文案和 force 行为。

### Dirty close protection

- `src/features/editor/editorStore.ts` 与测试：提供 dirty file count/query。
- `electron/contracts.ts`、`electron/preload.ts`、`electron/ipc.ts` 及测试：增加窄化 dirty-state/close coordination contract。
- `src/app/App.tsx` 或独立 adapter：Renderer 在 dirty 状态变化时同步通知 Main。
- `electron/main.ts`：窗口 close / before-quit guard、确认和 cleanup latch。
- 新增或调整 Main 生命周期测试，覆盖无 dirty、Cancel、Discard 和重复 close。

### Startup restoration and honest UI

- `src/features/projects/projectsStore.ts` 与测试：恢复合法 `activeWorktreeId`。
- `src/features/workbench/Workbench.tsx` 与测试：移除未实现的 Command Center。
- `src/features/editor/EditorPane.tsx` 与测试：移除未实现的 Quick Open 提示。
- `README.md`、`docs/project-worktrees/*`、`docs/edit-selected-files/*`：同步真实行为和限制。
- `docs/release-readiness-p0/plan.md`：若实施偏离，随代码同步修订。

## Order of work

1. 先修复 ESLint root 和 Git parser 测试，恢复可用的反馈循环。
2. 先写 worktree branch preservation 失败测试，再删除 `branch -D` 和更新 UI 文案。
3. 先为 active worktree hydration 写失败测试，再修复 store fallback。
4. 设计最小 dirty-close IPC 状态机并先写 Main/Renderer 测试。
5. 实现 dirty 状态通知、close guard 和 cleanup latch。
6. 移除不可操作的 Command Center/Quick Open 入口并更新组件测试。
7. 更新 README 与相关 SDLC 文档，确保不夸大本批能力。
8. 运行 targeted tests、`pnpm check`；必要时构建但不覆盖现有安装。
9. 审查 diff，确认没有扩大 Renderer 权限或引入 branch 删除路径。

## Risks

- **最危险步骤：窗口关闭状态机。** Electron 的 close、before-quit、window-all-closed 可能递归触发；错误实现可能造成无法退出、跳过 cleanup，或 dirty guard 被绕过。
- 删除 branch 步骤后，旧测试可能假定 `branch -D` 被调用；应以产品批准语义为准修正测试，而不是保留危险行为。
- dirty 状态来自 Renderer 内存，只能覆盖正常退出；不能将其描述为 crash recovery。
- 不采用将文件正文发送给 Main 的方案，因为这会扩大 IPC 数据面并违反现有状态所有权。
- 不采用直接持久化全部 editor store 的方案，因为其中包含 terminal runtime identity 和 dirty metadata，恢复语义需要独立设计。

## Proof

Targeted：

```bash
pnpm exec vitest run electron/domains/git/git.test.ts
pnpm exec vitest run electron/domains/worktrees/worktrees.test.ts
pnpm exec vitest run src/features/projects/projectsStore.test.ts
pnpm exec vitest run src/features/editor/editorStore.test.ts
pnpm exec vitest run electron/ipc.test.ts electron/main.test.ts
pnpm exec vitest run src/features/workbench/Workbench.test.tsx src/features/editor/EditorPane.test.tsx
```

完整门禁：

```bash
pnpm format:check
pnpm brand:check
pnpm lint
pnpm typecheck
pnpm test
pnpm check
```

手工 smoke：

1. 打开文件并修改但不保存，关闭窗口，Cancel 后窗口保持且草稿仍在。
2. 再次关闭并确认 Discard，应用完成清理并退出。
3. 删除 managed worktree，使用 `git show-ref --verify refs/heads/<branch>` 确认 branch 保留。
4. 重启应用，确认恢复上次 active worktree。
