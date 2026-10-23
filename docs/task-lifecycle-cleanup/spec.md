# Spec: Task 生命周期安全、Session 复用与 Workspace Cleanup

> **Auto-delivery amendment:** Current Git delivery, Ready PR/MR, dirty workspace, branch, failure, retry, and recovery rules are defined by `docs/task-auto-delivery/spec.md`; they supersede older Draft-only or optional-push statements in this document.


Status: accepted. Implements `docs/task-lifecycle-cleanup/intent.md`.

## 1. Lifecycle

Task and Run state names remain compatible. `task_report_result` records `report_json` while the Run remains active. `agent_settled`, or startup recovery observing an idle session with a stored report, atomically finalizes Run=`reported` and Task=`needs_review`. Until finalization, the Run continues to hold its execution slot and workspace lease.

Any orchestration failure after a session is bound writes `failure_stop:intent` with the bounded stable error, aborts the session, writes `failure_stop:done`, then marks Run/Task failed. Recovery handles an existing intent before normal orchestration. If abort fails, the Run remains active and recoverable; it is not exposed as retryable while an old Agent may still run.

## 2. Workspace identity

Task schema v4 stores:

- `resolved_worktree_id`: canonical catalog identity after the first successful bind;
- `owns_managed_worktree`: whether the Task created that workspace;
- `workspace_cleanup_status`: `retained | intent | removed | blocked`;
- `workspace_cleaned_at` and bounded cleanup error code.

Migration backfills identity from the latest Run with a non-null worktree. Binding a later Run to a different resolved identity fails closed. Retry uses this Task-level identity. Request changes requires and reuses the resolved workspace.

## 3. Session policy

- Initial Run: create a session.
- Request changes: create a new Run but reuse the previous idle session and submit a new run marker/change prompt.
- Continue for report: same Run and same session.
- Retry after failed/cancelled: new session by default, same resolved workspace.
- Missing/unavailable reused session fails safely; it does not silently bind another Task's session.

TaskRun remains the reporting/metrics boundary even when multiple Runs share a session. Token usage is filtered by JSONL entry timestamp from `startedAt` through `finishedAt` (or current time for active Runs), preventing repeated counting of earlier attempts.

## 4. Cleanup

New narrow command:

```text
task_cleanup_workspace({taskId, expectedRevision}) -> TaskDetail
```

Eligibility is revalidated in Main immediately before deletion:

- Task status is `completed`, no active Run;
- cleanup status is not removed/intent;
- Task owns a managed workspace and has a resolved worktree ID;
- no other Task, whether active or historical, references it; this prevents cleanup from breaking another Task's retained session navigation;
- worktree project/name/base ownership validation succeeds;
- Git status is clean;
- no running Terminal or busy Chat/Agent runtime exists.

The cleanup saga writes `intent`, calls the existing non-force worktree deletion path, then records `removed` and an audit event. A dirty or busy workspace becomes `blocked` with a stable code and remains intact. Startup recovery probes an `intent`: missing catalog worktree converges to removed; an existing eligible worktree retries non-force deletion; ambiguity becomes blocked.

The UI provides cleanup on completed Task detail and a clean-only bulk action over loaded completed Tasks. Batch execution is item-by-item; failures/skips never force deletion or block safe items. Existing worktrees are never eligible. Branches and Pi JSONL sessions are retained.

After cleanup, Task detail shows the removed workspace state and disables Open session because current Chat attachment requires a live worktree. Reports and metrics remain visible.

## 5. Compatibility and security

Schema v4 migration is forward-only, backed up and transactional. Historical Run identities remain unchanged. Renderer sends only Task ID and expected revision, never path/worktree/branch or force flags. Main resolves all resource identities. Unknown fields remain fail-closed.

## 6. Acceptance

- Report does not reach needs_review before settled/idle.
- Prompt-accepted failure aborts before Run becomes failed; recovery completes a persisted stop intent.
- Retry reuses the latest resolved Task workspace even if the immediately previous Run has no worktree.
- Request changes creates a new Run on the same worktree/session and usage is not double counted.
- Safe completed owned worktree cleanup removes checkout/catalog but preserves branch/session/report.
- Dirty, busy, existing, active, foreign-reference and ownership-conflict cleanup attempts do not delete.
- Cleanup intent recovers after crashes on either side of worktree deletion.
- IPC, migration, service, Renderer and artifact tests pass on all supported targets.
