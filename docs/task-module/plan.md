# Plan: 实现全局 Task 与可恢复 TaskRun

Status: accepted for planning only。 Implements: `docs/task-module/spec.md`。

> 本次交付仅创建高风险 SDLC 文档，不修改代码。以下实施计划必须在用户再次明确批准代码实施后执行。

## 1. Risk gate and delivery strategy

风险等级为**高风险**：新增 SQLite schema/migrations/WAL；跨进程 IPC；Main 发起 Git worktree 与具备 coding 权限的 Pi session；SQLite/Git/Pi 三套持久资源之间存在崩溃窗口；增加系统通知并约束 PR/MR 权限。实施必须保持小步 red-green，每一阶段先建立失败测试，再写最小生产代码；不得把完整功能一次性落地后再补测试。

分阶段原则：

1. 先锁定纯类型、状态机、schema 和 security contract。
2. 再实现 repository/migration，随后实现无 Pi 的可恢复 saga。
3. 再接 worktree，最后接 Pi execution/rewrite，避免同时调试三种副作用。
4. IPC 在 Main domain 稳定后接入；UI 最后消费已验证 DTO。
5. 通知、性能、artifact smoke 和恢复 fault injection 是发布 gate，不是 polish。
6. 任一阶段发现需要改变 `spec.md` 的产品语义，先更新三件套并重新确认，不在代码中隐式改设计。

## 2. Planned files

### 2.1 Dependencies and build

- Modify `package.json` only if artifact probe confirms current Electron runtime lacks required `node:sqlite` API；优先不增加 native SQLite addon。
- Modify `pnpm-lock.yaml` only when dependency change确有必要，版本必须精确固定。
- Pi SDK custom tools require TypeBox schemas carrying runtime symbols, so add exact production dependency `typebox@1.3.27` (matching Pi SDK) rather than casting plain JSON Schema.
- Modify `scripts/release/build.mjs` and relevant `scripts/release/*.test.mjs` to probe packaged Electron Main can create/open `tasks.sqlite3`, enable WAL and run a transaction。
- Modify platform smoke scripts under `scripts/` to include Task DB startup without exposing user data。

### 2.2 Shared contracts and generated bindings

- Add `src/bindings/taskTypes.ts` or extend the existing binding source used to generate `src/bindings/generated.ts` with `Task`, `TaskRun`, report, page, notification and error DTOs。
- Modify `src/bindings/generated.ts` through the repository’s generation path if one exists；do not hand-edit generated output without first confirming ownership。
- Modify `electron/contracts.ts` with exact Task commands and `task://event` topic。
- Modify `electron/contracts.test.ts` for allowlist completeness and rejection。
- Modify `electron/ipc.ts` with bounded parsers, exact-field tables and command routing。
- Modify `electron/ipc.test.ts` for sender, frame, field, enum, size, cursor and ownership validation。
- Modify `electron/preload.ts` / preload tests only if topic typing requires it；do not expose a new raw primitive。
- Modify `src/bindings/index.ts` with narrow typed command wrappers and rewrite/task subscription correlation。

### 2.3 SQLite domain

Add `electron/domains/tasks/`:

- `types.ts` — Main-only domain types, status enums and transition guards。
- `validation.ts` — title/description/criteria/workspace/report/rewrite validation and size limits。
- `migrations/001-initial.ts` — exact v1 STRICT schema, indexes and migration metadata。
- `database.ts` — open/PRAGMA/quick_check/backup/migrate/checkpoint/close，parameterized statements only。
- `repository.ts` — queued short transactions, optimistic revision writes, pagination and invariants。
- `stateMachine.ts` — pure Task/Run transitions, no I/O。
- `repository.test.ts` — temporary DB tests including WAL reopen and constraints。
- `migrations.test.ts` — empty DB, v1 reopen, unknown future version, failed migration backup/rollback, corrupt DB behavior。
- `stateMachine.test.ts` — exhaustive legal/illegal transition table including settled semantics。
- `fixtures.ts` — test-only deterministic IDs/clock；never production defaults。

Do not put Task data into `electron/domains/persistence/index.ts` JSON helpers；SQLite owns its own lifecycle。

### 2.4 Saga and worktree integration

- Add `electron/domains/tasks/orchestrator.ts` — global concurrency queue, per-task/per-worktree locks, intent/done journaling, startup recovery, cancellation and retry。
- Add `electron/domains/tasks/prompt.ts` — deterministic prompt builder and run marker；snapshot tests must redact dynamic IDs only through injected fixtures。
- Add `electron/domains/tasks/recovery.ts` if separating recovery keeps orchestration testable。
- Add `electron/domains/tasks/orchestrator.test.ts` with fake Project/Worktree/Pi adapters and fault injection after every external effect / before every done write。
- Modify `electron/domains/worktrees/index.ts` to support an internal Main-only deterministic create request or reconciliation probe while preserving existing Renderer API。
- Modify `electron/domains/worktrees/worktrees.test.ts` for deterministic name, owner marker, adopt, collision and no-delete behavior。
- Modify `electron/appState.ts` to construct repository/service/orchestrator after projects, recover before Task IPC becomes ready, and dispose/checkpoint after Agent cleanup。
- Modify `electron/appState.test.ts` for startup ordering, degraded Task-only failure and shutdown。

