# Plan: 将 SpireCode 迁移到 Electron（from `docs/electron-migration/spec.md` 2026-09-15）

## Approval and baseline

- 用户已确认本计划方向：Electron 替代 Tauri，pi sidecar 改为宿主直接调用 pi SDK，React 业务前端不改。
- 当前工作区含尚未提交但测试基本通过的 Chat 实现；它是迁移基线，不得丢失。
- 迁移保持 command/event DTO，允许修改 bindings、host adapter 和 preload 类型，不重构 `src/features/` UI。

## Files that change

### SDLC and project guidance

- Add `docs/electron-migration/{intent,spec,plan}.md`。
- Modify `AGENTS.md`、`README.md` 和 `docs/spirecode/*`，将架构、命令和发布说明改为 Electron。
- Update `docs/pi-agent-chat/*` 中仅与 sidecar/Tauri 实现矛盾的部分，并保留产品语义。

### Electron shell and IPC

- Add `electron/main.ts`、`electron/preload.ts`、`electron/contracts.ts`、`electron/ipc/*`、`electron/appState.ts`。
- Add Electron-specific TypeScript/build config and global preload declaration。
- Modify `vite.config.ts` for Electron dev/build without changing Renderer feature composition。
- Modify `src/bindings/index.ts` and low-frequency event adapters to use `window.spire`。

### Domain migration

- Add `electron/domains/persistence/*` and `projects/*` from Rust behavior/tests。
- Add `electron/domains/filesystem/*` including path guard, ignore traversal and watcher。
- Add `electron/domains/git/*` and `worktrees/*` with safe spawn, parsing, deadlines and rollback。
- Add `electron/domains/terminal/*` using `node-pty`。
- Add `electron/domains/chat/*` using pi SDK directly, adapting current `agent-sidecar` normalization/session semantics。
- Add deterministic Node/Vitest tests covering migrated Rust behavior。

### Packaging

- Modify `package.json` and `pnpm-lock.yaml` with exact Electron, packager and native PTY dependencies/scripts。
- Replace Tauri sign/build/smoke scripts with Electron `.app`/`.dmg` scripts and artifact probes。
- Remove Tauri npm dependencies, Cargo integration and generated runtime staging scripts after parity tests pass。

### Removal after parity

- Remove `src-tauri/` and Cargo lock/config files used only by Tauri。
- Remove `agent-sidecar/` and `pnpm-workspace.yaml` if no other workspace package remains。
- Remove Tauri-specific bindings/imports, capabilities and scripts。

## Order of work

1. Commit this approved artifact set alone as the audit checkpoint, preserving unrelated working-tree changes.
2. Pin Electron/build/node-pty dependencies and establish Main/Preload development boot with secure BrowserWindow options.
3. Define typed command/event allowlists and implement `window.spire`; switch bindings and event adapters while preserving feature-facing APIs.
4. Port atomic persistence and Project catalog, then verify project commands against temporary Git repositories.
5. Port Filesystem path guard/readers and Watcher, with traversal/symlink/`.git` regression tests before wiring events.
6. Port safe Git runner/parsers and managed Worktrees, including rollback and dirty/busy deletion behavior.
7. Port Terminal registry to `node-pty`; verify xterm I/O, attach buffering, resize, exit and teardown.
8. Move Chat adapter/session host/event normalization into Electron Main and call pi SDK directly; delete Rust/sidecar transport only after Chat tests pass.
9. Complete lifecycle wiring for project/worktree/app shutdown and preserve current command/error DTOs.
10. Replace packaging/signing/smoke scripts; configure native module rebuild/asar unpack and build arm64 app/DMG.
11. Port remaining Rust deterministic tests, run focused tests continuously, then remove Tauri/Rust/sidecar sources and dependencies.
12. Update README, AGENTS and architecture docs; run full checks, artifact smoke and real-provider/manual acceptance.

## Risks

### Highest risk: native Terminal packaging

`node-pty` must match Electron ABI and arm64, remain outside ASAR where required and survive signing/DMG copying. Validate a PTY from the final app, not only source tests.

### Security regression

Electron preload and Node filesystem can accidentally broaden Renderer authority. Use explicit command/topic allowlists, sender checks and canonical containment tests before deleting Rust guards.

### Behavior loss during full backend rewrite

The Rust backend contains about 5,400 lines and 39 tests. Port one vertical slice at a time behind the unchanged command contract; do not delete a Rust domain until its TypeScript replacement and tests pass.

### Existing uncommitted Chat work

Do not reset or overwrite current Chat files. First establish their current test baseline, then replace only backend transport. Any necessary semantic change updates `docs/pi-agent-chat/spec.md` in the same implementation commit.

### Main event-loop stalls

Use async fs and spawned processes. pi SDK runs in Main for this approved scope; measure real streaming/tool execution and report if utility-process isolation becomes necessary.

## Rejected alternatives

- Keep Rust as Electron sidecar: removes Tauri but retains duplicate backends and does not meet the requested migration.
- Keep custom pi sidecar: contradicts direct SDK requirement and preserves avoidable framing/supervision code.
- Enable Node in Renderer: violates the existing security boundary.
- Rewrite React features: unnecessary because host access is already concentrated in bindings/adapters.
- Delete tests and approximate Rust behavior: unacceptable for path, Git, worktree and process lifecycle safety.

## Proof

Focused development checks:

```bash
pnpm exec vitest run src/features/chat src/features/editor electron
pnpm lint
pnpm typecheck
```

Full gate:

```bash
pnpm check
```

Healthy result: formatting, brand, lint, typecheck, all Renderer/domain/main/preload tests and production builds exit zero; no Cargo/Tauri step remains.

Release gate:

```bash
pnpm bundle
```

Healthy result: arm64 `SpireCode.app` and DMG build, signatures verify, app and mounted-DMG probes load preload, `node-pty`, pi SDK and static assets.

Manual acceptance:

- Open/reopen a Git project and managed worktree.
- Browse files and reject traversal/symlink escape.
- Observe external file and Git status changes.
- Create Terminal, run `pwd`, ANSI output, `Ctrl+C`, resize and close.
- Create/reopen two Chat sessions, stream text/Thinking/tool events, follow up and abort.
- Let pi edit a file and observe Files/Git invalidation.
- Quit and confirm no PTY or Agent-related child remains.
