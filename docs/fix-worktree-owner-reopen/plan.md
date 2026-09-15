# Plan: 修复同仓库重新添加后的 Worktree ownership 冲突（from `docs/fix-worktree-owner-reopen/spec.md` 2026-09-15）

## Files that change

- `electron/domains/worktrees/index.ts`：按 canonical Git common dir 判断 repository ownership，并原子迁移旧 Project ID marker。
- `electron/domains/worktrees/worktrees.test.ts`：增加同仓库新 Project ID 接管回归，并保留跨仓库拒绝测试。
- `docs/fix-worktree-owner-reopen/{intent,spec,plan}.md`：记录现场根因、设计与验证。

## Order of work

1. 增加回归测试：先创建旧 Project ID marker，再用指向同一 repository 的新 Project ID 创建 worktree，确认当前实现失败。
2. 实现 marker 原子更新；repository identity 仅由 canonical `gitCommonDir` 决定。
3. 强化现有 foreign-root 测试，分别覆盖“同 Project ID 但 foreign common dir”和“不同 Project ID 且 foreign common dir”。
4. 运行 Worktree 针对性测试及 `pnpm check`。
5. bundle、替换应用；在不改动现有 `worktree1` 的前提下更新现场 marker，并验证 New Worktree。

## Risks

最危险的是错误接管同名但不同仓库的 managed root；因此只有 canonical `gitCommonDir` 完全相等时允许更新 Project ID。不能简单忽略 Project ID，也不能删除旧 root。marker 更新使用临时文件加 rename，避免中断留下截断 JSON。

## Proof

- 新增同仓库新 Project ID 回归测试先红后绿；Worktree 测试 8/8 通过。
- `pnpm check`：35 个文件、130 个测试通过，format、brand、lint、typecheck 全部通过。
- `pnpm bundle`：应用与 DMG 构建、签名验证、smoke 全部通过。
- 安装后确认现有 `worktree1` 未变化，并通过同仓库 ownership migration 路径更新 marker。
