# Intent: 基于 pi Agent 的多 Tab Chat
Author: keliangliang。 Status: accepted。

## Problem

SpireCode 当前只能浏览项目、查看 Git Changes、打开 Terminal，不能直接在当前 worktree 中启动 pi Agent 对话。用户需要离开桌面应用进入终端运行 pi，也无法把多个 Agent 会话作为中央工作资源与文件、diff、Terminal 一起切换。

现有 Tauri/Rust 后端不能直接链接 Node/TypeScript 形式的 `@earendil-works/pi-coding-agent` SDK。若仅为 Chat 将整个后端迁移到 Bun，会重写已经可用的 Projects、Worktrees、Files、Git、Terminal、持久化和打包能力。

## Proposed outcome

保留 Tauri/Rust 作为 SpireCode 主后端，增加一个由 Rust 启动和监管的常驻 Node sidecar。sidecar 在进程内使用 pi Agent SDK，为每个 Chat 创建独立的持久化 Agent session。

用户可以在当前 worktree 中点击 `New chat`，立即在中央区域打开 Chat Tab；多个 Chat、文件、diff 和 Terminal 可以并列存在。Chat 支持发送消息、流式文本、Thinking、工具执行、运行中 follow-up、Stop，以及关闭后从 Chat History 重新打开。应用重启后可以从 pi transcript 恢复会话。

## Affected users and systems

- 中央资源 Tab、Workbench 和 Chat 交互。
- Rust AppState、命令注册、进程监管和 worktree 生命周期。
- 新增 Node sidecar、pi Agent SDK、session persistence 和事件协议。
- macOS `.app` / `.dmg` 打包、签名和 smoke test。
- 当前文件/Git watcher：Agent 修改 worktree 后应继续触发现有刷新链路。

## Constraints

- 一个 Chat Tab 对应一个 pi `sessionId`；同一 worktree 可以创建多个 Chat。
- Chat session 绑定创建时的 `worktreeId`，sidecar 的 `cwd` 必须来自 Rust 保存的 canonical worktree root，WebView 不提交绝对路径。
- Rust 是 sidecar 的唯一进程 owner；WebView 不获得通用 shell、filesystem 或外部网络 capability。
- sidecar 常驻并管理多个 session，不为每条消息或每个 Tab 启动新的 Node runtime。
- 使用 `@earendil-works/pi-coding-agent` SDK，不通过 `pi --print` 执行单轮消息。
- 使用 pi 的 `SessionManager` JSONL transcript 作为 durable conversation truth；Zustand 不保存完整 transcript、Thinking 或 tool output。
- 关闭 Tab 只移除本窗口 placement，不删除 session、不自动中止正在运行的 Agent；通过 Chat History 可重新打开。
- `agent_settled` 是 run 回到 idle 的唯一完成边界，不能把 `agent_end` 当作最终完成。
- 第一版沿用用户现有 pi 模型、认证、settings、AGENTS.md、skills、prompt templates 和 extensions；不新增登录、模型管理或 extension 管理 UI。
- 第一版允许 pi 默认 coding tools（包括 read、bash、edit、write）在 sidecar 中运行，使 Agent 能修改当前 worktree；这不是 OS sandbox，不能承诺命令无法访问 worktree 外路径。
- npm 和 Cargo 依赖必须精确固定并提交 lockfile。发布产物不能依赖用户机器预装 Node 或正确的 shell `PATH`。
- 第一版只验收 macOS Apple Silicon，与当前 SpireCode 发布目标一致。

## Open questions

- sidecar 内默认 pi tools 拥有本机用户权限且 `bash` 可以离开 cwd；是否需要在后续版本增加审批或沙箱，需要根据实际使用决定。
- 第一版不提供永久删除 transcript 的 UI；磁盘清理策略留到 Chat 管理功能阶段。
