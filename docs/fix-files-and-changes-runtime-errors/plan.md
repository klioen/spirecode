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

- 新增测试先红后绿。
- `pnpm vitest run electron/ipc.test.ts electron/domains/filesystem/watcher.test.ts electron/domains/filesystem/filesystem.test.ts electron/domains/git/git.test.ts`
- `pnpm check`
- `pnpm bundle`，安装后用 `lsof -p <main-pid>` 确认 FD 保持在常量级，并手动确认文件树与 Changes 正常加载。
