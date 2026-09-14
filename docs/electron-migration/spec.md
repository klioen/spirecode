# Spec: Electron 宿主与内嵌 pi Agent SDK
Status: accepted。 Implements: `docs/electron-migration/intent.md`。

## 1. Scope

本变更将 SpireCode 桌面宿主从 Tauri 2/WKWebView/Rust 迁移为 Electron，并把当前独立 Node pi Agent sidecar 改为 Electron 受信任宿主直接调用 pi SDK。

### Included

- Electron Main、Preload、BrowserWindow、安全 CSP 和 typed IPC。
- TypeScript 实现的 Projects、Persistence、Filesystem、Watcher、Git、Worktrees 和 Terminal 服务。
- `node-pty` 驱动的真实 PTY。
- Electron 宿主内的 `ModelRuntime`、`SessionManager`、`createAgentSession` 和 Chat registry。
- 保持现有 Renderer command/event DTO 和业务行为。
- Apple Silicon macOS `.app`、`.dmg`、ad-hoc signing 和 artifact smoke。
- 将现有 Rust 与 sidecar deterministic tests 的关键行为迁移到 TypeScript tests。

### Excluded

- React 页面、布局和视觉重构。
- 新 Chat 能力、专用 Tool renderer、Markdown、模型选择器或图片附件。
- Windows/Linux 发布。
- 多窗口和远程 host。
- 将 Agent 放入新的自定义 JSON sidecar；如需隔离，未来使用 Electron utility process 并保持相同宿主 API。

## 2. Target architecture

```text
React Renderer
  ├─ existing feature modules
  ├─ existing Zustand stores
  └─ host bindings
          │ window.spire allowlist
          ▼
Electron Preload
          │ ipcRenderer.invoke / subscribed events
          ▼
Electron Main
  ├─ AppState lifecycle
  ├─ Projects + atomic persistence
  ├─ Filesystem + watcher
  ├─ Git + Worktrees
  ├─ node-pty Terminal registry
  └─ pi SDK Chat registry
```

不存在 Renderer → Rust、Rust → Node 或自定义 sidecar framing 路径。

## 3. Renderer compatibility

`src/bindings/index.ts` 继续导出当前 `commands` 对象，保留命令参数和返回 DTO。`src/features/` 中的业务组件不直接 import Electron API。

必须调整的边界仅包括：

- `src/bindings/index.ts`：从 Tauri `invoke/Channel` 改为 `window.spire`。
- `src/features/files/filesystemEvents.ts` 与 `src/features/changes/changesRefresh.ts`：使用宿主事件订阅 facade。
- Chat adapter 可改名为 host-neutral 名称；若为避免 feature churn 保留原文件名，其实现不得引用 Tauri。
- 全局类型声明描述 preload 暴露的窄接口。

命令名保持：project、worktree、fs、git、terminal 和 chat 的现有 snake_case 名称。错误保持 `{ code, message, details? }`。

## 4. Electron security

BrowserWindow 必须配置：

```text
nodeIntegration: false
contextIsolation: true
sandbox: true
```

Preload 只暴露：

```text
invoke(command, args?)
subscribe(topic, listener) -> unsubscribe
```

要求：

- command 和 topic 使用显式 allowlist；Renderer 不能传任意 IPC channel。
- Main handler 校验发送方来自当前应用窗口。
- 禁止远程 navigation、新窗口和未经允许的外部 URL。
- 生产环境加载 app 内本地 HTML；开发环境只允许配置的 loopback Vite URL。
- 不向 Renderer 暴露 `fs`、`path`、`child_process`、Electron 原语、环境变量、credentials 或 pi SDK。

## 5. App state and persistence

Electron Main 创建单个 `AppState`，拥有全部领域服务和 shutdown 顺序。数据目录使用 `app.getPath("userData")`。

Project state 保持版本化 JSON、临时文件写入、fsync/close、atomic rename。canonical root 和持久 UUID 继续作为权限边界和稳定 identity。未知新版本不得被旧应用覆盖；损坏文件备份并报告。

## 6. Projects and Worktrees

保持现有行为：

- 系统目录选择、Git root canonicalization、重复打开去重、recent catalog、close/reveal/copy path。
- 每个 project 至少有主 worktree；managed worktree create/list/select/rename/inspect-delete/delete。
- worktree 名称、路径、base ref 和 ownership marker 校验。
- 创建或 rename 失败执行明确 rollback。
- 删除前检查 dirty 和运行中 Terminal；force 删除清理 Chat、Watcher、Git queue 和 PTY。

所有 Git 进程使用 executable + argument array。

