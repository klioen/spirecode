# Spec: 全局 Task、TaskRun 与可恢复自动化

Status: accepted。 Implements: `docs/task-module/intent.md`。

Current queue admission and report-visibility behavior is amended by `docs/task-background-dispatch/change.md`; lifecycle/session/cleanup behavior is amended by `docs/task-lifecycle-cleanup/spec.md`.
Current state-driven UI and bounded read-model filters are amended by `docs/task-ui-workbench/change.md`.
Conversational New Task intake and approved-commit workspace provisioning are defined by `docs/task-intake/change.md`; existing TaskRun orchestration and manual review remain unchanged.
Known additive Task schema v5 compatibility and initialization diagnostics are defined by `docs/task-schema-v5-compat/change.md`; existing v5 data is preserved, and unknown newer schemas remain rejected.

## 1. V1 scope

### 1.1 Included

- Projects 上方的全局 Task 导航、任务列表、详情、新建表单、运行进度、结构化结果与人工验收。
- `Task` + `TaskRun` 模型；一个 Task 可有多个顺序执行的 Run，但同一时刻最多一个 active Run。
- workspace 二选一：
  - `new_managed`：从 project 的 origin `baseRef` 新建 managed worktree，默认选项；
  - `existing`：绑定该 project 已登记的 main/managed/external worktree。
- Main 中的 SQLite repository、migration、WAL、saga orchestrator、Pi execution adapter、rewrite adapter 和通知。
- automation 开启后自动 provision、创建 Pi session、发送首个 prompt；关闭时 Task 留在 backlog，用户点击 Run 才创建 TaskRun。
- 失败重试、应用重启恢复、取消 active Agent、人工“完成”与“请求修改”。
- Agent 可使用正常受信任 coding session 的能力完成代码任务，并额外获得唯一结果上报工具 `task_report_result`。
- 如果 Agent/用户流程创建 PR/MR，它必须保持 Draft；V1 不执行 ready、approve、merge。

### 1.2 Excluded

- 远端 issue/project-management 同步、协作者与权限分配、截止日期、排期、依赖 DAG。
- 多个 active Run、同一 Task 的并行 workspace、跨 project Task。
- 自动清理 branch/worktree/transcript；自动 push、自动创建 PR/MR 不是完成 Task 的必要条件。
- 自动 ready/approve/merge、CI 绕过、部署与 release。
- Task rewrite 历史、rewrite transcript、rewrite 后台运行。
- 将完整 Pi transcript、diff、文件正文或 tool output复制进 SQLite。

## 2. Architecture and ownership

```text
Sandboxed React Renderer
  ├─ src/features/tasks: list/detail/form/view metadata
  └─ narrow task commands + task://event invalidation
             │ window.spire allowlist
             ▼
Electron Main / AppState
  ├─ TaskService (validation + transactions)
  ├─ TaskRepository (tasks.sqlite3)
  ├─ TaskOrchestrator (durable saga + recovery)
  ├─ TaskExecutionAdapter (persistent Pi coding session)
  ├─ TaskRewriteAdapter (in-memory restricted Pi session)
  ├─ TaskNotificationService
  └─ existing ProjectService / WorktreeService / Chat/Pi services
             ├─ Git/worktree filesystem
             ├─ Pi JSONL sessions
             └─ userData/tasks.sqlite3
```

Main 是 Task 事实源。Renderer 的 Zustand store 只保存当前 filter、selection、表单 UI 状态和分页结果；不保存 transcript、报告大对象、saga journal 或完整历史。`task://event` 只是失效/轻量状态事件，Renderer 收到后按 revision 重新查询。

TaskRun 使用普通 Pi 持久 session，但由 Task domain 管理。它可以在 Task 详情中打开对应 Chat 视图；普通 Chat attach 仍必须校验 `worktreeId + sessionId`。Task 状态绝不从 Renderer Chat reducer 推断。

## 3. Domain model

### 3.1 Task

```ts
type TaskStatus =
  | "backlog"
  | "queued"
  | "running"
  | "needs_review"
  | "completed"
  | "failed"
  | "cancelled";

type WorkspaceRequest =
  | { mode: "new_managed"; baseRef: string }
  | { mode: "existing"; worktreeId: string; allowDirty: boolean };

interface Task {
  id: string;
  title: string;
  description: string;
  projectId: string;
  workspace: WorkspaceRequest;
  automationEnabled: boolean;
  status: TaskStatus;
  activeRunId: string | null;
  revision: number;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}
```

