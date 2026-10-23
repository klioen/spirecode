# Preserve existing Task schema v5 after installing a main-based build

## Cause

After rebasing onto origin/main at 320a272 and reinstalling, the application was
running a Task loader supporting schema v4 while the user's existing database
already had v5 from task-history-skill (4e6ac13). SQLite quick_check passed. The
loader correctly rejected the newer version, but Main replaced the useful
TASK_SCHEMA_TOO_NEW reason with a generic database-open error. Empty-userData
smoke could not catch this real-data compatibility mismatch.

## Fix

- Carry forward the exact known additive v5 archive-table schema from 4e6ac13.
  Fresh databases now initialize at v5; v4 upgrades atomically with a pre-v5
  backup. Existing v5 databases open without rewriting Task/Run/report/archive
  rows or deleting v5 recovery backups. Unknown future versions remain rejected.
- Preserve specific schema/corruption/migration error codes and safe messages in
  Main IPC; do not expose raw open-error paths. Log only stable diagnostic codes,
  including TASK_DATABASE_READY on successful initialization.
- Extend macOS App/DMG and cross-platform packaged smoke to check current Task
  schema, integrity and all nine domain tables, rather than only GUI startup.
- This bounded repair does not import the unmerged archive UI/retention service
  or task skill feature. Existing archive files/index records are preserved; no
  live database is downgraded, replaced, recreated, or manually migrated.

## Verification plan

- Reproduce the schema-5/newer-than-schema-4 failure with a populated historical
  SQL fixture independent of the current loader; make it pass after the patch.
- Test v4-to-v5 migration/backup, rollback on v5 migration failure, unchanged v5
  task/run/report/archive rows and original backup, new Task repository writes,
  unknown future schema rejection, and accurate/sanitized IPC error reporting.
- Open an isolated copy of the user's DB with the patched module; compare all
  migration/task/run/notification/archive rows before/after and run quick_check.
- Run pnpm check, reinstall, verify signatures/App/DMG smoke and installed hash,
  then check TASK_DATABASE_READY for the real application startup.

## Verification completed (2026-10-24)

- The added historical v5 fixture initially reproduced
  `Task database schema 5 is newer than supported schema 4` exactly.
- Patched loader opened an isolated real-data copy at v5 with quick_check=ok;
  migration/task/run/notification/archive row comparisons were unchanged
  (9 Tasks / 20 Runs). The live DB file hash was also unchanged before reinstall.
- Full pnpm check passed with native filesystem permissions and the existing
  pnpm store override: 98 test files / 765 tests and 19 release tests, with no
  skipped or suppressed tests. Database tests cover v5 migration rollback,
  recovery backups, retained records and new Task writes; Main tests cover
  specific schema errors and path-safe generic failures.
- pnpm install:mac passed: build, signatures, enhanced macOS App/DMG smoke
  (schema v5 + nine tables + integrity), staged replacement, hash comparison
  and startup. Installed app.asar SHA-256 is
  `85090140c29cf39715a568f141bd8b7d270feb43e7d504364b1ed1148f02780e`.
- Actual production-userData startup logged TASK_DATABASE_READY. A subsequent
  online read-only SQLite check confirmed schema=5, quick_check=ok, all original
  Task/Run identities retained (9 / 20), and archive rows unchanged against the
  audit copy. No database deletion/replacement/downgrade was performed.
- The change is intentionally limited to the known v5 schema and its retained
  data, not the unmerged archive UI/service feature. Real model task execution
  and Windows/Linux native runtime verification were not performed.
