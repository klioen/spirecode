# Intent: 全局 Task 与自动化 TaskRun

Author: user。 Status: accepted。

## Problem

SpireCode 当前以 Project、Worktree 和 Chat session 为中心：用户必须先选择 workspace、手动创建或切换 worktree、创建 Chat，再把需求转写为 prompt。应用没有一个跨 Project 的全局任务入口，也没有把“需求、执行尝试、workspace、Pi session、结果报告、人工验收”作为可恢复的一条业务链管理。

这带来以下问题：

- 待办分散在 Chat 与用户记忆中，无法从全局视角查看进度；
- worktree 创建、session 创建和首个 prompt 提交是多个独立动作，任一步失败或应用崩溃后都缺少一致的恢复语义；
- `agent_settled` 只表示 Agent 当前 idle，不能证明需求、验收项或测试已经完成；
- 任务描述优化若复用普通 Chat，会错误获得 coding、MCP 或 extension tool 能力，并产生不必要的持久 transcript；
- 自动化若触及 PR/MR 状态、审批或合并，会越过应由人负责的发布控制边界。

## Approved outcome

- 在左侧导航的 Projects 上方增加全局 Task 模块；它不依赖当前 active project/worktree。
- 使用两个持久领域实体：
  - `Task` 表示稳定的用户意图、workspace 选择、验收标准和当前汇总状态；
  - `TaskRun` 表示一次具体执行尝试，固定关联实际 worktree 与 Pi session。
- Electron Main 在 `app.getPath("userData")/tasks.sqlite3` 中持久化 Task 领域数据，并拥有 schema migration、WAL、事务和恢复。
- 新建表单包含 title、description、project、workspace（从 `baseRef` 创建新 managed worktree，或选择 existing worktree）、acceptance criteria 和 automation。
- workspace 默认选择“从默认 `baseRef` 创建新 managed worktree”；只有用户显式切换时才使用 existing worktree。
- automation 开启时，Main 负责 saga 编排：创建或绑定 worktree、创建持久 Pi session、构造受控任务 prompt 并自动提交。
- Agent 只有通过 `task_report_result` 显式提交结构化结果，Task 才进入 `needs_review`；`agent_settled` 本身绝不表示完成。
- 到达需要用户关注的状态时同时提供应用内提醒和尽力而为的系统提醒。
- 自动化最多创建 Draft PR/MR；不得自动标记 ready、approve 或 merge。
- Renderer 只通过 allowlist 中的窄 typed IPC 使用 Task 能力，不获得 SQLite、路径、Git、Pi SDK、Notification 或通用 IPC 权限。

## Task description optimization

“AI 优化”是与任务执行完全不同的临时能力：

- 使用 Pi SDK `SessionManager.inMemory`；
- 只注册受控 custom tool `submit_task_rewrite`；
- 不加载 coding tools、MCP、extensions、skills、prompt templates 或项目 context files；
- 不创建 JSONL transcript，不写入 `tasks.sqlite3`，不把优化对话写入日志；
- 优化结果先作为可撤销的表单草稿应用，用户提交 Task 前始终可以恢复原值。

## Users and systems affected

- 用户：获得跨项目任务列表、自动执行进度、恢复提示、结果报告与人工验收入口。
- Renderer：新增 `src/features/tasks/`，左侧 rail 与 workbench 增加 Task 导航/页面，但仍保持 sandboxed。
- Electron Main：新增 Task repository、orchestrator、Pi execution/rewrite adapters、notification service 与 IPC handler。
- Project/Worktree/Chat：复用其 identity 和受信任 Main 服务，但 TaskRun 生命周期不由普通 Chat UI 的 idle 状态推导。
- 发布与兼容：新增 SQLite 持久格式；旧版本不会读取它，回滚必须保留数据库且不得破坏现有 `state.json` 或 Pi JSONL。

## Constraints

- 不改变 Renderer 的安全模型：`nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`。
- 所有 filesystem、Git、worktree、Pi session 和 SQLite 操作只在 Main；Git 继续使用 executable + argument array 和 hardened runner。
- Task 只保存 project/worktree/session identity 与结构化报告，不复制文件正文、diff、terminal output 或 Chat transcript。
- existing worktree 永不由 Task 自动删除；Task 创建的 managed worktree 也不得因普通取消或失败自动删除有改动的目录。
- acceptance criteria 是有序、非空的文本项；Agent 报告必须逐项给出状态与证据。
- 任务运行失败、应用退出和崩溃不得被伪装成成功；恢复必须可重复并留下可诊断状态。
- V1 不把 Task 变成远端 issue tracker，也不实现无人值守审批/合并。

## Risk decision

本变更判定为**高风险**，不是因为 UI 规模，而是因为同时命中 SDLC 高风险条件：新增 SQLite schema 与 migrations；跨 Main/Preload/Renderer 的公共 IPC 契约；创建/复用 filesystem worktree 并运行具备 coding 能力的 Agent；跨 SQLite、Git worktree 和 Pi JSONL 的非原子 saga；系统通知与崩溃恢复；以及 PR/MR 权限边界。必须先以本目录完整 `intent.md`、`spec.md`、`plan.md` 固化决策，并在后续代码实施前再次获得明确批准。

## Success criteria

- 用户能从 Projects 上方进入全局 Task 页面，创建、查看、筛选并打开 Task。
- 默认路径会创建 managed worktree、持久 Pi session 并自动发送一次且仅一次首个 prompt。
- existing worktree 路径不会创建或接管 worktree，dirty workspace 需显式确认。
- 应用在每个 saga 边界崩溃后可恢复或进入明确可重试状态，不重复创建 worktree/session/prompt。
- `agent_settled` 无报告时显示等待报告/可恢复状态；只有有效 `task_report_result` 进入 `needs_review`。
- 用户人工验收后才能标记 completed；Draft PR/MR 不被自动 ready、approve 或 merge。
- AI 优化无持久 session、无 coding/MCP/extension tools，结果可撤销。
- Task 数据不进入 Zustand 大对象或项目目录，窄 IPC、安全校验、migrations 和通知均有自动化测试。

## Non-goals

- 远端任务/Issue 双向同步、多人协作、云同步。
- 定时任务、并行子任务 DAG、依赖管理或批量无人值守执行。
- 自动 approve、ready、merge、release 或部署。
- 在 V1 自动删除 managed worktree、branch、Pi transcript 或 Task 历史。
- 将通用 Chat 替换为 Task，或让 Task rewrite session 出现在 Chat History。
