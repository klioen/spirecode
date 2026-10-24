# Task delivery recovery

## Intent

A successful coding report must not be lost when GUI launch environments cannot locate the hosting CLI or a subsequent Git operation fails. A manually merged change request must be reconcilable without another coding attempt or publication.

## Spec

- Main resolves `gh`/`glab` through absolute PATH entries and fixed platform installation locations. macOS Homebrew installations work without sourcing shell startup files or mutating global PATH. Executables must be regular, executable files; world-writable files or containing directories are rejected on POSIX.
- Local commit and remote delivery failures retain a bounded operation phase, validated host error code, and numeric exit status. Raw stderr, credentials, arguments, and arbitrary exception messages are not stored or logged. Diagnostics retain code and error type only.
- A matching Draft/closed/merged or ambiguous change request is detected before pushing. Ordinary delivery still requires verification and a Ready open change request; Agent-supplied URLs remain untrusted.
- Startup reconciliation runs in a serial background pass over failed Tasks. It only considers the latest failed run with a successful durable coding report and a Git delivery intent. No new coding or verification session, commit, push, or change-request mutation is performed.
- A merged receipt must uniquely match the canonical provider/repository, same source repository, persisted source branch and target, and exact clean local HEAD. Branch/HEAD/cleanliness are rechecked after the server response. Deleted remote branches are not recreated.
- Main atomically updates Run review, Task metadata, delivery step, and reconciliation event under Task/Run revision guards. The Task becomes `needs_review`, never automatically `completed`. Historic verification evidence is not invented. Incomplete, ambiguous, Draft, unmerged, dirty, missing, or mismatched receipts leave the Task untouched.
- Explicit delivery retry attempts the same read-only reconciliation before resuming the existing run's normal preparation, verification, and delivery path. It does not rerun coding merely because remote delivery failed.
- Failed network/CLI lookup during background reconciliation leaves original failure/history unchanged. Cancellation, concurrent edits, newer runs, and removed workspaces are respected.

## Plan and validation

1. Rebase onto current main while preserving local schema smoke changes.
2. Add platform CLI discovery and safe delivery error boundaries.
3. Add immutable merged-receipt lookup and guarded transactional recovery; wire Main diagnostics.
4. Exercise realistic temporary Git repositories and SQLite-backed service tests, including missing Homebrew PATH, executable trust, mismatches, duplicate requests, dirty checkouts, same-run recovery, and revision races.
5. Run the full gate and production audit. Do not modify live Task data, publish new PRs, or reinstall as part of repository verification.

The preserved local v7 smoke changes additionally require the `task_verifications` table, closing a gap in the latest main's table-count assertion.

### Results

- After the final rebase onto main, the full gate passed: 105 test files / 851 tests and 35 release tests. Production audit reported no known vulnerabilities. The sandbox-only run missed native watcher events in three tests; the complete unsandboxed rerun passed, including those tests.
- Production Renderer/Main build passed (existing large-chunk warning only).
- With a minimal macOS GUI PATH (`/usr/bin:/bin:/usr/sbin:/sbin`), the production CLI runner located the installed Homebrew `gh`; global PATH remained unchanged.
- A real Task database backup was tested using read-only hosting queries. All four failed successful coding runs matched existing merged receipts and recovered to `needs_review` with the same run and review metadata on the temporary copy. The copy was deleted; no live Task state, coding session, Git commit/push, or hosting mutation occurred.
- Separately, a user-requested local reinstall passed signed App/DMG smoke and installed-archive checksum verification. Startup reconciliation linked all four affected Tasks to their existing merged PRs using the original runs. Installed schema v7 passed integrity/foreign-key checks; only one application main process remained, with no askpass-launched instance. Old application and data backups were retained.
