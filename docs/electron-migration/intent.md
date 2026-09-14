# Intent: 将 SpireCode 从 Tauri 迁移到 Electron
Author: user。 Status: accepted。

## Problem

SpireCode 当前由 React/WKWebView、Tauri/Rust 领域后端和独立 Node pi Agent sidecar 组成。pi Agent 本身是 TypeScript SDK，这使 Chat 必须经过 Renderer → Tauri → Rust → Node sidecar 的多层桥接；Projects、Files、Git、Worktrees、Terminal、打包和测试也分散在 Rust 与 Node 两套运行时中。

## Proposed outcome

- 使用 Electron 替代 Tauri，保留现有 React 业务 UI、交互和前端领域状态。
- 将 Projects、Filesystem、Watcher、Git、Worktrees、Persistence 和 Terminal 后端迁移到 Electron 的受信任 Node 宿主层。
- Electron 宿主直接使用 `@earendil-works/pi-coding-agent` SDK 管理 Chat，不再使用自定义 pi sidecar 进程和 Rust 转发协议。
- 保持现有 typed command/event 契约，使 React feature 组件无需感知宿主迁移。
- 继续生成可安装的 Apple Silicon macOS `.app` 和 `.dmg`，并通过完整自动化检查和真实 smoke 验证。

## Affected users and systems

- SpireCode macOS 用户：应用运行时、包体、内存、Terminal、Chat 和本地项目行为。
- React Renderer：仅宿主 bindings、事件 adapter 和 preload 类型发生变化。
- 桌面宿主：Tauri/Rust 被 Electron Main/Preload 和 TypeScript 领域服务替换。
- 构建发布：Cargo/Tauri 流程被 Electron 打包、native module rebuild、签名和 DMG 流程替换。

## Constraints

- React 业务组件、布局、Monaco、xterm.js、Zustand stores、Chat reducer/runtime/UI 和产品交互保持不变。
- Renderer 必须保持 `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`，不能获得通用 filesystem、shell、IPC 或 pi SDK 权限。
- 文件访问继续只接受 `worktreeId + relativePath`，必须防止 absolute path、parent traversal、`.git` 访问和 symlink escape。
- Git 继续使用参数数组，不使用 shell command string；保留超时、hook/credential/external protocol 限制。
- Terminal 使用 `node-pty`，输出不进入 Zustand；关闭 worktree/project/app 必须清理 child。
- pi Agent SDK 只能运行在受信任宿主层；pi JSONL session 继续作为 transcript 权威源。
- npm 依赖固定精确版本并提交 lockfile。
- 当前尚未提交的 Chat 实现必须保留其行为和测试，不得以删除功能完成迁移。

## Open questions

无阻塞问题。若直接运行 pi SDK 或工具导致 Electron Main 明显阻塞，后续可将 Agent runtime 移到 Electron utility process；本次不保留当前自定义 sidecar 协议。
