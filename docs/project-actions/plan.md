# Plan: Project 级管理入口（from `docs/project-actions/spec.md` 2026-09-18）

## Files that change

- `docs/project-actions/{intent,spec,plan}.md`
- `src/features/projects/ProjectRail.tsx`：Project 菜单、操作 handlers、pending/copy feedback。
- `src/features/projects/ProjectRail.test.tsx`：Project action red-green tests。
- `src/styles/index.css`：Project menu/status styling（复用 worktree menu）。

## Order of work

1. 扩展 projectsApi mock，写 Project 菜单、Reveal/Copy/Close 成功失败测试（red）。
2. 实现 Project heading menu 与互斥 menu state。
3. 实现 Reveal、Copy feedback、Close/fallback。
4. 运行 targeted tests、`pnpm check`，检查 IPC 参数仍为 projectId。
5. 提交。

## Risks

- Close 操作可能异步较慢；pending 时必须禁用菜单项，避免重复 close。
- 关闭 active project 后不能让 activeWorktreeId 指向已移除 worktree；复用 store 的现有 fallback 并加测试。
- 不提供 Delete from disk，避免把 catalog close 与磁盘破坏混淆。

## Proof

```bash
pnpm exec vitest run src/features/projects/ProjectRail.test.tsx
pnpm check
```
