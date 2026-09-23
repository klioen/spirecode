# Spec: Reduce startup, Chat, and Project loading latency

## Requirements

### Startup and watchers

1. `BrowserWindow.loadFile()` / `loadURL()` must not wait for persisted Worktree watcher initialization.
2. Persisted Worktree watchers must initialize in the background with bounded concurrency and active Worktree priority.
3. Background failures must be logged safely and must not abort startup.
4. Shutdown must remain safe while background initialization is pending.

### Add Project

5. Opening a Project must still validate its Git root and durably persist the catalog before returning.
6. Watcher initialization must not delay the successful Project response.
7. Watcher initialization failures must be observable through diagnostics without invalidating the Project.

### Chat

8. Attaching a cold historical session must avoid a second full session-list scan when an exact session identifier/path can be resolved safely.
9. Identical in-flight adapter/session initialization must be shared rather than duplicated.
10. Settings and package/resource discovery may be cached only behind inputs that make invalidation explicit; session-bound resource loaders and extension runtimes must not be shared unsafely.
11. Main must limit timeline snapshot items before structured-clone IPC transfer. The Renderer limit remains a defensive backstop.
12. The bounded snapshot must preserve chronological order and retain the newest 2,000 timeline items.

### Measurement

13. Emit structured, privacy-safe duration records for startup AppState, background watcher batches, Project open phases, and Chat attach phases.
14. Timing records contain phase, duration, success, and safe counts/booleans only; no filesystem paths, project names, prompts, model credentials, or message content.

## Design

### Startup watcher scheduling

`AppState.create()` loads durable services and returns immediately after constructing `AppState`. It schedules persisted Worktree watcher initialization through an internal bounded worker queue. The active Worktree, if any, is first. Remaining watchers run with a small concurrency limit so startup does not launch one Git process per Worktree simultaneously.

`dispose()` marks the state disposed and awaits/cancels only as needed to prevent late unhandled work. Watcher registry operations remain idempotent.

### Project watcher scheduling

`openProject()` awaits `ProjectService.openPath()` and then schedules each Worktree watcher on the same background scheduler. The returned Project is not rolled back if watcher setup fails because watcher setup is runtime infrastructure, not catalog validity.

### Chat attach

Use Pi SDK exact-ID lookup when available rather than `SessionManager.list(cwd)` followed by `.find()`. The resolved path remains constrained to the SDK-owned session directory and is reopened with the expected cwd.

Keep the global `ModelRuntime` and adapter singleton. Cache only pure discovery inputs/results with explicit settings/source fingerprints or short-lived in-flight promises. Continue creating a separate resource loader, extension runtime, and AgentSession per Chat because they own session lifecycle and subscriptions.

At snapshot time, normalize the active branch then retain only the newest 2,000 timeline items before returning from Electron Main.

### Timing diagnostics

Use the existing `DiagnosticsService.log()` JSONL sink. Add a narrow performance helper that records integer duration milliseconds and allowlisted metadata. Startup timing begins in `AppState.create`; Project and Chat timings live at their domain boundaries.

## Acceptance criteria

- With 20+ persisted Worktrees, `AppState.create()` no longer runs one watcher Git lookup per Worktree before Renderer load.
- `openProject()` resolves before an injected slow watcher promise.
- A cold Chat attach opens an exact session without invoking adapter list.
- A snapshot with more than 2,000 projected items returns exactly the newest 2,000.
- Duplicate initialization tests prove one in-flight operation is shared where caching is introduced.
- `pnpm check` passes.

## Concerns

- **Concern: PiServices reuse.** `DefaultResourceLoader`, extension runtimes, and bound UI contexts are session-scoped. Reusing them across Chat sessions risks cross-session state and cleanup corruption. The implementation must prefer caching discovery data or in-flight pure work instead of reusing session-bound services.
- **Concern: watcher readiness.** Filesystem/Git invalidations may be missed during the short interval before the background watcher becomes ready. Initial file tree and Git status reads remain authoritative; watcher readiness is eventual.
- **Concern: snapshot truncation.** Truncating projected UI items must not modify persisted Pi context or SessionManager entries. It affects only the Renderer snapshot DTO.
