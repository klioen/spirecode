# Plan: Task 生命周期安全与 Cleanup

> **Auto-delivery amendment:** Current Git delivery, Ready PR/MR, dirty workspace, branch, failure, retry, and recovery rules are defined by `docs/task-auto-delivery/spec.md`; they supersede older Draft-only or optional-push statements in this document.


Status: implemented.

## Delivery

1. Add schema v4 and repository tests for resolved workspace, deferred report finalization and cleanup states.
2. Red-green TaskService tests for report draining, durable abort-before-failure, retry workspace reuse and Request changes session reuse.
3. Update session metrics to use Run time windows and prove shared-session usage is not duplicated.
4. Add Main-owned cleanup dependency, IPC contract and recovery tests; reuse non-force WorktreeService deletion.
5. Add Task detail/list cleanup controls, resource state messaging and i18n tests.
6. Run focused suites, `pnpm check`, target bundle/smoke, packaged interaction, independent bugs/security/compliance review.
7. Commit, push and open a dedicated PR from `feat/task-lifecycle-cleanup`.

## Verification

- Schema v4 migration, rollback, backfill, report draining, failure-stop recovery, workspace/session reuse, time-window metrics, clean-only cleanup, stale-catalog recovery, symlink rejection, IPC and Renderer controls have automated coverage.
- `pnpm check` and `pnpm bundle` are the release gates for this change.
- Independent bugs, security and compliance passes found no remaining P0-P2 issues.

## Failure handling

- No failure path releases a workspace while a bound session may still run.
- Cleanup never force deletes. Intent is persisted before Git/catalog mutation and startup recovery converges using Task identity plus current catalog state.
- Migration changes metadata only; it never deletes a worktree, branch or transcript.
- Rollback to an older binary leaves schema v4 unreadable rather than permitting unsafe downgrade writes.
