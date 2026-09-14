# Spec: Rust + Node sidecar 的 pi Agent Chat

> Historical transport design: the Chat product behavior remains authoritative, but the Rust/sidecar architecture is superseded by `docs/electron-migration/spec.md`, which runs pi SDK directly in Electron Main.
Status: accepted。 Implements: `docs/pi-agent-chat/intent.md`。

## 1. Scope

### 1.1 Included

- 当前 worktree 中创建多个 pi Agent Chat session。
- Chat 作为中央一等资源 Tab，与 file、diff、terminal 共用 placement、激活和关闭模型。
- 流式 user/assistant 消息、Thinking、通用 Tool card、错误和完成状态。
- idle 时 prompt、running 时 follow-up、Stop/abort。
- Chat History 列出当前 worktree 的 session，并重新打开已关闭 Tab。
- pi JSONL transcript 持久化及应用重启后的恢复。
- Rust 监管一个应用级常驻 Node sidecar。
- sidecar、Node runtime 与 pi SDK 随 `.app` 打包，不依赖系统 Node。

### 1.2 Excluded

- 模型、provider、API key 和 OAuth 管理 UI。
- 专用 Bash/Read/Edit/Write renderer、Ask User Question UI、subagent transcript、TODO、模板管理。
- Chat 搜索、rename、fork、永久删除、导入和导出。
- 图片或文件附件。
- 多窗口/多设备同步。
- OS 级沙箱或逐次 tool approval。
- Windows/Linux 发布。

## 2. Architecture

```text
React in WKWebView
  ├─ central Chat tabs
  ├─ chat projection/runtime
  └─ typed chat adapter
          │ Tauri commands + Channel
Rust Tauri backend
  ├─ validates worktree/session ownership
  ├─ owns sidecar process and request routing
  ├─ buffers/fans out ordered events
  └─ tears down sidecar on application exit
          │ private LF-delimited JSON protocol
Bundled Node sidecar
  ├─ shared ModelRuntime
  ├─ one AgentSession per chat
  ├─ pi SessionManager JSONL persistence
  └─ @earendil-works/pi-coding-agent
```

The sidecar is a trusted child process, not a second user-facing server. It must not listen on a TCP port. Rust spawns it with piped stdin/stdout/stderr and communicates using one JSON record per LF-terminated line.

The sidecar is started lazily on the first Chat operation. A single process serves all worktrees and sessions for the lifetime of the app. A crash marks active requests/runs failed; the next Chat operation may restart it and reopen persisted sessions.

## 3. Session and placement model

### 3.1 Identity

- `sessionId` is the pi `AgentSession.sessionId` and the durable Chat identity.
- Every session has a Rust-owned association with one `worktreeId` and canonical cwd.
- Central resource identity is `chat:<worktreeId>:<sessionId>`.
- Creating a Chat captures the current worktree. Later worktree selection changes do not retarget the session.

### 3.2 Tab behavior

- The central tab header exposes an accessible `New chat` button next to `New terminal`.
- With no active worktree, `New chat` is unavailable.
- Creation is asynchronous. A navigation generation prevents a late create response from stealing focus after the user navigates elsewhere.
- Chat tabs never participate in preview replacement.
- Opening an already placed session activates the existing Tab rather than duplicating it.
- Closing a Chat Tab removes placement only. It does not abort, dispose, or delete the pi session.
- A `Chat history` control lists sessions for the active worktree and reopens them.
- V1 persists Chat placement references locally alongside workbench view state; message bodies remain outside Zustand/localStorage.

### 3.3 Lifecycle

- A sidecar registry holds live sessions and can attach a persisted session using `SessionManager.open()`.
- Closing a project or deleting a worktree removes local tab placement and detaches UI subscriptions, but does not delete transcript files.
- A running session is aborted before its worktree is deleted. Project close aborts associated live sessions before releasing the worktree.
- Application shutdown terminates the sidecar. Pi's append-only session transcript remains the recovery source.

## 4. Sidecar runtime

