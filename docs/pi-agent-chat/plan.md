# Plan: Rust + Node sidecar 的 pi Agent Chat（from `docs/pi-agent-chat/spec.md` 2026-09-15）

## Approval and baseline

- `docs/pi-agent-chat/intent.md` and `docs/pi-agent-chat/spec.md` were accepted by the user on 2026-09-15.
- Keep the existing Tauri/Rust backend. Add one Rust-owned Node sidecar that embeds the pi Agent SDK.
- Use exact npm dependency `@earendil-works/pi-coding-agent@0.84.4`, matching the inspected `~/ai/pi` checkout. Do not retain `~/ai/pi` as an absolute runtime/build dependency.
- Pin a Node macOS arm64 runtime satisfying pi's `>=22.19.0` requirement. The resource preparation script records and verifies the official archive SHA-256 before extracting the executable.

## Files that change

### SDLC and product documentation

- Modify `docs/pi-agent-chat/intent.md` — accepted status.
- Modify `docs/pi-agent-chat/spec.md` — accepted status and any implementation-derived clarification kept in the same commit as the deviation.
- Add `docs/pi-agent-chat/plan.md` — this implementation and proof plan.
- Modify `docs/spirecode/intent.md` — note that the separately accepted Chat change supersedes the original V1 exclusion.
- Modify `docs/spirecode/spec.md` — link to the Chat specification instead of claiming the shipped product has no Chat.
- Modify `docs/spirecode/plan.md` — record the new approved change boundary.
- Modify `README.md` — describe New Chat/pi Agent support and development/runtime prerequisites.
- Modify `AGENTS.md` only if implementation reveals a repeated, durable pitfall.

### Sidecar package and protocol

- Add `pnpm-workspace.yaml` — include the root package and `agent-sidecar` workspace without changing existing root commands unexpectedly.
- Add `agent-sidecar/package.json` — private ESM package with exact pi SDK dependency and unit-test/build scripts.
- Add `agent-sidecar/src/protocol.mjs` — request/response/event envelope validation, size limits and stable sidecar error serialization.
- Add `agent-sidecar/src/sessionHost.mjs` — shared `ModelRuntime`, session registry, create/list/open/getMessages/prompt/followUp/abort/dispose operations, early send acknowledgement, event sequence assignment and pi event normalization.
- Add `agent-sidecar/src/main.mjs` — LF-delimited stdin parser, stdout protocol writer, stderr-safe diagnostics and graceful shutdown.
- Add `agent-sidecar/test/protocol.test.mjs` — split/combined records, LF/CRLF, UTF-8, malformed data and bounds.
- Add `agent-sidecar/test/sessionHost.test.mjs` — injected fake pi adapter tests for multi-session routing, prompt/follow-up/abort, settlement semantics, recovery and error mapping.
- Add `agent-sidecar/test/main.test.mjs` — child-process request correlation, early acknowledgement, malformed request survival and shutdown.
- Modify `package.json` — exact dependency/tooling and scripts for sidecar test, staging and unified checks.
- Modify `pnpm-lock.yaml` — commit the exact pi SDK production closure.

The sidecar implementation uses dependency injection around pi construction. Automated tests use a fake adapter and never call a real provider. The production adapter dynamically imports `@earendil-works/pi-coding-agent`, builds one `ModelRuntime`, creates one `AgentSession` per Chat, and subscribes before returning a created session.

### Reproducible Node runtime and resource staging

- Add `scripts/prepare-agent-runtime.mjs` — stage the sidecar production package and pinned Node runtime under a generated Tauri resource directory; verify platform, architecture, Node version, download checksum and expected executables.
- Add `scripts/check-agent-runtime.mjs` — deterministic guardrail that verifies manifest/version/checksum/resource layout and rejects absolute references to `~/ai/pi`.
- Modify `.gitignore` — ignore downloaded/extracted generated runtime artifacts while retaining manifests/checksum metadata and source.
- Modify `src-tauri/tauri.conf.json` — include the staged Node executable and sidecar production tree as app resources.
- Modify `scripts/sign-app.sh` — explicitly sign nested executable code before signing the app rather than relying only on `--deep`.
- Modify `scripts/smoke-app.sh` — verify bundled Node architecture/version, sidecar files, protocol health check and clean child exit.
- Modify `scripts/smoke-dmg.sh` if necessary — run the same sidecar resource checks from the mounted DMG.
- Modify `scripts/build-dmg.sh` only if resource-preserving copy behavior needs correction.

