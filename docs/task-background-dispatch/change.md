# Task background dispatch and retained reports

## Intent

User requested decoupling Task creation from execution and keeping completed reports accessible. Creating a Task must not wait for workspace/session provisioning or prompt submission; Main must dispatch durable queued work asynchronously.

## Spec

- With automation enabled, creation atomically persists the Task and its initial queued TaskRun, then returns queued detail. With automation disabled, creation remains backlog with no Run.
- Run, Retry and Request changes also persist queued attempts and return without executing the provisioning saga. Existing revision checks and Request changes workspace/session reuse remain unchanged.
- Main owns an event-driven background dispatcher, woken on the next event-loop turn after enqueue, startup recovery or execution-slot release. It uses the existing hardened Git and Pi services; it is not a Renderer worker or a new OS thread with filesystem/IPC privileges.
- Claims use the existing transactional queued-to-provisioning transition and Main start lock. At most three provisioning/prompting/running attempts occupy execution slots. Queued attempts sharing a workspace wait for the active attempt, including awaiting_report, and do not block unrelated queued work.
- Background execution failures persist failed/recoverable state and use existing notification behavior; they do not retroactively fail creation. Background claim/completion emits lightweight revision invalidation so the UI refreshes without another mutation.
- Cancellation is persisted before waiting for an in-flight worker. Saga checkpoints honor it before session/prompt side effects, and settled/report events cannot release a cancelling Run prematurely.
- Shutdown stops new dispatches and drains claimed background orchestration before Chat/watcher/database teardown; committed queued work survives restart and is dispatched after recovery. Existing started-saga recovery, prompt markers, cancellation intents and deferred report finalization remain in use.
- Latest report content is visible independently of Task status, including completed and workspace removed. Previous Run reports remain available in expandable Run cards. Accept/Request changes controls are shown only in needs_review.
- No schema migration, new dependency, IPC command or Renderer privilege is introduced. Automation remains opt-in/out through the existing form setting; enabled means background queue, not synchronous execution.

## Plan

1. Add failing regressions for queued creation and completed report visibility.
2. Commit initial Task/Run atomically; decouple queue admission from background orchestration and wire revision invalidation.
3. Cover cancellation-before-dispatch, blocked provisioning, shared workspace, execution limits, duplicate starts, failures and restart recovery.
4. Separate report rendering from review actions, retain historical reports, and update bilingual queue copy.
5. Run focused suites and pnpm check; package on the host target if available.

Risk: high for execution orchestration and crash-recovery ordering, despite unchanged schema and IPC. This change implements the user's explicit request and preserves Main-only resource ownership.

## Verification

- Task/Main/Renderer focused suites: 16 files, 120 tests passed (exit 0).
- Regressions cover atomic Task/Run rollback, immediate queued responses, concurrent claims capped at three, independent provisioning, shared-workspace waiting, duplicate enqueue, durable queued recovery, cancellation before dispatch/during workspace creation/during prompt-marker inspection, shutdown ordering, background errors, completed/cleaned report visibility and historical reports.
- Final full-suite rerun excluding only the unchanged failing watcher suite: 90 files, 667 tests passed (exit 0); this is not a substitute for a passing `pnpm check`.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm release:test` passed (exit 0; 19 release tests).
- `pnpm check` did not pass: three unchanged `electron/domains/filesystem/watcher.test.ts` native macOS filesystem-event assertions timed out. Formatting, brand, i18n, secrets, licenses, lint and typecheck passed; all other test files passed in that run. No watcher code/test was changed to suppress these failures.
- The default local pnpm store lookup initially blocked licenses; selecting the installed user store via `npm_config_store_dir=/Users/bytedance/Library/pnpm/store` made the license gate pass without changing dependencies, lockfile or repository configuration.
- On the user’s reinstall request, `pnpm install:mac` completed successfully (exit 0): macOS arm64 App/DMG smoke and strict signature checks passed, `/Applications/SpireCode.app` matched the built app.asar SHA-256 and the installed app started. Existing application user data was not deleted.
- Packaged Task interaction and Windows/Linux checks were not run. No SQLite schema migration or public IPC change was made.

- Final combined PR verification on 2026-10-22: full `pnpm check` passed with the existing user-store override and native filesystem permissions (95 files / 715 tests; 19 release tests). Earlier watcher timeouts did not recur; no watcher test was skipped or suppressed. See `docs/task-ui-workbench/change.md` for final gate and installation details.