### 4.1 Build and packaging

- Add a private sidecar workspace/package whose dependencies are pinned exactly.
- Build it as a production JavaScript bundle from the local `~/ai/pi` source during development integration, then pin the resulting package version/source in the repository lockfile rather than depending on an ambient checkout at runtime.
- Bundle a compatible Node runtime; current pi SDK requires Node `>=22.19.0`.
- Tauri resolves the sidecar and runtime from application resources, never from the user's interactive shell `PATH`.
- The bundle and runtime must be included in signing and artifact smoke checks.

### 4.2 Pi initialization

The sidecar creates and reuses one `ModelRuntime`. For each Chat it calls `createAgentSession()` with:

- canonical worktree cwd supplied only by Rust;
- a pi `SessionManager` using the standard durable JSONL format;
- existing pi settings/auth/model configuration;
- the user's normal pi resources, including context files, skills, prompt templates and extensions;
- default coding tools enabled.

The implementation must report initialization, model and authentication failures as stable structured errors. It must not print credentials, prompts, message bodies, tool arguments/results or environment values to application logs.

### 4.3 Sidecar protocol

Every record is UTF-8 JSON followed by byte `\n`. Parsers split only on LF and tolerate a trailing CR. stdout is protocol-only; diagnostics go to stderr with sensitive values omitted.

Request envelope:

```ts
{
  kind: "request";
  id: string;
  method: string;
  params: unknown;
}
```

Response envelope:

```ts
{
  kind: "response";
  id: string;
  ok: true;
  result: unknown;
} | {
  kind: "response";
  id: string;
  ok: false;
  error: { code: string; message: string; details?: unknown };
}
```

Event envelope:

```ts
{
  kind: "event";
  sessionId: string;
  sequence: number;
  event: AgentSessionEvent;
}
```

Minimum methods:

```text
session.create
session.list
session.getMessages
session.attach
session.prompt
session.followUp
session.abort
session.disposeAll
```

Every response matches one request ID. `session.prompt` and `session.followUp` acknowledge after pi accepts the input; they do not wait for the entire agent run. Later failures arrive through session events.

Each session event sequence is strictly increasing for that sidecar process. Payloads and buffered output have explicit size limits. Malformed records, unknown response IDs and out-of-order events are protocol errors, not silently ignored.

## 5. Rust Chat domain

Add an application-owned Chat service responsible for:

- resolving `worktreeId` through `ProjectService`;
- starting and supervising the sidecar;
- serializing requests and correlating responses;
- maintaining session-to-worktree ownership;
- reading stdout continuously and draining stderr without deadlock;
- enforcing request timeouts and bounded pending requests;
- routing ordered session events to Tauri Channels;
- maintaining bounded attach buffers for events emitted before the frontend attaches;
- aborting related live sessions during project/worktree teardown;
- terminating and reaping the child on drop/application exit.

Rust must launch processes with executable plus argument arrays, never shell command strings.

### 5.1 Tauri commands

```text
chat_session_create(worktreeId, channel) -> ChatSessionSummary
chat_session_list(worktreeId) -> ChatSessionSummary[]
chat_session_attach(worktreeId, sessionId, channel) -> ChatSnapshot
chat_session_send(worktreeId, sessionId, text) -> Accepted
chat_session_abort(worktreeId, sessionId) -> Accepted
```

`chat_session_attach` first registers the subscriber and then returns an authoritative snapshot plus revision/sequence fence. Events generated during snapshot loading are buffered. The frontend applies only events newer than the snapshot fence, preventing a stale snapshot from replacing newer stream state.

All operations validate that the session belongs to the submitted worktree. The frontend cannot use a session ID to access another worktree's transcript.

### 5.2 Errors

Add stable error codes:

```text
CHAT_SIDECAR_UNAVAILABLE
CHAT_SIDECAR_CRASHED
CHAT_PROTOCOL_ERROR
CHAT_SESSION_NOT_FOUND
CHAT_SESSION_BUSY
CHAT_AUTH_REQUIRED
CHAT_MODEL_UNAVAILABLE
CHAT_FAILED
```