## 7. Filesystem and watcher

每个操作由 Main 根据 `worktreeId` 查找 canonical root。relative path 必须通过 component 校验、realpath/canonical containment、symlink containment 和 `.git` exclusion。

读取保持 5 MiB 上限、NUL/binary 检查、UTF-8 要求、目录优先排序和 ignore 规则。Watcher 每个活动 worktree 最多一个，事件 debounce/merge 后发送现有：

```text
filesystem://changed
git://changed
```

事件是 invalidation，不是领域事实。

## 8. Git

保留当前 status/diff DTO 和命令安全参数。使用 `spawn`，设置 deadline，超时后终止 child。解析 porcelain v2 `-z`；untracked diff 仍通过安全文件读取构造。每 worktree Git 操作串行，失败不能伪装为 clean。

## 9. Terminal

`node-pty` 替代 `portable-pty`。Main registry 保存 terminal UUID、worktree、pty、尺寸、subscriber、pending output 和退出状态。

- Shell 读取有效绝对 `$SHELL`，回退 `/bin/zsh`、`/bin/sh`。
- cwd 是 Main 解析的 canonical worktree root。
- output 在短窗口内批量发送并支持 attach 前缓存。
- write/resize/close/list 保持现有 command DTO。
- close project/worktree/app 时回收 child。
- native module 必须针对 Electron ABI rebuild，并在最终 app 与 DMG 中加载验证。

## 10. Chat via pi SDK

Electron Main 直接依赖精确版本 `@earendil-works/pi-coding-agent@0.84.4`。一个共享 `ModelRuntime`，每个 Chat 对应一个 `AgentSession`。

使用：

- `SessionManager.create(cwd)` 创建持久 session。
- `SessionManager.list(cwd)` 列出历史。
- `SessionManager.open(path, ..., cwd)` 恢复。
- `createAgentSession({ cwd, modelRuntime, sessionManager })` 创建 session。
- `session.subscribe` 归一化事件。
- `session.prompt` 配合 `preflightResult` 早确认；streaming 时使用 `followUp` 行为。
- `session.abort`、`clearQueue`、`dispose` 管理生命周期。

Main Chat registry 保持 worktree/session ownership、递增 sequence、attach snapshot fence、bounded buffering、未知事件过滤和稳定错误脱敏。Renderer 不读取 auth/model/provider 内部信息。

## 11. Packaging

移除 Tauri CLI、Cargo、Rust source、Tauri config/capabilities、Node runtime 下载和 sidecar deploy。使用固定版本 Electron 与 Electron 打包工具构建 arm64 `.app` 和 `.dmg`。

打包必须处理：

- `node-pty` native module rebuild 与 ASAR unpack。
- pi SDK production dependency closure。
- Monaco/xterm assets。
- nested native executable/code signing 后再签 app。
- 最终 app 和 mounted DMG smoke。

## 12. Testing and acceptance

自动测试至少覆盖：

- preload command/topic allowlist 和 sender validation。
- project canonicalization、persistence corruption/atomic replace。
- path traversal、absolute path、`.git`、symlink escape、大文件、binary。
- Git porcelain、special paths、timeout/error mapping。
- worktree create/rename/delete rollback。
- Terminal create/write/resize/attach/exit/cleanup。
- Chat multi-session、persistent reopen、event normalization、sequence/snapshot fence、follow-up/abort、auth error redaction。
- 现有 React tests 不因宿主迁移改变业务断言。

完成标准：

- `pnpm check` 全部退出 0。
- `pnpm bundle` 生成并验证 `.app` 和 `.dmg`。
- 真实 smoke 验证 project/files/git/worktree/terminal/chat。
- 退出应用后无遗留 PTY 或 Agent 相关 child。
- 仓库不再包含运行所需的 Tauri/Rust/sidecar 实现或依赖。

## 13. Concerns

### Native PTY ABI

`node-pty` 是迁移和打包风险最高的依赖，必须在开发和最终 artifact 两处加载测试，不能只通过单元测试推断。

### Main process responsiveness

文件、Git 和 pi 操作必须异步；不得在 Main event loop 上执行长同步 I/O。若真实 Agent smoke 显示主进程不可接受地阻塞，必须在交付前报告，不能用 UI loading 掩盖。

### Security parity

Node 能力更容易被误暴露。迁移完成不是放宽权限的理由；路径与 IPC 测试必须证明不低于现有 Rust/Tauri 边界。

### Existing uncommitted Chat implementation

Chat 代码是迁移基线的一部分。迁移应保留其行为并把 backend transport 替换为直接 SDK，不能删除测试或降低语义来缩小工作量。
