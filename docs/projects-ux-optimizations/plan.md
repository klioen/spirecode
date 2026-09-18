# Plan: Projects 模块交互优化（from `docs/projects-ux-optimizations/spec.md` 2026-09-14）

## Files that change

- `docs/projects-ux-optimizations/{intent,spec,plan}.md`：本次需求、设计和执行计划。
- `src/features/projects/ProjectRail.tsx`：项目级默认折叠状态、展开按钮与可访问属性。
- `src/features/projects/ProjectRail.test.tsx`：默认折叠和点击展开/折叠回归。
- `src/features/projects/WorktreeDialog.tsx`：可搜索 Base branch combobox、删除确认文案。
- `src/features/projects/WorktreeDialog.test.tsx`：分支搜索/选择/空结果和删除行为回归。
- `src/styles/index.css`：展开图标、branch combobox/options 样式。
- `electron/domains/worktrees/index.ts`：删除 managed worktree 后保留 local branch；create rollback 单独清理未完成创建产生的 branch。
- `electron/domains/worktrees/worktrees.test.ts`：local branch 保留和 rollback 集成断言。

## Order of work

1. 先补 Renderer 回归测试：Project 初始不显示 worktrees，点击项目按钮后显示，再次点击隐藏；创建按钮不承担展开语义。
2. 在 `ProjectRail` 内加入本地 `Set<projectId>` 展开状态，项目名称使用 `button` + `aria-expanded`，只在展开时渲染 worktree 列表。
3. 先补 Base branch 搜索测试，覆盖按 name/ref 过滤、点击选项后提交正确 ref、无匹配时 Create disabled。
4. 在 New Worktree dialog 实现受控 combobox/listbox；catalog 仍是唯一选项来源，刷新和默认分支逻辑保持不变。
5. 更新删除对话框断言与文案，明确 local branch 会被保留。
6. 修改 Main 的删除事务：用户删除在 worktree remove 后直接删除 catalog record；内部 `rollbackCreated` 额外清理本次创建产生的 branch。
7. 更新真实临时 Git fixture，证明普通删除和 force 删除都保留 local branch，create rollback 仍无 checkout/branch/catalog 残留。
8. 运行针对性测试、格式化检查和完整 `pnpm check`。

## Risks

- 最大风险是折叠按钮和行内 `+` 的点击事件互相影响；通过独立 button DOM 和组件测试约束。
- 自制 searchable combobox 容易产生键盘/焦点可访问性缺口；实现标准 `role="combobox"`、`aria-expanded`、`role="listbox"/"option"`，至少支持输入过滤、点击选择、Escape 收起和精确输入匹配。
- 用户删除必须保留 branch，避免未合并或未推送提交不可逆丢失；确认文案必须明确，且绝不触碰 remote branch。
- `git worktree remove` 成功后 catalog 操作失败会形成部分完成状态；返回结构化 recovery 信息，不伪装成功。内部 create rollback 仍可能在 checkout 删除后清理 branch 失败，因此保留 catalog record 供重试。

## Proof

```bash
pnpm test -- src/features/projects/ProjectRail.test.tsx src/features/projects/WorktreeDialog.test.tsx electron/domains/worktrees/worktrees.test.ts
pnpm format:check
pnpm lint
pnpm typecheck
pnpm check
```

验收结果：所有项目初始仅显示 Project 行；点击后显示其 worktrees；Base branch 可搜索并只提交合法 origin ref；删除 managed worktree 后 `refs/heads/<branch>` 仍存在。
