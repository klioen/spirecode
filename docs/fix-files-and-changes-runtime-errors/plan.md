# Plan: 修复文件展示与 Changes 运行时错误（from `docs/fix-files-and-changes-runtime-errors/spec.md` 2026-09-15）

## Files that change

- `electron/ipc.ts`：允许 `fs_read_dir` 的空根路径，同时保留其他字段的非空限制。
- `electron/ipc.test.ts`（新增）：覆盖命令级 IPC 参数语义。
- `electron/domains/filesystem/watcher.ts`：Darwin 改用单个原生递归 watcher，其他平台保留 Chokidar，并统一事件及清理。
- `electron/domains/filesystem/watcher.test.ts`（新增）：覆盖 watcher 后端选择、事件、降级和关闭。
- `docs/fix-files-and-changes-runtime-errors/{intent,spec,plan}.md`：记录根因、范围和验证证据。

## Order of work

1. 添加 IPC 回归测试，复现 `fs_read_dir(relativePath: "")` 被拒绝，并确认测试先失败。
2. 添加 watcher factory/平台选择测试，复现 Darwin 仍选择逐文件 Chokidar 的资源风险，并确认测试先失败。
3. 调整 IPC 文本校验，使 allow-empty 只作用于 `fs_read_dir.relativePath`。
4. 实现 Darwin 原生递归 watcher adapter，复用现有 batching 与事件映射；保留非 Darwin fallback。
5. 运行新增测试、filesystem/Git/Renderer 相关测试，再运行 `pnpm check`。
6. 如完整检查通过，重新 bundle；在安装包进程上验证文件树、Changes 和 FD 数量不再随仓库文件数线性增长。

## Risks

最危险的是 watcher 后端切换后丢失外置 `.git` 目录事件，或将 metadata 路径错误地当作 worktree 文件路径。实现会为每个 watch target 保留明确基准，并让所有事件进入同一 `collect()`；空 filename 采用全量失效降级。

不能只修改 Changes UI、重试 Git spawn 或提高 fd limit：这些方案会隐藏症状，无法阻止 watcher 的线性资源占用。也不全局放开空字符串，否则会削弱 ID、文件读取和 diff 的输入契约。

## Proof

- 新增测试先红（3 个预期失败）后绿（4/4 通过）。
- 针对性 Electron 测试：5 个文件、19 个测试通过。
- `pnpm check`：35 个文件、126 个测试通过，format、brand、lint、typecheck 全部通过。
- `pnpm bundle`：应用与 DMG 构建、签名验证、smoke 全部通过。
- 使用独立 `user-data-dir` 启动新构建并加载 3 个持久化项目：Main 进程 114 个 FD、仓库相关 FD 21 个，日志无 `spawn EBADF`；旧安装版现场为约 10,700 个 FD。
