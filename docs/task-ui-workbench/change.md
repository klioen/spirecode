# Task state-driven workbench

> **Auto-delivery amendment:** Current Git delivery, Ready PR/MR, dirty workspace, branch, failure, retry, and recovery rules are defined by `docs/task-auto-delivery/spec.md`; they supersede older Draft-only or optional-push statements in this document.


## Intent

Implement the user's approved UI/interaction review: actionable execution states, searchable scoped lists, current-result-first detail, recognizable notifications, safe draft handling, lazy project configuration, and responsive/readable layouts. Preserve the existing Main-owned Task execution and safety boundaries. The rewrite comparison delivered in this historical change was subsequently removed by `docs/task-quick-create-without-rewrite/`.

## Spec

- Main exposes bounded title/description search, project and attention filters through the existing typed task_list command. Search covers the durable list, not only the loaded page. SQL remains bound; statuses and IDs are validated. No SQLite migration or dependency change.
- Task summaries include readable workspace names, latest execution state and a factual queued reason (workspace lease or capacity), never fabricated progress/ETA. Notifications include task/project names and a global unread count; a new no-argument allowlisted command marks Task notifications read.
- The list offers Needs attention, Active, Completed and All views plus search/project filtering. Background invalidation retains loaded-page depth and existing row order; view/filter changes reset pagination. Relative timestamps retain absolute accessible hints and compact layouts retain status text.
- Detail prioritizes current state/actions and latest report, then resource/cost metadata, collapsible requirements and collapsed historical attempts. Queued/provisioning/prompting/running/awaiting_report have cancellation actions, with confirmation for stopping execution. Review actions remain needs_review only; report-before-settled explicitly says finishing. Test totals precede expandable evidence; safe Changes/session navigation reuses existing worktree-ID selection.
- Bulk clean-only cleanup moves under More and requires an explanation/confirmation. Notification reads/errors have visible feedback and retry.
- Form submission distinguishes Create and queue from Create only. Project defaults use current/recent context; branch/status configuration loads only for the selected project and errors are isolated. Existing-workspace dirty authorization is never persisted in drafts. First-bound Task workspaces are read-only in the editor.
- Unsaved form drafts are transient Renderer memory only, bounded, and cleared on submit/explicit confirmed discard. Switching to Chat/Settings retains drafts during the app session; application close warns for unsaved changes. No form bodies enter the paged Zustand store, localStorage or project files.
- Task Rewrite / AI optimization is no longer current behavior; the direct form now exposes user-editable title and description only.
- Detail requests are coalesced/fenced; stale navigation/refresh responses cannot overwrite a newer task/revision, and refresh errors remain visible in detail. Fonts, semantic status colors and keyboard focus are consistent with the existing theme.

## Delivery and verification

Implementation status: implemented and installed on macOS arm64; screenshot-level visual acceptance remains pending.

1. Add regressions for filters/validation, readable DTOs, actionable states, retained reports, request fencing, pagination preservation, draft restoration and lazy projects. Historical rewrite-staleness coverage was removed with that capability.
2. Implement bounded Main read-model/IPC additions and Renderer state-driven surfaces without altering the execution saga.
3. Run focused tests, formatting/brand/i18n/security/license/lint/typecheck, full tests and build. Record actual gate outcomes, including the existing macOS watcher issue; do not suppress unrelated failures.
4. Native packaging/installation remains a separate user action unless requested.

Risk: high for the narrow IPC additions and Main read-model boundary; the user's explicit approval covers implementation of the reviewed changes. No generic filesystem, shell, database or IPC permission is exposed to Renderer.


## Verification results

- Focused Task/Workbench/Main/IPC/native-dialog suites: 21 files, 190 tests passed (exit 0).
- `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm release:test` passed (exit 0; 19 release tests). Build retained `node:sqlite` and sandboxed preload contracts.
- Formatting, brand, i18n, secret and production-license gates passed. Licenses used the existing installed user store via `npm_config_store_dir=/Users/bytedance/Library/pnpm/store`; no dependency, lockfile or repository config was changed.
- Full `pnpm check` failed only in the unchanged native macOS watcher suite: 3 filesystem-event assertions timed out; the run had 92 passing files/702 passing tests and 1 failing file/3 failing tests. These failures were not suppressed or repaired in unrelated code.
- Coverage includes durable search beyond page one and literal wildcard/SQL text, narrow IPC validation, dispatch/capacity/workspace-lease distinctions, report-before-settled invalidation, read-all notification idempotence, cancellation confirmation, retained/ordered reports, selected-task event refresh, stale navigation, paged refresh depth/scroll/order, transient draft restoration/limit/close-guard metadata, fresh dirty consent with locked identity, lazy project error retry and canonical Changes navigation. Historical stale-rewrite coverage was removed with that capability.
- Draft storage caps at 20 transient drafts and refuses overflow rather than evicting unsaved content. Dirty-workspace authorization is not stored in drafts. Successful submission after leaving a form clears its draft without redirecting the new navigation target.
- No SQLite migration, new npm dependency, generic Renderer capability, raw path/SQL parameter or automatic ready/approve/merge action was introduced.
- No native reinstallation, Windows/Linux packaging or screenshot-level visual acceptance was performed in this UI iteration. Native UI tools were unavailable in this thread; interaction verification used the Renderer/Main regression suites.
- Final current-source full-suite rerun excluding only the known failing watcher suite passed: 92 files, 700 tests (exit 0). This does not replace a passing `pnpm check`; the 3 watcher failures remain outstanding.