### 2.5 Pi Task execution

Add `electron/domains/tasks/piExecution.ts`:

- persistent `SessionManager.create/open` adapter；
- deterministic session name `SpireCode Task <runId>` and list-based reconciliation；
- prompt marker transcript detection before send；
- bounded event subscription；
- Main-owned `task_report_result` custom tool closure-bound to run identity；
- Draft-only report validation；
- abort/clearQueue/dispose lifecycle。

Tests in `electron/domains/tasks/piExecution.test.ts` use an SDK fake to prove:

- session adoption and no duplicate prompt；
- `agent_end` and `agent_settled` never report completion；
- settled without tool becomes awaiting_report；
- tool report is validated, idempotent only when identical and reaches repository once；
- forged run/criterion/session data is rejected；
- extension tool name conflict fails closed；
- errors are redacted。

Reuse safe model/runtime initialization primitives from `electron/domains/chat/piAdapter.ts`, but do not couple Task status to `ChatService` records or Renderer events. If common extraction is necessary, add a narrowly named Main helper with unchanged Chat tests before switching either caller。

### 2.6 Restricted rewrite runtime

Add `electron/domains/tasks/piRewrite.ts` and `piRewrite.test.ts`:

- use `SessionManager.inMemory` with controlled empty cwd；
- construct resource loader with coding tools/context/MCP/extensions/skills/templates/themes disabled；
- register only `submit_task_rewrite`；
- one successful submission, timeout/abort/dispose and bounded event routing；
- never call persistent SessionManager create/open/list and never write repository。

Tests inspect the fake SDK options/tool registry rather than only asserting UI behavior. Add a filesystem assertion that rewrite leaves no Pi JSONL under the test session root。

### 2.7 Notifications

Add `electron/domains/tasks/notifications.ts` and `notifications.test.ts`:

- write/dedupe application notifications through repository；
- gate Electron Notification on support + window focus/minimized state；
- use generic bounded body；
- persist `system_sent_at` only after show；
- focus/navigate main window on click；
- do not replay stale system notifications at startup。

Modify `electron/main.ts` or the existing navigation coordinator only for a typed “open task” intent；do not permit notification payload URLs or arbitrary routes。

### 2.8 Renderer feature

Add `src/features/tasks/`:

- `tasksApi.ts` — wrappers over bindings, no direct preload access。
- `tasksStore.ts` — filters/selection/list page/revisions only；no transcript or timeline bodies persisted。
- `taskEvents.ts` — batched invalidation and revision fence。
- `TaskNavItem.tsx` — global row/badge/spinner。
- `TaskPage.tsx` — list/detail routing and empty/error/loading states。
- `TaskList.tsx` — paginated accessible status list/filter。
- `TaskForm.tsx` — approved fields, dependent project/workspace data, single-flight submit and dirty confirmation。
- `TaskRewriteControl.tsx` — start/cancel/apply/reject/undo in local component state。
- `TaskDetail.tsx` — saga timeline、awaiting-report warning、report/review actions and links。
- focused `*.test.ts(x)` for each behavior。

Modify:

- `src/features/projects/ProjectRail.tsx` to place Task nav above the Projects heading and outside project DnD contexts。
- `src/features/projects/ProjectRail.test.tsx` for placement, badge, keyboard and DnD non-participation。
- `src/features/workbench/Workbench.tsx` / `workbenchStore.ts` to support global Task view without requiring active worktree。
- corresponding Workbench tests for switching Task/Project/Settings without losing project selection。
- `src/i18n/en.ts` and `src/i18n/zh-CN.ts` with matched Task strings；run localization guard。
- global stylesheet files currently owning ProjectRail/Workbench styles；keep selectors feature-scoped。

When opening a Run session, call existing worktree selection + Chat placement APIs. Do not duplicate Chat renderer or transcript in Task components。

## 3. Red-green sequence

### Phase 0 — Baseline and approval

1. Confirm branch `feat/task-module` and clean/known working tree；do not reset unrelated changes。
2. Re-read `AGENTS.md`、this artifact set、`docs/electron-migration/*`、current project/worktree/chat tests。
3. Obtain explicit approval to implement this high-risk plan。
4. Run baseline focused tests plus `pnpm check`; record pre-existing failures before edits。

### Phase 1 — Pure contracts and state machine