Validation:

- IDs are UUIDs generated in Main；Renderer supplied IDs are never trusted as ownership proof.
- title trim 后 1–200 UTF-8 bytes；description 0–64 KiB。
- project 必须存在；Git project 默认使用 Task 专属 managed worktree，也可显式选择 existing worktree；Directory project 只能绑定其 synthetic main workspace，不能创建 managed worktree。
- `new_managed.baseRef` 必须继续通过现有 origin branch allowlist；默认是 `listOriginBranches().defaultRef`。
- `existing.worktreeId` 必须属于所选 project。Main 在启动时重新检查 dirty 状态；dirty 时只有表单已明确提交 `allowDirty: true` 才继续，否则返回 `TASK_WORKSPACE_DIRTY_CONFIRMATION_REQUIRED`。
- automation 默认 `true`；切换为 false 只影响是否提交后立即运行，不削弱执行 session 的安全策略。

Task 的 status 是其最新业务状态：创建但未运行为 backlog；已排队/执行跟随 active Run；有效报告后 needs_review；用户验收后 completed；编排不可继续时 failed；用户取消且无可审阅报告时 cancelled。

### 3.2 TaskRun

```ts
type TaskRunStatus =
  | "queued"
  | "provisioning"
  | "prompting"
  | "running"
  | "awaiting_report"
  | "reported"
  | "failed"
  | "cancelled";

type SagaPhase =
  | "created"
  | "workspace_intent"
  | "workspace_ready"
  | "session_intent"
  | "session_ready"
  | "prompt_intent"
  | "prompt_accepted"
  | "active"
  | "terminal";

interface TaskRun {
  id: string;
  taskId: string;
  attempt: number;
  status: TaskRunStatus;
  sagaPhase: SagaPhase;
  projectId: string;
  worktreeId: string | null;
  ownsManagedWorktree: boolean;
  worktreeName: string | null;
  baseRef: string | null;
  sessionId: string | null;
  sessionPath: string | null;
  promptMarker: string;
  report: TaskRunReport | null;
  error: TaskRunError | null;
  revision: number;
  createdAt: number;
  startedAt: number | null;
  settledAt: number | null;
  reportedAt: number | null;
  finishedAt: number | null;
}
```

`attempt` 在同一 Task 内从 1 单调递增。数据库 unique constraint 保证一个 Task 只有一个非 terminal Run；业务队列保证同一 worktree 只有一个 active TaskRun，避免两个 Agent 同时修改同一 checkout。新 managed worktree 名称由 Main 从 `task-<short-id>-<slug>` 生成并通过现有 worktree name/branch 冲突检查；显示标题变化不重命名既有 branch。

### 3.3 Structured result

Execution session 注册 Main 控制的 custom tool：

```ts
task_report_result({
  runId: string,
  outcome: "success" | "blocked" | "failed",
  summary: string,
  tests: Array<{
    command: string;
    status: "passed" | "failed" | "not_run";
    summary: string;
  }>,
  changeRequest?: {
    kind: "github_pr" | "gitlab_mr" | "other";
    url: string;
    draft: true;
  }
})
```

Main 校验 tool invocation 来自该 Run 的 live session、`runId` 精确匹配、summary/tests 文本与数组大小受限、URL 为 `https`，且 change request 必须 `draft: true`。首个有效报告以 SQLite 事务写入；重复完全相同调用幂等返回成功，内容不同的第二次调用返回 `TASK_RESULT_ALREADY_REPORTED`。报告本身不等于用户验收：任何 outcome 的有效报告都使 Run=`reported`、Task=`needs_review`，由 UI 明确展示 outcome。

## 4. State machines

### 4.1 Task transitions

```text
create, automation=false -> backlog
create, automation=true  -> queued -> running
backlog --Run--> queued -> running
running --valid task_report_result--> needs_review
running --orchestration failure--> failed
running --user cancel, no report--> cancelled
needs_review --Accept--> completed
needs_review --Request changes--> queued (new TaskRun)
failed/cancelled --Retry--> queued (new TaskRun)
backlog/failed/cancelled --Cancel--> cancelled
```