Generated runtime binaries are not committed. Their source URL, version and SHA-256 are committed; `pnpm bundle` prepares them reproducibly before `tauri build`. Development can override the Node executable with an explicit environment variable only in dev builds; release smoke rejects ambient PATH resolution.

### Rust Chat domain

- Add `src-tauri/src/chat/mod.rs` — public Chat service API and DTOs.
- Add `src-tauri/src/chat/protocol.rs` — serde envelopes, LF framing, method/event payload types, maximum record sizes and protocol validation.
- Add `src-tauri/src/chat/process.rs` — sidecar child startup, piped stdin/stdout/stderr, request correlation, timeout handling, bounded pending map, crash fan-out, restart and drop/reap behavior.
- Add `src-tauri/src/chat/registry.rs` — session/worktree ownership, event sequence/buffer/subscriber handling, create/list/attach/send/abort, project/worktree cleanup and sidecar snapshot fencing.
- Add `src-tauri/src/chat/test_sidecar.rs` or test fixtures under `src-tauri/test-fixtures/` — deterministic executable/fixture used by Rust process and framing tests, included only for tests.
- Modify `src-tauri/src/app_state.rs` — own `ChatService`; abort/detach sessions during project close and worktree deletion; keep transcript deletion out of these flows.
- Modify `src-tauri/src/commands.rs` — typed `chat_session_create/list/attach/send/abort` handlers. Blocking/process waits run off the Tauri main thread.
- Modify `src-tauri/src/lib.rs` — register the Chat module and commands and ensure shutdown drops/reaps the sidecar.
- Modify `src-tauri/src/error.rs` — map stable Chat errors without leaking protocol payloads or credentials.
- Modify `src-tauri/Cargo.toml` and `src-tauri/Cargo.lock` only for narrowly required concurrency/framing support; prefer std plus Tauri runtime facilities already available.

The Rust service receives only `worktreeId` and `sessionId` from the WebView. It resolves canonical cwd through `ProjectService`, supplies cwd to the sidecar itself and rejects cross-worktree session access. Process launch always uses executable plus argument arrays.

### TypeScript bindings and Chat adapter

- Modify `src/bindings/generated.ts` — add Chat summaries, snapshots, normalized events, commands and stable error codes.
- Modify `src/bindings/index.ts` — expose typed Chat commands and construct Tauri Channels only inside the adapter boundary.
- Add `src/features/chat/types.ts` — frontend-only canonical turn/tool/runtime types derived from the wire DTOs.
- Add `src/features/chat/chatApi.ts` — create/list/attach/send/abort facade and attach lifecycle.
- Add `src/features/chat/chatRuntime.ts` — external per-session transcript/event projection, bounded retention, subscriber API, attach snapshot fence and 16–32 ms ordered batching.
- Add `src/features/chat/sessionReducer.ts` — pure reducer for agent/message/tool/queue/retry/compaction events; only `agent_settled` clears busy.
- Add `src/features/chat/chatPlacement.ts` — versioned local persistence for Chat tab references only; validate records and never persist bodies/tool payloads.
- Add tests for each adapter/runtime/reducer/persistence module.

### Chat UI

- Add `src/features/chat/ChatView.tsx` — attach/hydrate lifecycle, session state surfaces and composition root.
- Add `src/features/chat/ChatComposer.tsx` — Enter/Shift+Enter/IME, 64 KiB validation, prompt/follow-up, queue and Stop.
- Add `src/features/chat/ChatMessage.tsx` — user/assistant/error rendering.
- Add `src/features/chat/ThinkingBlock.tsx` — collapsed-by-default reasoning display.
- Add `src/features/chat/ToolCard.tsx` — generic unknown-safe tool renderer with bounded/collapsed arguments and results.
- Add `src/features/chat/ChatHistory.tsx` — active-worktree session list and reopen interaction.
- Add component tests covering loading/empty/failure/auth-required, rendering, queue, Stop and accessibility.
- Modify `src/styles/index.css` — Chat layout, transcript, composer, Thinking, Tool card, queue/history and responsive styles using existing theme tokens.

No new Markdown dependency is required for the first slice: assistant text is rendered safely as structured/plain document text. Rich Markdown parsing can be a separate approved change, avoiding an unnecessary renderer/security dependency in this delivery.

### Central tab integration

