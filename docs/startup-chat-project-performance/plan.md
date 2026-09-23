# Plan: Reduce startup, Chat, and Project loading latency (from docs/startup-chat-project-performance/spec.md 2026-09-23)

## Files that change

Expected files, refined only if tests reveal a narrower boundary:

- `electron/appState.ts` and tests — background, bounded watcher initialization and startup timing.
- `electron/domains/chat/chatService.ts` and tests — exact session open, shared in-flight lifecycle, bounded snapshots, attach timing.
- `electron/domains/chat/piAdapter.ts` and tests — expose exact-ID open support and cache only lifecycle-safe discovery work.
- `electron/domains/diagnostics/service.ts` and tests — privacy-safe performance timing helper if the existing API is insufficient.
- `docs/startup-chat-project-performance/{intent,spec,plan}.md` — approved requirement, design, and proof chain.

## Order of work

1. Add failing tests proving `AppState.create()` and Project open do not await injected slow watcher initialization.
2. Implement active-first, bounded background watcher scheduling with safe failure handling and shutdown behavior.
3. Add failing tests proving cold Chat attach can resolve an exact session without adapter list and duplicate cold opens share one in-flight lifecycle operation.
4. Implement exact-ID session opening through the Pi adapter without weakening cwd/session-root checks.
5. Add failing tests proving Main returns at most the newest 2,000 projected Chat timeline items.
6. Move snapshot bounding before IPC return.
7. Add privacy-safe phase duration logging and tests that reject sensitive metadata.
8. Run focused Electron domain tests, then `pnpm check`.
9. Measure the local 17-Project/23-Worktree startup path to confirm watcher Git processes are no longer in the pre-Renderer critical path.
10. Review the diff, commit, push, open a PR, and reinstall the application for interactive validation.

## Risks

- The most dangerous change is watcher backgrounding because shutdown or rapid Project close can race initialization. Use idempotent registry operations, disposal guards, and settled promises.
- Sharing Pi session-bound services is rejected; only exact path resolution and safe discovery/in-flight work may be cached.
- Returning Project success before watcher readiness creates a brief eventual-consistency window. Initial explicit Files/Git reads cover current state; diagnostics capture watcher failures.
- Main-side snapshot bounding can hide old UI history by design but must never alter persisted agent context.
- Unbounded parallel watcher startup is rejected because it would trade startup blocking for a process/I/O spike.

## Proof

- Focused watcher/AppState tests demonstrate delayed watcher promises do not delay startup or Project response.
- Focused Chat tests demonstrate no redundant list scan, in-flight deduplication, and newest-2,000 snapshot bounds.
- Diagnostics tests demonstrate timing metadata allowlisting and absence of sensitive values.
- `pnpm check` exits 0.
- `pnpm bundle` and macOS App/DMG smoke pass before local reinstall.
- `git diff --check` exits 0.
