# Spec: 同仓库安全接管 Managed Worktree Root
Status: accepted。 Implements: `docs/fix-worktree-owner-reopen/intent.md`。

## Requirements

- ownership marker 中 canonical `gitCommonDir` 与当前项目相同时，旧 `projectId` 不得触发 repository conflict。
- 同仓库、Project ID 变化时，应原子更新 marker 为当前 Project ID，再继续 create、rename 或 delete。
- `gitCommonDir` 不同、marker 无效、marker/root 是 symlink、非空目录缺少 marker 时，继续返回 `WORKTREE_OWNER_CONFLICT`。
- 接管不得删除、移动或覆盖 managed root 中任何已有 worktree。
- 已有路径和 branch 冲突继续由现有唯一性检查与 Git 命令拒绝。

## Design

将 repository identity 与 catalog identity 分开：canonical `gitCommonDir` 是 ownership 安全边界，`projectId` 是可更新的 catalog metadata。

`ensureOwner()` 读取 marker 后：

1. 校验 marker schema。
2. 若 `gitCommonDir` 不同，拒绝为另一个 repository。
3. 若 common dir 相同但 `projectId` 不同，通过同目录临时文件加 rename 原子重写 marker。
4. common dir 和 Project ID 均相同则直接返回。

原子更新失败时保留原 marker，并返回结构化错误。现有 managed worktree 仅作为目录内容保留，不自动导入 catalog。

## Proof

- 回归测试模拟关闭/重新添加造成 Project ID 变化，确认同 common dir 可创建下一个 worktree且 marker 更新。
- 测试不同 common dir 仍拒绝。
- 测试 symlink、无效 marker 和无 marker 的非空目录仍拒绝。
- `pnpm check` 全部通过。