The UI distinguishes an empty session from loading, reconnecting, failed and authentication-required states.

## 6. Frontend runtime and state

### 6.1 Ownership

`editorStore` owns only Chat Tab metadata:

```ts
{
  type: "chat";
  id: string;
  worktreeId: string;
  sessionId: string;
  title: string;
  preview: false;
}
```

A dedicated Chat runtime owns session projections keyed by `sessionId`. Complete transcript text, Thinking and tool results must not be stored in Zustand or localStorage. The runtime provides subscribe/getSnapshot behavior suitable for React and bounded in-memory retention.

### 6.2 Event reduction

The reducer supports at least:

```text
agent_start
agent_end
agent_settled
message_start
message_update
message_end
tool_execution_start
tool_execution_update
tool_execution_end
queue_update
compaction_start
compaction_end
auto_retry_start
auto_retry_end
```

Rules:

- `agent_start` enters streaming.
- `agent_end` does not enter idle.
- Only `agent_settled` leaves streaming.
- Assistant partial state is replaced by the latest canonical partial snapshot from the direct SDK.
- Tool partial result is replaced, not appended.
- Tool state is correlated by `toolCallId`.
- `message_end.message` is authoritative for the completed message.
- Session events are routed by `sessionId`; there is no global current assistant.
- Snapshot hydration plus event sequence fencing prevents stale replacement and duplicate application.

### 6.3 Composer

- Enter sends; Shift+Enter inserts a newline; IME composition does not submit.
- Empty/whitespace-only input is rejected.
- Input is capped at 64 KiB UTF-8.
- Idle send calls prompt.
- Running send calls follow-up and appears in a queue strip until pi emits the canonical user message.
- Stop calls abort. V1 clears queued messages and restores their text into the composer where representable, matching pi's interactive stop semantics.
- A send acknowledgement indicates acceptance, not run completion.

### 6.4 Rendering

MVP renders:

- user turns;
- assistant Markdown-compatible plain document rendering;
- collapsible Thinking blocks;
- generic tool cards containing name, running/done/error status, arguments and partial/final result;
- retry/compaction/error notices;
- streaming and idle state;
- queue strip and Stop action.

Unknown tools always use the generic renderer. Tool UI must not assume only pi built-in tools exist because extensions can register additional tools.

## 7. Security and capability boundary

- No generic Tauri shell/filesystem/network capability is exposed to the WebView.
- Rust validates worktree/session ownership and controls sidecar launch paths.
- Sidecar protocol is private stdio, not a network listener.
- Logs exclude prompts, transcript content, tool arguments/results, credentials and environment values.
- The bundled executable/resource paths are fixed by the application; the WebView cannot provide executable paths or arbitrary launch arguments.

The default pi coding tools execute with the current macOS user's authority. Setting cwd to a canonical worktree is context, not confinement: `bash`, extensions, symlinks or absolute paths can access locations outside the worktree. V1 accepts this for a local personal coding agent and does not claim sandbox isolation.

## 8. Performance and limits

- One sidecar process is shared by all sessions.
- Sidecar startup is lazy; once started it remains warm.
- Pi events are batched before React updates, targeting one UI commit per 16–32 ms while preserving event order.
- Request and event queues are bounded; a slow or detached UI cannot create unbounded memory growth.
- Transcript hydration is paged or size-bounded; large tool results render collapsed and truncated with an explicit marker.
- Multiple sessions may be active concurrently, but each session has at most one running agent loop.

Acceptance budgets, measured on the supported development Mac:

- Local command/IPC overhead excluding pi initialization and provider latency: p95 under 20 ms.
- Warm New Chat creation excluding provider calls: p95 under 300 ms.
- No event loss or UI ordering corruption under a sustained synthetic stream.
- Sidecar idle memory and per-session growth are recorded by the smoke test; the first release treats these as reported metrics rather than hard release blockers.