## Task list centering follow-up (2026-10-22)

- The installed UI exposed a cascade regression: the later list reset (`margin: 0`) overrode the automatic horizontal margins on direct Task page children. The list could therefore be left-aligned while the header and filters remained centered; page notices had the same vulnerability.
- TaskPage now owns one bounded `.task-page-content` column for its header, filters, list and notices. Only that column is horizontally centered, so child margin resets cannot change the page alignment. The existing wide-screen full-window centering adjustment, narrower form/detail widths, page-owned scroll position and container-query breakpoints are retained.
- Added DOM ownership and stylesheet regressions. Task/Workbench/theme suites passed: 12 files, 74 tests. Lint, typecheck and Renderer build passed.
- The preceding UI version was successfully installed and started at `/Applications/SpireCode.app`, with signature, App/DMG smoke and installed artifact hash checks passing. The centering follow-up was subsequently rebuilt, installed and started successfully (PID 82995), with signature and App/DMG smoke checks passing. The installed artifact hash matched the build (`19966d80b453818f09b768b3b0f9bc9f0a093393fd034a20a7253146e24544c2`), and the installed CSS/JavaScript contain the shared centered Task column.
- Native layout/screenshot verification remains unconfirmed: the isolated Electron verification process aborted under the sandbox, and the elevated retry was not executed because the approval service failed. No current application data was read or modified by the layout fixture.

## Task notification IPC follow-up (2026-10-22)

- Root cause: `task_notifications_list` used its typed pagination parser only during dispatch, but the pre-dispatch validator fell through to generic required-string validation. The first-page request `{ limit: 50 }` failed with `cursor must be a string`; providing a cursor would also incorrectly validate the numeric limit as a string. `task_notification_mark_read` had the related nullable/optional run-ID mismatch.
- Both notification commands now use their dedicated parsers in validation and dispatch, preserving the existing exact-field allowlist, numeric limit range (1–100), cursor size bound and repository cursor validation. Missing/null/empty run IDs map to the existing task-level notification key; malformed values remain rejected. No SQLite schema or data migration, new dependency or Renderer permission was introduced.
- Notification load and read errors now preserve the serialized Main error message instead of always replacing it with generic copy. Retry still clears the error after a successful refresh; failures remain visible.
- Read-only inspection of the installed user's Task database confirmed the existing notification query/schema and task links were valid. No task, run, report or notification data was changed during diagnosis.
- Added regressions first reproduced the original errors (three failures), then passed after the fix. Coverage includes first-page/paged bounds, nullable and omitted run IDs, serialized errors/retry, page accumulation, and the registered IPC handler against a real temporary SQLite database for pagination and read operations.
- Verification: 23 focused Task/Main/IPC/Workbench/theme files and 209 tests passed; `pnpm lint`, `pnpm typecheck` and `pnpm build` passed. The full gate was not rerun in this follow-up; the previously recorded unrelated macOS watcher failures remain unresolved. The notification fix was subsequently rebuilt, installed at `/Applications/SpireCode.app` and started successfully (PID 41708). Signature and App/DMG smoke checks passed, and the installed artifact hash matched the build (`ab82f89b13269f0ef4daa5e1034f9000c6d6932b7fa024df093cbd609a476f19`). The installed Main bundle matches the current build and contains both dedicated notification validation branches; screenshot-level UI acceptance remains unconfirmed.


## Final PR verification (2026-10-22)

- Full `npm_config_store_dir=/Users/bytedance/Library/pnpm/store pnpm check` passed (exit 0) with native filesystem permissions: formatting, brand, i18n, secrets, production licenses, lint and both typechecks passed; all 95 test files / 715 tests and all 19 release tests passed.
- The earlier native macOS watcher timeouts did not recur in this final run. No watcher implementation or test was changed, skipped or suppressed. Earlier failure records above are historical, not the final gate status.
- The combined source was already built, packaged, signature/smoke/hash checked and installed on macOS arm64. Windows/Linux CI and screenshot-level UI acceptance remain pending; successful native startup is not claimed as screenshot-level acceptance.
- PR scope includes background queue admission/dispatch, retained reports, state-driven Task workbench, transient drafts and navigation fencing, shared-column centering, and notification IPC validation/error handling. SQLite remains schema v4, dependencies/lockfile remain unchanged, and the Renderer capability boundary is unchanged.