- Modify `src/features/editor/editorStore.ts` — add the non-preview Chat resource variant, `chatResourceId`, open/de-duplicate/reopen operations and persisted Chat placement restoration.
- Modify `src/features/editor/editorStore.test.ts` — Chat/File/Diff/Terminal coexistence, worktree isolation, close fallback, de-duplication and navigation generation.
- Modify `src/features/editor/EditorPane.tsx` — add `New chat` and `Chat history` actions, Chat tab icon/title, Chat content branch and placement-only close behavior.
- Modify `src/features/editor/EditorPane.test.tsx` — creation order, late response focus fencing, Channel attach, reopen, close-without-abort, active content and failures.
- Modify `src/features/workbench/Workbench.test.tsx` only where the editor header interaction changes its assertions.
- Modify `src/features/projects/projectsStore.ts` and tests only if worktree teardown needs an explicit frontend Chat placement/runtime cleanup hook.

## Order of work

1. **Commit approved artifacts**
   - Mark intent/spec accepted.
   - Add this plan.
   - Run formatting and `git diff --check`.
   - Commit only `docs/pi-agent-chat/{intent,spec,plan}.md` as the audit checkpoint before implementation.

2. **Create contract fixtures before runtime code**
   - Define representative JSON request/response/event fixtures shared conceptually across sidecar, Rust and frontend tests.
   - Fix size limits, error codes, event sequence semantics and snapshot fence behavior in tests.
   - Add a guardrail test that fails if the three protocol representations drift on method names and event discriminants.

3. **Build and test the sidecar in isolation**
   - Establish the pnpm workspace and exact pi SDK dependency.
   - Implement protocol parser/writer and fake-adapter tests first.
   - Implement `SessionHost` with injected pi adapter.
   - Add production pi SDK adapter using `ModelRuntime`, `SessionManager` and `createAgentSession`.
   - Subscribe before exposing a created/opened session.
   - Use pi's preflight acceptance callback so send responses do not wait for the full run.
   - Verify one process manages independent sessions and `agent_settled` semantics.

4. **Implement reproducible resource staging**
   - Pin official Node runtime version/archive/checksum.
   - Stage the runtime and production sidecar closure outside source control.
   - Add manifest and architecture/version validation.
   - Wire resource preparation into dev/bundle commands without requiring ambient `node` inside the packaged app.

5. **Implement Rust protocol/process supervision test-first**
   - Test fragmented JSON, concurrent request IDs, timeouts, bounded pending requests, stderr drainage, child crash and clean Drop against a fixture process.
   - Implement `SidecarProcess` with one writer serialization point and dedicated stdout/stderr readers.
   - Never hold a registry mutex while blocking on process IO or awaiting a response.
   - On crash, fail all pending operations exactly once and mark attached runs failed.

6. **Implement Rust Chat registry and Tauri commands**
   - Resolve canonical cwd from `worktreeId` before create/list/open.
   - Record and validate session ownership.
   - Register a Channel subscriber before requesting a snapshot; buffer concurrent events and return a sequence fence.
   - Add create/list/attach/send/abort commands and DTOs.
   - Integrate project close, worktree delete and app shutdown cleanup.
   - Register commands in `lib.rs` and add stable error mappings.

7. **Implement the frontend reducer/runtime test-first**
   - Add normalized event fixtures.
   - Implement per-session external runtime, sequence filtering and batched notifications.
   - Test message snapshots, Thinking, tool replacement semantics, retry/compaction, queue and the `agent_end`/`agent_settled` distinction.
   - Implement hydration so a late snapshot cannot overwrite newer events.

8. **Integrate Chat resource tabs and placement persistence**
   - Extend `ResourceTab` without changing file preview or terminal close semantics.
   - Add versioned storage containing only Chat resource references.
   - Restore only valid worktree/session references; failed session hydration leaves a recoverable error surface rather than deleting persisted transcript.
   - Add New Chat and History controls with navigation-generation protection.

9. **Implement Chat UI**
   - Build transcript, message, Thinking, generic Tool, notices and queue surfaces.
   - Build composer keyboard/IME/size behavior and Stop.
   - Use accessible names and keyboard focus behavior consistent with current editor tabs.
   - Keep large tool values collapsed and explicitly truncated in the view projection.

10. **Update baseline documentation and packaging**
    - Remove contradictory “Chat intentionally deferred” statements and point base docs to the accepted change spec.
    - Stage resources before Tauri build.
    - Sign nested runtime executable and app bundle.
    - Extend app/DMG smoke checks to launch the sidecar health probe and verify no leaked process.

11. **Run deterministic verification and fix failures**
    - Run focused sidecar, Rust and frontend tests during each layer.
    - Run format, brand, lint and typecheck.
    - Run full `pnpm check` until every command exits zero.
    - Run `pnpm bundle` and both artifact smoke tests.
    - Record measured sidecar startup/IPC/memory metrics without making unmeasured performance claims.