Completed Task 在 V1 不重新打开；用户要继续修改时创建新 Task。Task 字段仅在 backlog/failed/cancelled 且无 active Run 时可编辑；needs_review 只允许验收、查看和请求修改，避免报告与需求基线漂移。

### 4.2 Run transitions and Pi events

```text
queued -> provisioning -> prompting -> running
running --agent_settled without report--> awaiting_report
awaiting_report --follow-up/resume--> running
running|awaiting_report --valid task_report_result--> reported
queued|provisioning|prompting|running|awaiting_report --cancel--> cancelled
non-terminal --unrecoverable error--> failed
```

- `agent_start` 可把 prompting/awaiting_report 推进到 running。
- `agent_end` 不改变完成状态。
- `agent_settled` 只记录 `settledAt` 并把无报告 Run 置为 `awaiting_report`；Task 仍为 running。UI 显示“Agent 已停止但尚未提交结果”，提供“继续并要求报告”和“取消”。
- report tool 是进入 `reported/needs_review` 的唯一 Agent 路径。
- abort 的完成事件不自动报告。取消先持久化 cancel intent，再 abort/clear queue；最终写 cancelled。
- Pi/model/auth 错误保留可重试错误；不得转换为 needs_review/completed。

## 5. SQLite schema and migrations

数据库固定在 `app.getPath("userData")/tasks.sqlite3`。V1 使用 Electron 所带 Node runtime 的 `node:sqlite`，不向 Renderer 暴露连接，也不引入第二个 native SQLite addon。repository 在 Main 内串行写事务；查询分页并限制返回体，禁止在 Main event loop 中做无界扫描。

启动连接设置：

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA busy_timeout = 5000;
PRAGMA wal_autocheckpoint = 1000;
```

核心 schema（时间为 Unix epoch milliseconds，boolean 为 CHECK 约束的 0/1）：

```sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at INTEGER NOT NULL
) STRICT;

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  project_id TEXT NOT NULL,
  workspace_mode TEXT NOT NULL CHECK (workspace_mode IN ('new_managed','existing')),
  requested_worktree_id TEXT,
  base_ref TEXT,
  allow_dirty INTEGER NOT NULL CHECK (allow_dirty IN (0,1)),
  automation_enabled INTEGER NOT NULL CHECK (automation_enabled IN (0,1)),
  status TEXT NOT NULL CHECK (status IN ('backlog','queued','running','needs_review','completed','failed','cancelled')),
  active_run_id TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
) STRICT;

CREATE TABLE task_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  attempt INTEGER NOT NULL CHECK (attempt > 0),
  status TEXT NOT NULL CHECK (status IN ('queued','provisioning','prompting','running','awaiting_report','reported','failed','cancelled')),
  saga_phase TEXT NOT NULL CHECK (saga_phase IN ('created','workspace_intent','workspace_ready','session_intent','session_ready','prompt_intent','prompt_accepted','active','terminal')),
  project_id TEXT NOT NULL,
  worktree_id TEXT,
  owns_managed_worktree INTEGER NOT NULL CHECK (owns_managed_worktree IN (0,1)),
  worktree_name TEXT,
  base_ref TEXT,
  session_id TEXT,
  session_path TEXT,
  prompt_marker TEXT NOT NULL UNIQUE,
  report_json TEXT CHECK (report_json IS NULL OR json_valid(report_json)),
  error_code TEXT,
  error_message TEXT,
  error_retryable INTEGER CHECK (error_retryable IS NULL OR error_retryable IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  settled_at INTEGER,
  reported_at INTEGER,
  finished_at INTEGER,
  UNIQUE(task_id, attempt)
) STRICT;

CREATE TABLE task_run_steps (
  run_id TEXT NOT NULL REFERENCES task_runs(id) ON DELETE CASCADE,
  step TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('intent','done','failed')),
  details_json TEXT CHECK (details_json IS NULL OR json_valid(details_json)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, step)
) STRICT;

CREATE TABLE task_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  run_id TEXT REFERENCES task_runs(id) ON DELETE RESTRICT,
  type TEXT NOT NULL,
  payload_json TEXT CHECK (payload_json IS NULL OR json_valid(payload_json)),
  created_at INTEGER NOT NULL
) STRICT;

CREATE TABLE task_notifications (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  run_id TEXT,
  kind TEXT NOT NULL,
  app_read_at INTEGER,
  system_sent_at INTEGER,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (task_id, run_id, kind)
) STRICT;

