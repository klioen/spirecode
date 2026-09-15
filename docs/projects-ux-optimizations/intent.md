# Intent: Projects 模块交互优化
Author: keliangliang。 Status: accepted。

## Problem

Projects 侧栏当前默认展开所有 worktree，项目较多时信息密度过高；新建 worktree 的 Base branch 原生下拉框无法快速查找分支；删除 managed worktree 后仍保留对应 local branch，需要用户额外手工清理。

## Proposed outcome

- 每个 Project 默认折叠，只显示项目行；点击项目行切换展开/折叠并展示其 worktree。
- New Worktree 对话框中的 Base branch 选择支持按分支名搜索，同时仍只能提交后端返回的有效 origin branch。
- 删除 managed worktree 时同步删除它对应的 local branch，并在确认界面明确提示该行为。

## Affected users and systems

使用 Projects 侧栏和 managed worktree 的所有用户；Renderer 的 ProjectRail、WorktreeDialog，以及 Electron Main 的 WorktreeService 与相关测试。

## Constraints

- Renderer 不执行 Git 或访问任意路径；branch 删除必须继续在 Electron Main 内通过参数数组执行。
- 只允许删除 `kind: "managed"` worktree 的对应 local branch；main/external worktree 的权限边界不变。
- branch 搜索不能允许任意 ref 穿透到后端，创建时仍由后端重新校验 `origin/*` catalog。
- dirty/busy worktree 的现有 force 确认和资源清理流程保持不变。

## Open questions

无。
