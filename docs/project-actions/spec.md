# Spec: Project 级管理入口
Status: accepted。 Implements: `docs/project-actions/intent.md`。

## 1. UI

- 每个 Project heading 增加 `Manage <project>` 按钮。
- 菜单包含：`Reveal in Finder`、`Copy path`、`Close project`。
- 菜单使用 `role="menu"` / `role="menuitem"`，与已有 Worktree 菜单共享 outside pointer close 语义。
- Project 菜单打开时关闭 Worktree 菜单；反之亦然。

## 2. Actions

- Reveal：调用 `projectsApi.reveal(project.id)`；失败写入 projects store error。
- Copy：调用 `projectsApi.copyPath(project.id)`；成功在菜单中显示 `Copied` 状态约 1.5 秒，失败写入 error。
- Close：调用 `projectsApi.close(project.id)`；成功调用 `store.removeProject(project.id)`，关闭菜单。Main 负责运行资源清理和持久化。
- 操作 pending 时禁用菜单项，避免重复 IPC。

## 3. Selection and cache

- 如果关闭的是 active project，store 的现有 `removeProject` fallback 选择剩余项目的 main/first worktree。
- 本批只移除 project catalog/UI 状态；worktree resource cache 的清理沿用现有生命周期，不新增跨 feature 依赖。

## 4. Acceptance

- 每个 Project heading 可打开管理菜单。
- Reveal/Copy/Close 调用正确 project ID。
- Close 成功后项目消失，active worktree 正确 fallback；Close 失败项目保留并显示 error。
- Copy 成功显示 Copied；Copy/Reveal 失败显示 error。
- Project 与 Worktree 菜单不会同时显示。
- `pnpm check` 全绿。