CREATE INDEX task_list_idx ON tasks(status, updated_at DESC, id);
CREATE INDEX task_runs_task_idx ON task_runs(task_id, attempt DESC);
CREATE INDEX task_events_task_idx ON task_events(task_id, sequence DESC);
```

`tasks.active_run_id` 由应用事务维护，不声明循环 FK；repository 在每次写入和启动恢复时校验它指向同 Task 的非 terminal Run。partial unique index 保证每 Task 最多一个 active Run：

```sql
CREATE UNIQUE INDEX one_active_run_per_task
ON task_runs(task_id)
WHERE status IN ('queued','provisioning','prompting','running','awaiting_report');
```

Migration 规则：

1. 空库在单个 `BEGIN IMMEDIATE` 中创建当前 v3 schema，并写入连续的 v1、v2、v3 migration rows。
2. v2 → v3 migration 在一致性备份后删除 `tasks.acceptance_criteria_json` 列，并从所有非空 `task_runs.report_json` 中删除 `acceptanceCriteria` key；其余 Task、Run、summary、tests 和 change request 数据保持不变。迁移失败时保留 pre-v3 backup；迁移成功后删除所有 app-managed `tasks.sqlite3.pre-v*.bak`，避免备份继续保存已删除数据。
3. 每个后续 migration 是单独编号、前向 only、事务化且可重复检测；不允许静默跳过未知更高版本。
4. migration 前执行 `PRAGMA quick_check`；失败则关闭 DB、保留原文件/WAL/SHM、进入只读故障页，不新建空库覆盖。
5. schema migration 前用 SQLite `VACUUM INTO` 一致性快照生成 `tasks.sqlite3.pre-v<N>.bak`；migration 在事务中执行，失败回滚原库并保留 backup，报告稳定错误。普通 migration 成功后保留最近一个；v3 数据删除 migration 成功后按第 2 条删除所有 app-managed migration backup。
6. 正常关闭执行被动 checkpoint；升级/备份前执行 `wal_checkpoint(TRUNCATE)`。崩溃依赖 WAL 恢复，不手工删除 `-wal/-shm`。
7. 所有字段更新使用 `WHERE id=? AND revision=?` 乐观并发；冲突返回 `TASK_CONFLICT` 并要求 Renderer refresh。

## 6. Durable saga and crash recovery

SQLite 无法与 Git worktree 或 Pi JSONL 做分布式事务。每个外部副作用遵循“先持久化 intent，再执行/探测副作用，再持久化 done”的 journal 模式；恢复器按 `saga_phase + task_run_steps` 重放，操作必须可探测、可收敛。

### 6.1 Provision order

1. 事务创建 Task/Run/Event，状态 queued，生成固定 run ID、prompt marker 和（new managed 时）确定性 worktree name。
2. 写 `workspace:intent`。
3. `new_managed` 调用扩展后的 WorktreeService，用既定 name 创建；`existing` 重新校验 ownership/dirty/busy。探测 catalog + Git worktree list + owner marker 后写 `workspace:done` 与 worktree ID。
4. 写 `session:intent`。以 worktree canonical cwd 创建持久 Pi session，立即把 session name 设为 `SpireCode Task <runId>`；通过 `SessionManager.list(cwd)` 的唯一 name/ID 探测并收敛，然后写 session ID/path。
5. 写 `prompt:intent`。prompt 首尾含不可伪造为其他 Run 的固定 marker `spire-task-run:<runId>`、结构化需求、报告工具要求和 Draft-only policy。
6. attach session 并检查 transcript 是否已有完全匹配 marker 的 user prompt；没有才提交。Pi `preflightResult` 确认 accepted 后写 `prompt:done`。因此崩溃恢复不会重复首个 prompt。
7. 订阅 session events/tool calls，Run=running、Task=running。

外部操作成功但 DB done 未写入时，恢复器优先探测并 adopt，不能盲目创建第二份资源。探测出现多个候选、identity 不一致或 owner marker 冲突时停止为 `failed`，错误标为需人工处理，不删除资源。

### 6.2 Startup recovery

AppState 创建顺序为 ProjectService → TaskRepository/migrations → TaskService → recover → IPC ready。恢复器串行扫描非 terminal Runs：

- project/worktree 不存在：标记 `TASK_WORKSPACE_MISSING` failed；不猜测路径。
- intent worktree 已存在且 ownership/name/baseRef 匹配：adopt；不匹配则 failed。
- session intent 已存在唯一 task name：adopt；否则创建。
- prompt intent：检查 marker；已有则 attach，不再发送；没有则发送。
- session idle 且无报告：Run=`awaiting_report`，Task 仍 running。
- session 正在 streaming：恢复订阅并保持 running。
- report 已在 SQLite：强制收敛为 reported/needs_review。

恢复本身写 audit event。单个 Run 的恢复失败不阻止其他 Task 或 Projects 启动；数据库不可打开/迁移则 Task 模块进入 unavailable，其他模块仍可用。

### 6.3 Cancellation and cleanup

- cancel intent 先入库，再 `clearQueue + abort`，最后 terminal 状态；崩溃恢复会继续 abort。
- 取消/失败不自动删除 worktree、branch、session 或用户改动。
- `new_managed` 资源标记 `ownsManagedWorktree=true` 仅用于 UI 和未来显式 cleanup；V1 不据此自动删除。
- existing worktree 永不由 Task delete/rename；关闭 project 不删除 Task。关闭 project 时可 detach live runtime，Task 标记可恢复；重新打开/启动时恢复。

## 7. Pi execution and rewrite isolation

### 7.1 Task execution session

Execution 使用持久 `SessionManager.create/open` 和当前共享 `ModelRuntime`，cwd 只能由 Main 从 worktree ID 解析。它沿用普通 Chat 的 coding 能力与资源策略，并额外注入 Main-owned `task_report_result`；同名 extension tool 冲突时 TaskRun 启动失败，不能被覆盖。结果 tool handler 不信任模型声明的 project/worktree/session identity，而使用注册时闭包绑定的 run ID。

系统/开发 prompt 明确：

- 按 description 工作并运行合理验证；
- 完成、阻塞或失败都必须调用 `task_report_result`；
- `agent_settled` 不代表 Task 完成；
- 若创建 GitHub PR/GitLab MR，只能 Draft；不得 ready、approve、merge；
- 不应删除 existing worktree 或更改 Task 数据库。

V1 不承诺阻止 coding Agent 通过 bash 调用所有外部 CLI；Draft-only 是 prompt + 结果 schema + UI/host orchestration 的产品边界，SpireCode 自身绝不提供 ready/approve/merge IPC/tool。若未来需要强制阻断，必须增加命令策略/OS sandbox，另立高风险设计。

### 7.2 AI optimization session

Task form 的“AI 优化”由独立 `TaskRewriteAdapter` 执行：

- `SessionManager.inMemory(cwd)`；cwd 使用 userData 内空的受控 rewrite 目录，不使用 project/worktree cwd；
- 创建专用 AgentSession，禁止默认 coding tools；
- resource loader 设置 no extensions、no skills、no prompt templates、no themes、no context files、no MCP；
- 仅注册 `submit_task_rewrite`，参数只能是 title 和 description；project、workspace、automation 不允许由模型改变；
- custom tool 至多成功一次，必须通过与 Task 相同的长度/条数校验；普通文本输出不能直接改表单；
- 单次请求 60 秒超时、同一窗口仅一个 active rewrite，可 abort；settled 未调用 tool 视为失败；
- session 在 apply/reject/cancel/关闭表单后 dispose；无 JSONL、无 SQLite、无日志正文。

Renderer 在调用前保存一份原始字段 snapshot。Apply 只更新本地 form draft 并展示 Undo；Undo 恢复 snapshot。再次优化会以当前 draft 为新 snapshot。提交 Task、关闭表单或刷新页面后 undo history 消失，符合“不持久化”。

## 8. IPC contract

新增 allowlisted commands：

```text
task_list({cursor?, limit, statuses?}) -> TaskPage
task_get({taskId}) -> TaskDetail
task_create({input}) -> TaskDetail
task_update({taskId, expectedRevision, patch}) -> TaskDetail
task_run({taskId, expectedRevision}) -> TaskDetail
task_cancel({taskId, expectedRevision}) -> TaskDetail
task_request_changes({taskId, expectedRevision, note}) -> TaskDetail
task_complete({taskId, expectedRevision}) -> TaskDetail
task_continue_for_report({taskId, expectedRevision}) -> TaskDetail
task_notifications_list({cursor?, limit}) -> NotificationPage
task_notification_mark_read({taskId, runId?, kind}) -> void
task_rewrite_start({input}) -> {rewriteId}
task_rewrite_abort({rewriteId}) -> void
```

新增 topic：

```text
task://event -> {
  taskId?: string;
  runId?: string;
  revision?: number;
  kind: "changed" | "notification" | "rewrite_result" | "rewrite_failed";
  rewriteId?: string;
  payload?: bounded DTO;
}
```

约束：

- 所有 command/topic 进入 `electron/contracts.ts` allowlist、`electron/ipc.ts` exact-field validation 和 sender/main-frame/location validation。
- Task create input 总计上限 96 KiB；分页 limit 1–100；cursor 是 opaque `(updatedAt,id)` token；列表不返回 description/report/event history。
- `task_get` 返回一个 Task、runs 的分页摘要、当前 report；不返回 transcript。
- rewrite event 用 renderer-generated subscription/rewrite ID 关联，窗口销毁自动 abort/dispose；其他 Renderer 不能 attach。
- 错误继续使用 `{code,message,details?}`，details 不含绝对 session path、prompt、tool 参数、credentials 或 provider body。
- preload 仍只暴露 `invoke/subscribe`，没有 SQLite/Notification/Pi/Git 原语。

## 9. UI and interaction

### 9.1 Navigation and list

- 左 rail brand 下方、Projects heading 上方增加固定 Task row，显示未完成数量和 active spinner；它不属于 project DnD 区域。
- 点击进入全局 Task page；project 未打开时仍可查看历史 Task。创建/运行需选择当前 catalog 中的 project；Directory project 只能使用其现有 synthetic main workspace。
- 列表按 `updatedAt DESC, id DESC` 分页，默认展示 backlog/queued/running/needs_review/failed；可筛选 completed/cancelled。
- 状态、project、workspace、最近更新时间和需要处理的错误具备可访问文本，不只依赖颜色。

### 9.2 New Task form

字段顺序：title → description → AI 优化 → project → workspace → automation。

- project 选择后加载其 worktree 与 origin branches。
- workspace 默认 `New managed worktree` + default origin ref；用户可切为 existing worktree。
- existing dirty 状态在提交前由 Main 最终校验；UI 弹出明确确认后才以 `allowDirty=true` 重试，不缓存永久授权。
- automation switch 默认 on，说明“提交后自动创建/绑定 workspace 并启动 Agent”。off 时只创建 backlog。
- 提交是 single-flight；成功后打开 Task detail。失败保留 draft。

### 9.3 Detail and review

- 时间线展示 saga phase、worktree、session、agent running/idle、错误和 report，不渲染未脱敏原始 event payload。
- `awaiting_report` 显示“Agent 已停止，尚未提交结果”，不能显示 completed；提供 Continue for report、Cancel。
- needs_review 展示 summary、tests 和 Draft PR/MR link；按钮为 Accept completion 与 Request changes。
- Request changes 要求 note，创建下一 attempt 并沿用同一 workspace，除非原 workspace 缺失；V1 不在该动作中切 workspace。
- completed 只来自用户动作，并记录 event；没有自动完成倒计时。
- 进入 Task 的 worktree/session 通过现有 selection/Chat placement API 完成，不在 Zustand 复制 transcript。
- Task surface 的列表、表单和详情在宽屏下相对整个应用窗口居中，而不是只相对 Projects rail 右侧的 workspace 居中。
- Task surface 打开时，从 Projects 树选择任意 Pi session 必须退出 Task surface并展示已经打开的 Chat；选择失败或过期响应不能关闭 Task surface。

## 10. Notifications

触发通知的状态：`needs_review`、`awaiting_report`、`failed`。running/completed/cancelled 默认不弹系统通知。

- 应用内：写 `task_notifications` 后发送 `task://event kind=notification`；通知中心可读/标记已读，重启后仍存在。
- 系统：Main 使用 Electron `Notification`，仅在 `Notification.isSupported()` 且窗口不聚焦或最小化时发送；标题使用 Task title 的截断版本，正文只含状态，不含 description、prompt、error details 或代码。
- `(taskId, runId, kind)` primary key 去重；成功展示后写 `system_sent_at`。崩溃前已写通知但未展示时，启动恢复只保留应用内未读，不补发陈旧系统通知，避免重复骚扰。
- 点击系统通知聚焦唯一主窗口并导航到 Task detail；找不到 Task 时只打开 Task list。
- 系统权限拒绝/平台不支持不影响 Task 状态，记录无敏感信息的 diagnostic。