1. Write failing tests for every allowed/forbidden Task and Run transition, especially `agent_end`/`agent_settled` and valid report/manual completion。
2. Implement pure transition guards until green。
3. Write failing IPC contract tests for allowlist, exact fields, bounds, cursor and sender；add contract constants/parsers without routing to external effects。
4. Run focused TypeScript/lint/tests。

Exit proof: illegal transitions and broad IPC are impossible before persistence exists。

### Phase 2 — SQLite schema and repository

1. Write migration tests against temporary files: initial create、STRICT constraints、PRAGMAs、unknown future version、backup/rollback、WAL crash reopen。
2. Implement DB open/migration/backup/checkpoint。
3. Write repository tests for create/list/get/revision conflict、one active Run、events、notifications and pagination。
4. Implement short queued transactions and invariant checks。
5. Add 10k Task benchmark fixture and verify indexed list p95 target without committing generated DB。

Exit proof: schema, migration and concurrency semantics work independently of Git/Pi/UI。

### Phase 3 — Saga skeleton with fakes

1. Build fake Project/Worktree/Pi adapters with deterministic side-effect ledger。
2. For each saga boundary, write a test that throws after intent、after external success and before done；restart a new orchestrator over the same SQLite file。
3. Verify one worktree/session/prompt maximum, proper adopt, conflict fail-closed, cancellation recovery and degraded isolation。
4. Implement orchestrator only until the fault matrix is green。

Required matrix at minimum:

```text
run row committed
workspace intent committed
worktree created
workspace done committed
session intent committed
session created/named
session done committed
prompt intent committed
prompt accepted
prompt done committed
report received before/after settle
cancel intent before/after abort
```

### Phase 4 — Real WorktreeService integration

1. Add failing worktree tests for deterministic create/reconcile, owner mismatch, branch/path collision, existing dirty confirmation and existing no-delete。
2. Extend internal service API without widening Renderer IPC。
3. Test temporary real Git repositories and origin refs through the hardened runner。
4. Re-run all existing project/worktree/git tests to prove no regression。

Exit proof: workspace side effects are safely identifiable and recoverable。

### Phase 5 — Pi execution and explicit result reporting

1. Write SDK fake tests for session naming/adoption, prompt marker detection, preflight acceptance and event ordering。
2. Add failing tests showing settled does not reach needs_review and valid tool report does。
3. Implement `task_report_result` schema/closure binding/idempotency and repository transition。
4. Add continuation-for-report、abort、provider/auth/model error and redaction tests。
5. Run existing Chat adapter/service/wire/reducer suites to prove Task integration did not change ordinary Chat semantics。

Exit proof: no Pi event other than a validated report tool can create needs_review。

### Phase 6 — Restricted AI rewrite

1. Write a failing capability test that detects any coding tool、MCP、extension、skill、template、theme、context loader or persistent SessionManager use。
2. Implement in-memory adapter with only `submit_task_rewrite`。
3. Test tool validation、single submit、no-result settle、timeout、abort、window destruction and no filesystem/session persistence。
4. Add Renderer control tests for apply/reject/undo and loss of undo after submit/close。

Exit proof: rewrite isolation is structural and SDK-option tested, not prompt-only。

### Phase 7 — IPC routing and AppState lifecycle

1. Write failing AppState tests for construct/recover/degraded mode/dispose order。
2. Wire task repository/orchestrator/notifications into AppState。
3. Route commands in `electron/ipc.ts`; test all ownership/state/revision failures。
4. Implement `task://event` as bounded invalidation/rewrite channel with sender/window cleanup。
5. Re-run preload/contracts/security suites。

Exit proof: Renderer can perform only the listed Task operations and Task failure does not break existing domains。

### Phase 8 — Renderer navigation, form and review UI

1. Add red tests for Task row above Projects and outside DnD；implement minimal navigation。
2. Add form tests for defaults、dependent project options、criteria ordering、automation off、single-flight and dirty confirmation；implement form。
3. Add list/detail tests for paging、revision invalidation、awaiting-report wording、report evidence and manual completion。
4. Add accessibility checks: keyboard navigation、focus return、aria-live notification、status text independent of color。
5. Add i18n keys in both locales and run brand/i18n guards。

Exit proof: UI never labels settled as complete and preserves drafts on failure。

### Phase 9 — Notifications and Draft-only policy

1. Red tests for trigger set、dedupe、focus gate、unsupported platform、generic body and no startup replay。
2. Implement application/system notification delivery and click routing。
3. Red tests reject report with non-draft PR/MR and assert no ready/approve/merge command/tool/label exists。
4. Inspect packaged command surface and static search for forbidden automation paths。

Exit proof: notifications are reliable but non-blocking；PR/MR control remains human-owned。

### Phase 10 — Performance, compatibility and release proof

