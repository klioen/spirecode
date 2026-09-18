# Intent: SpireCode MVP Release Readiness P0
Author: product owner。 Status: accepted。

## Problem

SpireCode 已经具备 Project、managed Worktree、文件编辑、Git Changes、Terminal 和多会话 Agent Chat 的核心产品闭环，但正式发布审计发现若干会阻止公开 MVP 的问题：质量门禁失败、删除 managed worktree 会同时删除本地分支、未保存文件在退出应用时可能丢失、重启后未恢复已持久化的 active worktree、界面存在未实现的快捷入口，且产品文档仍描述过时的只读/Tauri 行为。

这些问题优先于新增 IDE 或 Chat 功能，因为它们直接影响用户数据安全、发布可信度和基础产品一致性。

## Proposed outcome

交付第一批不依赖外部发布凭据的 P0 修复：

1. `pnpm check` 在存在 SpireCode 管理的本地 worktree 目录时仍可稳定通过。
2. 删除 managed worktree 只删除 worktree 目录和 catalog 记录，默认保留 local branch。
3. 关闭窗口或退出应用前检测所有未保存文件，允许用户取消退出，且不会静默丢失草稿。
4. 启动时采用 Main 持久化的 `activeWorktreeId`，无效值才回退到首个可用 worktree。
5. 在 Command Palette / Quick Open 真正实现前移除不可操作的 `⌘K`、`⌘P` 产品承诺。
6. README 与权威规格同步到 Electron、可编辑文件和保留 branch 的真实行为。

完成后，第一批 P0 应具有自动化回归测试，并以 `pnpm check` 全绿作为验收门槛。

## Affected users and systems

- 所有编辑文件、删除 managed worktree 或重启 SpireCode 的用户。
- Renderer：Projects、Editor、Workbench 状态和关闭协调。
- Electron Main：窗口退出生命周期、Worktree 删除服务。
- 工程系统：ESLint、Vitest、README 和 SDLC 文档。

## Constraints

- Renderer 继续保持 sandbox、context isolation，不能获得 Node、Electron 或通用文件系统权限。
- 文件正文和草稿不得进入 Zustand 持久化；本批只保证受控退出，不引入 crash-recovery 存储。
- Git 继续使用参数数组，不使用 shell command string。
- 删除 worktree 不得删除 local branch；本批不增加独立的 Delete Branch 功能。
- 不在本批修改正式 bundle identifier、Developer ID、notarization 或 updater，因为这些需要独立发布决策和凭据。
- 不在本批实现完整 Command Palette、Quick Open、Stage/Commit 或 Agent tool approval。

## Open questions

- 正式 bundle identifier、Apple Developer Team 和分发渠道将在后续 `public-release-pipeline` 变更中确定。
- crash recovery 草稿、Save All 原生三按钮对话框和 Agent 认证引导分别作为后续独立交付，不与本批安全修复混合。