## 11. Security and trust boundaries

- Renderer 不能传 path、cwd、sessionPath、branch command 或任意 prompt；只传 IDs、受限文本和 enum。Main 从 ProjectService 解析 canonical roots。
- existing workspace ownership、project kind、dirty/busy 状态在每次 Run 开始时重验，不能依赖旧 UI snapshot；Directory workspace 使用 ProjectService 解析的 canonical synthetic main root，不接受 Renderer path。
- managed worktree 继续使用 owner marker、hardened Git runner、name/baseRef allowlist 和参数数组。
- SQLite 使用参数绑定，动态筛选只从固定 enum 拼装；禁止 Renderer supplied SQL/order/column。
- task events、errors、diagnostics 和 notifications 不含 prompt、credentials、环境变量、文件正文或 tool results。
- report/rewrite tool schema 设置字段、数组与总 payload 上限；拒绝 prototype keys、额外字段和无效 URL。
- rewrite session 无 project cwd、无持久化、无 coding/MCP/extension tools；execution session 与 rewrite session 的 factory/type 不复用可变 tool registry。
- Task execution 与普通 Chat 都是用户账户权限下的受信任 coding Agent，不宣称 OS sandbox。UI 在首次启用 automation 时说明它可修改所选 workspace。
- SpireCode 没有 ready/approve/merge command/tool。Draft URL 只是报告数据；打开链接仍走既有安全 external URL policy。

