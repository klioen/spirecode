# Spec: 修复文件展示与 Changes 运行时错误
Status: accepted。 Implements: `docs/fix-files-and-changes-runtime-errors/intent.md`。

## Requirements

- `fs_read_dir.relativePath` 必须接受空字符串，并将其解释为 worktree 根目录。
- `fs_read_file.relativePath`、`git_diff_file.relativePath` 及所有 ID/名称等原有必填文本仍必须拒绝空字符串。
- `relativePath` 的 4 KiB 上限保持不变。
- macOS 文件监听必须使用单个递归原生 watcher 监听 worktree，而不是由 Chokidar 为整棵目录树持有大量描述符。
- 非 macOS 平台继续使用可移植的 Chokidar 监听实现。
- worktree 外置 Git metadata 目录仍需单独监听，以产生 `git://changed`。
- watcher 的文件变化 batching、256 path 上限、关闭与 dispose 语义保持不变。
- 不修改 Changes 的 stale-result UI 语义；资源问题消失后现有刷新路径应恢复成功。

## Design

### IPC 参数语义

在 `electron/ipc.ts` 将“字符串长度校验”和“是否允许空值”分开。仅 `fs_read_dir` 在读取 `relativePath` 时显式允许空字符串；其他调用继续使用默认非空校验。路径安全仍由 `FilesystemService` 的 `resolveProjectPath` 执行。

### Watcher 后端

为 `WatcherRegistry` 增加一个小型 watcher adapter：

- Darwin worktree root 使用 Node `fs.watch(root, { recursive: true })`。macOS 原生递归监听不会随每个文件打开一个描述符。
- 外置 Git directory 也使用同一原生 watcher adapter；其事件统一转换为绝对路径后进入现有 `collect()`。
- 其他平台保留 Chokidar，以维持 Linux/Windows 的递归兼容性。
- watcher 初始化、错误上报和关闭统一收敛到 session 的异步 `stop()`。

测试通过注入 watcher factory 固定“Darwin 选择原生递归、其他平台选择 Chokidar”和事件/清理契约，避免依赖机器 `lsof` 的脆弱断言。另保留一个 Darwin 真实临时目录集成用例，验证递归子目录变化可被捕获。

## Concerns

- `fs.watch({ recursive: true })` 的行为是平台相关的，因此只在 Darwin 启用；其他平台不改变后端。
- 原生 watcher 可能合并或省略 filename；出现空 filename 时应发送 truncated filesystem invalidation 和 Git invalidation，而不是丢事件。
- 监听根目录与外置 Git metadata 时必须正确区分路径基准，否则 Git metadata 事件可能被误报为普通项目文件。

## Proof

- IPC 回归测试证明仅根目录读取接受空 `relativePath`。
- watcher 单元测试证明后端选择、事件转换、错误降级和资源关闭。
- Darwin 集成测试证明嵌套目录变化可触发事件，且 watcher 数量不随文件数增长。
- Git、filesystem、Renderer 相关测试通过。
- `pnpm check` 全部通过。