12. **Run a real-provider desktop smoke**
    - Use the existing local pi authentication; do not add credentials to fixtures/logs.
    - Complete the eight manual scenarios from the accepted spec.
    - Confirm Agent edits trigger existing filesystem/Git refresh.
    - Confirm application exit leaves no sidecar.

## Risks

### Highest risk: packaging the Node/pi runtime

The development machine already has Node and `~/ai/pi`, but the release `.app` must not rely on either. The highest-risk step is staging the complete pi production dependency closure and a compatible arm64 Node executable, then preserving executable permissions and valid signatures through Tauri build, app signing and DMG copy. This is addressed early with a reproducible staging script and an app-bundle health probe rather than deferred to the end.

### Process protocol deadlock or event loss

A sidecar can deadlock if stderr is not drained, stdout parsing blocks writes, or Rust holds locks while awaiting responses. Snapshot/event races can also overwrite live output. Dedicated readers, a single serialized writer, bounded maps/buffers, request timeouts and attach-before-snapshot sequence fencing are required and covered by fixture-process tests.

### pi lifecycle mismatch

`prompt()` normally resolves after the whole run, `agent_end` may be followed by retry/compaction/continuation, and abort does not inherently define queue behavior. The implementation must use preflight acknowledgement, preserve event ordering and treat only `agent_settled` as idle. These invariants are fixed in sidecar and reducer tests before UI work.

### Default tools are broader than Rust's filesystem boundary

The user approved normal pi coding behavior. Consequently, default pi tools run inside the trusted sidecar with user permissions and can access outside cwd. The UI and docs must not describe this as sandboxed. A Rust-brokered restricted tool mode is deliberately not mixed into this delivery.

### Session association recovery

Pi transcripts are keyed by cwd on disk, while SpireCode tabs are keyed by stable worktree UUID. Worktree rename/delete and sidecar crash can leave detached transcripts. The implementation keeps transcript deletion out of lifecycle operations, validates cwd/session metadata on reopen and shows detached/failure states rather than guessing ownership.

### UI and memory pressure

Tool output and long transcripts can be large. Full bodies must not enter Zustand/localStorage, event queues must be bounded, notifications batched and UI values collapsed/truncated. Transcript pagination or bounded hydration is implemented before claiming large-history support.

## Alternatives deliberately rejected

- **Rewrite the whole backend in Bun/Electrobun:** best direct pi integration but needlessly rewrites working Rust Projects/Files/Git/PTY/security/packaging for this feature.
- **Call `pi --print` per message:** cannot preserve a rich multi-turn session/run lifecycle or faithfully expose queue, tool, reasoning and settlement events.
- **Use unmodified `pi --mode rpc`:** faster prototype, but a custom SDK host gives explicit multi-session ownership, early acknowledgement, normalized event contracts and controlled recovery needed by the accepted design.
- **Run pi SDK in the WebView:** violates the existing security boundary and would expose filesystem, shell, credentials and provider access to renderer code.
- **One sidecar per Chat:** stronger isolation but linear runtime/memory/startup cost and harder shared model/auth management; one supervised sidecar with multiple sessions is the approved MVP.
- **Store transcripts in Zustand/localStorage:** violates repository ownership rules and creates persistence, size and privacy problems; pi JSONL remains authoritative.

## Proof

### Focused development commands

```bash
pnpm --filter spirecode-agent-sidecar test
pnpm test -- src/features/chat src/features/editor
cargo test --manifest-path src-tauri/Cargo.toml chat
node scripts/check-agent-runtime.mjs
```

### Full quality gate

```bash
pnpm check
```

Healthy result: Prettier, brand guard, ESLint, TypeScript, all frontend/sidecar tests, Rust fmt, Clippy with `-D warnings`, and all Rust tests exit zero.

### Release gate

```bash
pnpm bundle
```

Healthy result:

- sidecar and pinned Node runtime are present inside `SpireCode.app`;
- nested executable and app signatures verify;
- sidecar health request succeeds from the final app resource paths;
- app and mounted-DMG smoke checks pass;
- no sidecar child remains after smoke exit.

### Manual real-provider acceptance

- Create two Chat tabs in one worktree and stream both independently.
- Render assistant text, Thinking and a tool execution.
- Send while running and observe follow-up queue behavior.
- Stop and restore queued text to the composer.
- Close a running Chat tab without aborting it; reopen from History and observe current/canonical state.
- Restart the app and reopen a persisted transcript.
- Let the Agent modify a file and confirm Files/Git refresh.
- Exit SpireCode and confirm the supervised sidecar is gone.
