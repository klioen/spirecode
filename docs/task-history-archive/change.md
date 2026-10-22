# Task history retention independent of worktrees

## Intent

The user approved archiving to SpireCode userData, keeping original SDK sessions, allowing read-only history after worktree cleanup, freezing final metrics, and explicitly retaining selected artifacts. This amendment supersedes the earlier cleanup rule that hid all session navigation after cleanup.

## Specification

- Schema v5 adds STRICT archive state, session file index, per-run retention/statistics and artifact index tables. Existing Task/Run identities and report JSON are unchanged. The additive v4-to-v5 migration is transactional and retains a pre-v5 recovery backup; older application versions fail closed on this newer schema.
- Files live below `userData/task-archives/<taskId>/sessions/<sessionId>.jsonl` and `userData/task-archives/<taskId>/artifacts/<runId>/<relativePath>`. Shared sessions are copied once per Task; reports remain in tasks.sqlite3. Original SDK files are not moved, rewritten or deleted by archiving.
- Reported/failed/cancelled Runs freeze terminal token/duration totals and backfill validated session paths. Missing statistics remain pending rather than being permanently frozen as zero when a real session should exist. Empty unpersisted attempts receive an explicit empty marker. Shared-session totals use each Run's timestamp window, including its terminal millisecond.
- Task completion attempts archiving. Failed/cancelled terminal Tasks can explicitly archive too. Archive failure does not undo acceptance or erase reports; cleanup requires a verified archive and is blocked on failure. Explicit archive and cleanup serialize with Task mutations and drain before shutdown.
- Both Task cleanup and generic worktree deletion preserve Task history. Task-owned cleanup uses its already-held Task lock; generic deletion serializes archive admission first. Original Chat session deletion requires verified archives for every retained TaskRun reference, not only the most recent Run. No new history-deletion command or automatic destructive retention policy is introduced.
- Persisted intent includes artifact selections. Snapshot files are bounded, copied through exclusive temporary files, flushed, atomically renamed and hash-verified before SQLite indexing; POSIX ancestor directories are flushed as well. Indexed snapshots are immutable: a corrupt copy blocks cleanup instead of being accepted as valid. Copy-before-index interruptions retry safely; startup recovery resumes archive and cleanup intents. Required missing/invalid sessions block cleanup; unpersisted empty failed attempts do not invent a transcript.
- SDK lookup for an old/missing checkout only enumerates bounded regular filenames for owned session IDs inside the SDK session root, rejects duplicates and skips symlinks. No Agent/session SDK open, extension load, project discovery or cwd recreation is needed for archived history. Session header identity and run markers are verified before copying.
- Artifact retention is explicit: at most 20 portable workspace-relative regular files, 10 MiB each / 50 MiB total. Paths reject traversal, symlinks, Git metadata, special files and ambiguous case aliases. No automatic copying of the entire checkout, ignored build directories or dependencies occurs. Session snapshots are limited to 32 MiB each / 128 MiB per Task and 50,000 JSONL records; oversized or corrupt records fail closed before workspace deletion.
- New allowlisted commands are `task_archive`, `task_archive_read`, and `task_archive_reveal`. Renderer sends only Task/Run IDs and bounded relative artifact keys, never absolute paths, cwd, source paths or force flags. Parsers are shared between IPC validation and dispatch; Main validates ownership and derives canonical roots.
- Read-only history uses paged plain-text audit records (including tools/branches), integrity checks, run-bound cursors, request fences and visible retry. Responses are bounded to 20 records / 512 KiB; records above 64 KiB show an explicit truncation notice and the complete JSONL remains available through a validated Reveal action. No composer, Agent, shell, raw filesystem bridge or remote-image loading is exposed. Transcript bodies remain component-local, not in Zustand.
- UI offers archive/save/verify, an optional file list, independent current/historical archived-session viewing and indexed artifact reveals. Cleared workspaces retain this read-only entry. Old cleared Tasks can archive remaining SDK files; the application does not fabricate missing records or claim that deleted artifacts can be reconstructed.

## Verification plan

1. Migration success/rollback/backup and unchanged report data.
2. Real temporary SQLite/filesystem round trip: null path, frozen statistics, archive, workspace removal, original source removal, restart, paged history and artifact retrieval.
3. Shared-session deduplication/windows; empty attempts; missing/foreign/corrupt sources; symlink/traversal/cursor/size/ownership boundaries; interrupted copy/index recovery.
4. Domain cleanup failure/no deletion, shutdown drainage, all-reference Chat deletion guards, read-only UI and late-response/pagination/retry behavior.
5. Full pnpm check and build. Native installation and changes to the existing PR are separate user actions; do not migrate the live application database just to verify this implementation.

Risk: high because the change adds durable archive indexing, a forward-only migration and deletion ordering. The user's explicit approval covers this implementation, but not force cleanup, history erasure or application reinstallation.

## Delivery and verification (2026-10-22)

Implemented in Main archive service/repository, schema migration, Task lifecycle/delete guards, narrow IPC/bindings and Renderer read-only archive view.

- Final full `npm_config_store_dir=/Users/bytedance/Library/pnpm/store pnpm check` passed (exit 0) with native filesystem test permissions: 97 test files / 744 tests, all formatting/brand/i18n/secrets/licenses/lint/typecheck gates and 19 release tests passed. No test was skipped or suppressed.
- An earlier full run had one failure in the unchanged EditorPane dirty-tab confirmation test (741 passed / 1 failed); its isolated 28-test rerun and the final full rerun passed. No EditorPane source or test was modified to work around it.
- `pnpm build` passed (exit 0); sandboxed preload stays allowlisted and Main retains node:sqlite. The existing large Renderer chunk warning remains advisory. Packaged smoke expectations were updated for schema v5 and its nine domain tables.
- Additional source secret scan included tracked and untracked new files and passed. `git diff --check` passed.
- Real temporary-data tests cover source/path backfill, final statistics, per-run windows/shared-session deduplication, workspace/source removal plus database restart, full-source/artifact integrity, read paging/cursor fences, symlink/traversal/foreign IDs, invalid UTF-8/partial JSONL, artifact size/alias bounds, empty attempts, persisted selections, interrupted copy/index recovery, protected generic deletion and all-reference original-session deletion.
- UI tests cover post-cleanup report/session access without a composer or live session callback, artifact reveal, pagination failure/retry, delayed selection responses, and archive-before-cleanup ordering/revision use.
- No live user database was opened for migration, no user's worktree/session/artifact was copied or deleted, and no application reinstallation, screenshot-level native acceptance, Windows/Linux native packaging or PR update was performed in this implementation turn. Files remain uncommitted pending the user's next action.