## 9. Persistence and recovery

- Pi `SessionManager` JSONL is the transcript source of truth.
- SpireCode stores only session/worktree association and local Tab placement metadata required to reopen sessions.
- On restart, Chat History comes from `session.list(worktreeId)` and opening a session hydrates `session.getMessages` before consuming newer events.
- A sidecar crash does not delete transcript files. Active runs become failed; persisted sessions can be reopened after restart.
- A dangling tool call caused by process termination must be repaired using pi-supported session recovery behavior before the session is sent back to a provider.
- Unknown/newer persistence versions are not silently overwritten.

## 10. Packaging

`pnpm bundle` must:

1. build the frontend;
2. build the sidecar bundle;
3. include the pinned Node runtime and sidecar resources in the Tauri app;
4. build and ad-hoc sign `SpireCode.app`;
5. package the DMG;
6. verify the sidecar can be launched from both the app bundle and mounted DMG;
7. verify no child remains after the smoke process exits.

Development may use the local `~/ai/pi` checkout to iterate, but the built application must be self-contained and reproducible from committed manifests/lockfiles.

## 11. Proof

### Sidecar unit and integration tests

- fragmented and combined JSONL input;
- LF/CRLF boundaries and UTF-8 splits;
- request correlation and early send acknowledgement;
- one process managing multiple independent sessions;
- prompt/follow-up/abort mapping;
- `agent_end` versus `agent_settled`;
- model/auth/init errors;
- persisted session list/open;
- malformed protocol and graceful shutdown;
- no sensitive content in logs.

Normal automated tests use a fake model or fake session adapter and do not call a paid provider.

### Rust tests

- one sidecar startup under concurrent requests;
- canonical worktree cwd resolution;
- session/worktree ownership rejection;
- response timeout and child crash fan-out;
- stdout framing, stderr draining and bounded buffers;
- attach-before-snapshot event fence;
- project close/worktree delete/application drop cleanup;
- no shell command string construction.

### Frontend tests

- New Chat availability and async navigation fencing;
- Chat/File/Diff/Terminal Tab coexistence and de-duplication;
- transcript hydration followed by ordered stream;
- streaming reducer, Thinking and Tool cards;
- `agent_end` remains busy and `agent_settled` becomes idle;
- idle prompt, running follow-up, queue, Stop and IME behavior;
- close-to-history and reopen;
- session isolation across worktrees;
- transcript bodies absent from Zustand persistence.

### Release proof

```text
pnpm check
pnpm bundle
```

Manual smoke additionally verifies a real configured pi provider:

1. open a worktree and create two Chats;
2. send prompts in both and observe independent streaming;
3. observe Thinking and at least one tool execution;
4. modify a file and observe Files/Git refresh;
5. send a follow-up, then Stop;
6. close and reopen a Chat from history;
7. restart SpireCode and reopen the persisted transcript;
8. close the app and confirm no sidecar process remains.

## 12. Concerns

### Concern A: Default pi tools are not sandboxed

The approved architecture keeps Rust as the application boundary but does not route pi's built-in read/write/edit/bash tools through Rust. Agent actions therefore run with the user's account permissions and can leave the worktree. A future restricted mode would require Rust-backed custom tools, command approval, OS sandboxing, or a combination.

### Concern B: Runtime distribution and signing

The app must bundle a Node runtime compatible with the pinned pi SDK and include it in macOS signing and DMG smoke tests. Depending on an ambient `node` executable is not acceptable for release.

### Concern C: Local pi source versus reproducible builds

`~/ai/pi` is the design and development source requested by the user, but an absolute local path cannot be a release dependency. The implementation plan must choose a reproducible pinned dependency or vendored build artifact and update both lockfiles/build scripts accordingly.

### Concern D: Existing base specification

`docs/spirecode/spec.md` describes the original V1 and explicitly excludes Chat. This change specification supersedes that exclusion only for the scope defined here; the base document and README must be updated during implementation so product documentation no longer contradicts shipped behavior.