1. Run migration fixtures from no DB、v1 DB、unknown future DB、corrupt DB、DB with live WAL。
2. Run saga fault matrix repeatedly and in randomized order。
3. Measure 10k list query、report write、event delivery and Main event-loop delay；move DB work off Main only if spec threshold is exceeded。
4. Build target artifacts and run packaged `node:sqlite` WAL probe。
5. Manually execute end-to-end acceptance on each supported target OS artifact before release。

## 4. Verification commands

Focused during development（按实际 Vitest config 调整路径，不用跳过失败）：

```bash
pnpm exec vitest run electron/domains/tasks
pnpm exec vitest run electron/domains/worktrees electron/domains/chat
pnpm exec vitest run electron/contracts.test.ts electron/ipc.test.ts electron/appState.test.ts
pnpm exec vitest run src/features/tasks src/features/projects/ProjectRail.test.tsx src/features/workbench
pnpm typecheck
pnpm lint
```

Repository gate:

```bash
pnpm check
```

Healthy result: formatting、brand、i18n、secrets、licenses、lint、Renderer/Electron typecheck、all tests and release tests全部 exit 0。

Artifact gate（在对应目标 OS 上）：

```bash
pnpm bundle
```

Healthy result: macOS arm64 DMG、Windows x64 NSIS 或 Linux x64 AppImage/deb 构建成功；最终 artifact 内 Electron Main 可加载 Pi SDK 和 `node:sqlite`，创建 WAL DB，且无新增未声明 native dependency。

Additional deterministic checks:

```bash
rg -n "task_(ready|approve|merge)|pull request.*ready|merge request.*ready" electron src
rg -n "SessionManager\.(create|open|list)" electron/domains/tasks/piRewrite.ts
rg -n "tasks\.sqlite3|task_report_result|submit_task_rewrite" electron src
```

第一条预期不出现产品 automation command/tool；第二条预期不出现持久 SessionManager API（只允许 `inMemory`）。静态搜索只是辅助，不能替代 runtime capability tests。

## 5. Manual acceptance

1. 无 project 时打开 Task list；确认可看历史、不能错误启动新 Run。
2. 打开 Git project，新建默认自动化 Task；确认新 managed worktree、唯一 session、唯一首 prompt；另用 Directory project 确认只能选择 synthetic main workspace，且不会创建 worktree。
3. 在 worktree 创建改动并让 Agent settled 但不报告；确认状态 awaiting_report、收到提醒、未完成。
4. Continue for report；提交有效 tool report；确认 needs_review 和逐项 evidence。
5. Accept；确认只有此人工动作进入 completed。
6. Request changes；确认 attempt +1 且沿用 workspace/session策略，无并行 active Run。
7. existing clean/dirty worktree 各执行一次；dirty 必须二次确认，取消/失败均不删除 workspace。
8. 在 saga 每个 fault hook 强制退出应用并重启；确认不重复 worktree/session/prompt。
9. AI 优化 Apply → Undo、Reject、Cancel、timeout；确认 Chat History/磁盘/SQLite 无 rewrite session 或正文。
10. 后台窗口触发 needs_review/failed；确认系统通知通用且点击定位 Task；前台仅应用内提醒。
11. 报告 Draft PR/MR link；确认 UI 无 ready/approve/merge 控件，Main 无对应 IPC/tool。
12. 回滚运行不支持 Task 的旧版再升级；确认旧版忽略数据库，新版恢复 Task，不损坏 Project/Chat。

## 6. Rollout and rollback

- V1 可通过 Main-owned feature flag 暂停“新建/启动”但保持 Task list/read/recovery diagnostic；flag 不得跳过 migration 或伪造状态。
- 首次发布观察 migration failure、recovery conflict、prompt duplicate prevention、awaiting_report duration、notification failure 和 Main event-loop delay的匿名计数；不得采集 task 文本。
- 严重问题时停止创建新 Run并发布修复；不自动删除 `tasks.sqlite3`、WAL、worktree 或 Pi session。
- 应用版本回滚依赖旧版忽略 `tasks.sqlite3`。schema 回滚仅由维护者离线恢复 `.bak`，不得在产品内自动 downgrade。

## 7. Completion report requirements

代码实施完成后报告必须列出：

- 实际修改/新增文件（按 Main、Renderer、tests、build 分组）；
- schema version 与 migration/backup/WAL 证明；
- saga fault matrix 结果和是否发现无法消除的副作用窗口；
- execution/rewrite tool capability 证明；
- `agent_settled` 与 `task_report_result` 状态测试证明；
- IPC/security、通知和 Draft-only 证明；
- focused commands、`pnpm check`、目标 OS `pnpm bundle` 的真实 exit status；
- 未运行的目标平台/manual checks 与原因；
- 工作区 diff/status，明确任何无关 pre-existing changes。

在上述证据齐全前不得报告“完成”。