## 12. Errors and diagnostics

稳定错误至少包括：

```text
TASK_NOT_FOUND
TASK_CONFLICT
TASK_INVALID_STATE
TASK_PROJECT_NOT_FOUND
TASK_PROJECT_NOT_GIT
TASK_WORKSPACE_NOT_FOUND
TASK_WORKSPACE_DIRTY_CONFIRMATION_REQUIRED
TASK_WORKSPACE_BUSY
TASK_WORKSPACE_RECOVERY_CONFLICT
TASK_SESSION_RECOVERY_CONFLICT
TASK_PROMPT_FAILED
TASK_RESULT_INVALID
TASK_RESULT_ALREADY_REPORTED
TASK_REWRITE_BUSY
TASK_REWRITE_TIMEOUT
TASK_REWRITE_NO_RESULT
TASK_DATABASE_UNAVAILABLE
TASK_MIGRATION_FAILED
TASK_FAILED
```

错误分为 retryable 与 requires-attention。自动恢复仅重放幂等 saga step，不无限重试 provider/auth/invalid-state 错误；单 step 最多一次启动恢复尝试，随后等待用户 Retry。UI 保留 Task 与资源引用，显示稳定 message 和可操作动作。绝不将失败映射为 clean/completed。

Diagnostics 可记录 task/run ID、phase、稳定 code、duration 和 recovery outcome；不得记录 title、description、prompt、report evidence、绝对路径、model response 或 secrets。

