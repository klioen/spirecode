# Intent: Projects 模块交互优化
Author: keliangliang。 Status: accepted。

## Problem

Projects 侧栏当前默认展开所有 worktree，项目较多时信息密度过高；新建 worktree 的 Base branch 原生下拉框无法快速查找分支。该交付最初还尝试在删除 managed worktree 时删除 local branch，但该行为已被后续 `docs/release-readiness-p0/` 的数据安全要求取代。

## Proposed outcome

- 每个 Project 默认折叠，只显示项目行；点击项目行切换展开/折叠并展示其 worktree。
- New Worktree 对话框中的 Base branch 选择支持按分支名搜索，同时仍只能提交后端返回的有效 origin branch。
- 删除 managed worktree 时移除 checkout 和 catalog record，并保留对应 local branch；确认界面明确提示保留行为。

## Affected users and systems

使用 Projects 侧栏和 managed worktree 的所有用户；Renderer 的 ProjectRail、WorktreeDialog，以及 Electron Main 的 WorktreeService 与相关测试。

## Constraints

- Renderer 不执行 Git 或访问任意路径；worktree 删除继续在 Electron Main 内通过参数数组执行。
- 用户触发的 managed worktree 删除保留 local branch；只有未完成创建的内部 rollback 可以清理由本次创建的新 branch。main/external worktree 的权限边界不变。
- branch 搜索不能允许任意 ref 穿透到后端，创建时仍由后端重新校验 `origin/*` catalog。
- dirty/busy worktree 的现有 force 确认和资源清理流程保持不变。

## Open questions

无。
