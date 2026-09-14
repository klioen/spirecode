# Plan: Project Managed Worktrees（from `docs/project-worktrees/spec.md` 2026-09-14）

## Files that change

### Rust model and persistence

- `src-tauri/src/projects/mod.rs`：V2 Project/Worktree model、V1 migration、checkout lookup、sequence。
- `src-tauri/src/persistence/mod.rs`：version-aware catalog load 辅助。
- `src-tauri/src/app_state.rs`：watcher/terminal/git 生命周期改为 worktree scope，repository mutation lock。

### Rust Git/worktree commands

- `src-tauri/src/worktrees/mod.rs`：origin branches、name validation、`~/.pi/worktrees/<project>/<worktree>` ownership marker、create/rename/delete/rollback。
- `src-tauri/src/git/mod.rs`：worktree-scoped status/diff 与 repository lock 边界。
- `src-tauri/src/filesystem/watcher.rs`：worktree root + git-dir watcher。
- `src-tauri/src/commands.rs` / `lib.rs`：新增 commands 与参数改名。

### Contracts and frontend state

- `src/bindings/generated.ts` / `index.ts`：Project/Worktree/OriginBranch DTO 与 commands。
- `src/features/projects/projectsStore.ts` / test：nested catalog、activeWorktreeId、create lifecycle。
- `src/features/projects/projectsApi.ts`：worktree APIs。
- `src/features/projects/ProjectRail.tsx` / test：分层 rows、右侧 +、创建状态。
- `src/features/projects/NewWorktreeDialog.tsx` / test：branch picker、默认名、validation/error。
- `src/features/projects/RenameWorktreeDialog.tsx` / test：rename lifecycle。
- `src/features/projects/DeleteWorktreeDialog.tsx` / test：inspect、clean/dirty/busy/force confirmation。

### Worktree-scoped resources

- `src/features/workbench/Workbench.tsx` / test：active worktree resolution 与 breadcrumb。
- `src/features/editor/editorStore.ts` / test：project scope 全量改为 worktree scope。
- `src/features/editor/EditorPane.tsx` / test。
- `src/features/files/FileTree.tsx`、`fileTreeStore.ts`、events/tests。
- `src/features/changes/ChangesPanel.tsx`、store/refresh/tests。
- `src/features/terminal/TerminalInstance.tsx`。
- `src/styles/index.css`：Project/worktree nested rail 与 modal。

## Order of work

1. 建立 Rust CatalogV2 和 V1 migration 测试，保留旧 ID 作为 main worktree ID。
2. 实现 worktree branch discovery、`~/.pi/worktrees` ownership marker、name validation/create/rollback 集成测试。
3. 实现 rename branch+path 和 delete clean/dirty/busy/force/rollback 集成测试；dirty fixture 必须分别覆盖 staged、unstaged、untracked，且非 force 删除证明目录与 catalog 均保持不变。
4. 将 AppState watcher/Git/Terminal 作用域切换到 worktree ID。
5. 更新 Tauri commands 和 TypeScript contracts。
6. 前端 store 引入 activeWorktreeId，资源 identity 全量改名并测试隔离。
7. 实现 ProjectRail 嵌套 worktree 行和 create/rename/delete dialogs。
8. 清理旧 projectId-as-checkout 命名，grep 确认剩余仅 repository-level 场景。
9. 运行完整检查、真实 remote/worktree smoke、bundle 并覆盖安装。

## Risks

- 最大风险是 repository Project ID 与 checkout Worktree ID 混用，导致文件、diff、terminal 串到错误目录。通过类型字段命名、resource ID 和跨 worktree 同路径测试约束。
- V1 migration 误判为 corrupt 会丢用户 catalog；迁移必须先解析 version，再转换并原子保存。
- linked worktree `.git` 是文件，旧 watcher 会漏 Git metadata；需要双 root watcher。
- create/rename 的 Git 多步成功后持久化失败会遗留 branch/path 漂移；必须补偿并返回 recovery details。
- delete 的 Git remove 成功后 catalog save 失败会产生 stale record；启动 reconciliation 必须可识别。
- 同名 Project 共享 `~/.pi/worktrees/<project-name>` 可能误删其他 repo；ownership marker 必须每次验证。
- 同项目并发 mutation 会竞争 ref/worktree registry；create/rename/delete 共用 repository mutation lock。
- 一次性前端重命名范围大，必须按 store→contracts→components 顺序推进，避免中间状态被打包。

## Rejected alternatives

- 把每个 worktree继续当独立 Project：无法分组、无法在 Project 行创建、无法安全区分 main/managed 所有权。
- 只给 ProjectSummary 增加 path 数组但仍共用 projectId：会让 file/diff/terminal cache 在多个 checkout 间碰撞。
- 前端自己拼 `git worktree` 路径或 branch：违反路径权限边界且无法处理并发唯一性。
- 直接复制 ThinkRail external/auto-rename：超出本次 origin-managed worktree 范围。
- Rename 只改 display name：用户明确要求目录为 `<worktree-name>`，因此 name/branch/path 必须同步。

## Proof

```bash
pnpm test -- projectsStore.test.ts ProjectRail.test.tsx NewWorktreeDialog.test.tsx RenameWorktreeDialog.test.tsx DeleteWorktreeDialog.test.tsx editorStore.test.ts
cargo test --manifest-path src-tauri/Cargo.toml projects worktrees git filesystem terminal
pnpm check
pnpm bundle
```

额外真实集成 fixture：

1. 创建 bare origin。
2. clone main project，push `main` 和 `release`。
3. `git_list_origin_branches` 返回 `main/release`，不返回 `HEAD`。
4. 创建 `worktree1` from `origin/release`。
5. 验证 cwd、branch、HEAD、无 upstream、catalog persistence、watcher、terminal cwd。
6. 同项目连续创建默认 `worktree2`。
7. Rename `worktree1 -> release-fix`，验证 branch/path/catalog 同步且 ID 不变。
8. clean delete 不带 `--force` 且保留 local branch；staged/unstaged/untracked dirty 与 busy 非 force 均拒绝并保留目录/record；显式 force delete 才关闭 Terminal、丢弃改动并删除目录。
9. 创建同名 Project ownership 冲突 fixture，验证拒绝而非复用/误删。