## 13. Performance and concurrency

- V1 目标容量：10,000 Tasks、每 Task 20 Runs、每页最多 100；索引查询在开发基准中 p95 < 100 ms。
- DB 写入通过单 repository queue + short transaction；外部 Git/Pi/Notification 操作绝不在 DB transaction 内等待。
- 一个 Task 一个 active Run；一个 worktree 一个 active TaskRun；全局最多 3 个 running automated Runs，其余 queued，避免 Main/provider 资源失控。
- event payload 最大 64 KiB，report JSON 最大 256 KiB，Task detail 不返回原始 audit 全量；timeline 分页。
- SQLite 不存 transcript/diff/file body，避免数据库与 IPC 无界增长。
- rewrite 每窗口单飞、全局最多 2 个，60 秒 timeout；窗口销毁立即 abort。
- Main 中 SQLite 同步调用只做索引查询和短事务；性能基准若显示 event loop stall > 50 ms，实施必须移到 utility process/worker，并保持 IPC DTO 不变，不能以 UI spinner 掩盖。

## 14. Compatibility, backup and rollback

- 现有 `state.json`、Project/Worktree IDs、Pi JSONL 和 Chat IPC 不迁移、不重写。Task 只引用这些 identity。
- 没有 `tasks.sqlite3` 的现有用户自动创建当前 v3 schema（含连续 v1/v2/v3 migration history）；Task 模块故障不阻止 Projects/Files/Git/Chat 使用。
- 新应用遇到未知更高 schema version 时将 Task 模块置只读 unavailable，不降级写入。
- 回滚到不支持 Task 的旧版时，旧版忽略 `tasks.sqlite3`；用户数据与 managed worktree 保留。再次升级后恢复。
- 普通 migration 如需人工回滚 schema，只能恢复 migration 前 backup，并先退出应用、同时处理 db/wal/shm；产品 V1 不提供危险的自动 downgrade。v3 是明确的数据删除边界，成功后不会保留含旧 criteria 数据的 app-managed backup，因此不能通过产品备份降回 v2。
- 卸载/清除应用数据前的备份沿用 userData 备份策略；V1 不提供 Task export/import。
- Task 创建的 managed worktree 使用现有 owner marker，因此不支持 Task 的版本仍能作为普通 managed worktree列出；不得重复导入成 project。

