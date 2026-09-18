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

## 删除 worktree 并保留 local branch

> Superseded by `docs/release-readiness-p0/spec.md`: 用户触发的删除必须优先保护本地分支。

- `WorktreeService.delete` 成功执行 `git worktree remove` 后直接移除 catalog record，不执行 `git branch -D/-d`。
- Delete/Force delete 确认明确 local branch 将被保留；dirty/busy 警告继续说明未提交修改和 Terminal 终止。
- `rollbackCreated` 是内部创建失败清理路径，仍需删除本次未完成创建产生的 checkout、local branch 和 catalog record。
- main/external worktree 继续不可通过 managed delete 删除。

## Out of scope

- 记忆跨重启的 Project 展开状态。
- 搜索或创建 local-only branch、非 origin remote branch。
- 删除 remote branch。
- 改变 Project/Worktree catalog schema。

## Proof

- ProjectRail 测试验证默认折叠、点击展开/再次折叠、Create 按钮独立工作。
- WorktreeDialog 测试验证搜索过滤、选择结果、无匹配时不可创建及删除文案。
- WorktreeService 临时 Git fixture 验证 clean/force delete 后 local branch 仍存在，rollbackCreated 仍清理未完成创建产生的 branch。
- `pnpm check` 全量通过。
