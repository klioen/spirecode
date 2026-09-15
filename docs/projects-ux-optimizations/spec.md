# Spec: Projects 模块交互优化
Status: accepted。 Implements: `docs/projects-ux-optimizations/intent.md`。

## Project 折叠

- `ProjectRail` 为每个项目维护仅限当前视图会话的展开状态，不写入持久化 catalog 或 Zustand domain store。
- 初次渲染时所有项目默认折叠，即使项目内含当前 active worktree 也不自动展开。
- 项目名称区域改为 button，点击切换该项目展开状态；提供 `aria-expanded` 和可读 label。
- 折叠时不渲染 worktree rows 与创建进度；项目行右侧 Create worktree 按钮保持独立可用，点击不得触发展开。
- 新建 Project 加入列表后也保持默认折叠。

## Base branch 可搜索选择

- 用对话框内的可访问 combobox 替换原生 `select`：输入框显示搜索文本，获得焦点或输入时展示匹配选项。
- 搜索按 branch display name 和完整 `origin/*` ref 做大小写不敏感的子串匹配。
- 点击选项后设置 `baseRef`，输入框显示 branch name，并收起列表。
- catalog 刷新后：当前 ref 仍存在则保留；否则选择 `defaultRef` 或首个分支。搜索文本同步到所选 branch。
- 输入内容不精确对应有效选项时清空 `baseRef`，Create 按钮保持 disabled；后端继续权威校验 ref。
- 无匹配分支时显示明确 empty state；Refresh 按钮及 origin 未配置/未 fetch 提示保持原行为。

## 删除 worktree 和 local branch

- `WorktreeService.delete` 在成功执行 `git worktree remove` 后执行：

```text
git branch -D -- <managed-branch>
```

- 使用 `-D` 是因为从 origin branch 创建的 managed branch 可能尚未合并；用户在 Delete/Force delete 确认中已明确选择同时删除该 worktree 和 local branch。
- local branch 删除成功后才从 catalog 移除记录，避免 UI 报告成功但 branch 遗留。
- 如果 worktree 已移除但 branch 删除失败，保留 catalog record 并返回带 recovery detail 的结构化错误，用户可重试；重试时允许 `git worktree remove` 报 missing 后继续 branch/catalog cleanup 的扩展不在本次范围。
- Delete 对话框文案明确 local branch 将被删除；dirty/busy 警告继续说明未提交修改和 Terminal 终止。
- `rollbackCreated` 复用 delete 后不再重复执行 branch 删除。

## Out of scope

- 记忆跨重启的 Project 展开状态。
- 搜索或创建 local-only branch、非 origin remote branch。
- 删除 remote branch。
- 改变 Project/Worktree catalog schema。

## Proof

- ProjectRail 测试验证默认折叠、点击展开/再次折叠、Create 按钮独立工作。
- WorktreeDialog 测试验证搜索过滤、选择结果、无匹配时不可创建及删除文案。
- WorktreeService 临时 Git fixture 验证 clean/force delete 后 local branch 不存在，rollbackCreated 仍可完成。
- `pnpm check` 全量通过。