## 15. Acceptance criteria

### Functional

1. Task 入口固定在 Projects 上方，跨 project 切换保持可用。
2. Task domain、创建表单和持久化 schema 均不包含 acceptance criteria，默认 new managed + default baseRef + automation on。
3. automation on 自动完成 worktree/session/prompt 编排；off 创建 backlog，手动 Run 后执行同一流程。
4. existing worktree 不创建新 checkout，dirty 时必须显式确认，且永不自动删除。
5. 每个 TaskRun 固定 worktree/session；Retry/Request changes 创建递增 attempt。
6. `agent_end`/`agent_settled` 均不能完成 Task；settled 无报告进入 awaiting_report。
7. 只有有效 `task_report_result` 进入 needs_review，只有用户 Accept 进入 completed。
8. needs_review/awaiting_report/failed 生成去重应用内通知；窗口不活跃时尽力发送系统通知。
9. AI 优化只能由 `submit_task_rewrite` 改写 title 和 description，可 Undo，不产生持久 session/DB 记录。
10. PR/MR report 只接受 `draft: true`；产品无 ready/approve/merge action。

### Recovery and data

11. 在每个 saga intent/done 边界模拟崩溃，重启后不重复 worktree、session 或首个 prompt。
12. WAL crash recovery 保留已提交事务；migration 失败保留原库与 backup，不创建空库覆盖。
13. 资源 identity 冲突进入明确 failed/requires-attention，不猜测或删除。
14. SQLite 不含 transcript、file body、diff 或 rewrite 内容；Task list IPC 有分页和大小限制。

### Security and quality

15. 非主 frame、非 allowlisted command/topic、额外字段、越权 project/worktree/session、任意 path 与 oversized payload 全部拒绝。
16. rewrite runtime 的测试证明 coding/MCP/extensions/skills/templates/context 均未加载，只有一个 custom tool。
17. Git 仍使用 hardened argument-array runner；Renderer 仍 sandboxed 且 preload 接口不扩权。
18. focused tests、migration/recovery tests、Renderer accessibility tests、`pnpm check` 全部退出 0；目标平台 bundle/smoke 验证 `node:sqlite` 可在最终 artifact 中打开 WAL 数据库。
19. Task surface 在宽屏相对应用窗口居中；从 Task 页面点击 Projects 中的 session 会切换到对应 Chat。

## 16. Rejected alternatives

- **把 Task 当成 Chat metadata**：无法表达多次 Run、saga、报告和人工验收，也会把 idle 错当完成。
- **继续用 JSON 原子文件**：跨多个有索引/状态约束的实体与恢复 journal 时并发和 migration 风险更高。
- **在 Renderer 使用 SQLite/Pi/Git**：违反 Electron sandbox 与窄 IPC 边界。
- **rewrite 复用普通 Chat**：会持久化 transcript 并错误加载 coding/MCP/extensions。
- **`agent_settled` 自动 completed**：idle 不证明需求与测试完成。
- **失败/取消自动删除 worktree**：可能丢失用户改动，且 existing workspace 不归 Task 所有。
- **自动 ready/approve/merge**：越过人工审查和仓库权限边界。
