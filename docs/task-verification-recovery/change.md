# Verification timeout recovery

## Problem

A 15-minute orchestrator timeout permanently recorded `inconclusive` while the
verifier continued running. Its later structured pass was rejected as already
reported; the final chat message could still say pass. Delivery correctly refused
to push or create a PR, but there was no same-commit verification recovery action.

## Behavior

- Default verification budget is 60 minutes, including session setup. Each new
  attempt stores an absolute deadline; restart cannot reset that budget.
- A timeout stops the independent verifier before ending the attempt. If
  cancellation fails, evidence says so and the busy workspace blocks retry.
  Reports arriving after expiration/stopping/cancellation are not accepted.
- Valid reports claimed before expiry may finish the bounded Git integrity check.
  Invalid evidence never claims the attempt. Duplicate reports are rejected.
- Main fences report acceptance by Task active Run, latest attempt, durable
  verification identity, cancellation intent, exact commit, and clean workspace.
- Shutdown stops pending verifiers and drains orchestration without waiting for
  their deadlines. Interrupted verification remains explicit and retryable.
- **Retry verification only** starts a new independent verifier for the existing
  prepared commit and coding Run. It does not provision another workspace,
  regenerate implementation, or prepare another commit. Old attempts remain.
- **Recover report and continue delivery** is an explicitly authorized repair for
  the legacy timeout summary only. It reads the exact verifier session's active
  branch, checks session identity and prompt Run/worktree/SHA binding, and accepts
  only one schema-valid structured pass. Plain prose, duplicate reports, wrong
  identities, unrelated tool errors, and changed/busy workspaces fail closed.
  Recovery records source attempt/session provenance and preserves the old verdict.
- Startup can replay a durably written, pre-deadline report from an unfinished
  attempt, validating the commit again. A session interrupted without a report
  becomes inconclusive; it is not relaunched as a coding agent. Session creation
  before binding is recovered by exact durable ID, without duplicate sessions.
- Verification sessions restore their Main-owned restricted read/bash/report
  policy on create, open, and rebind, including terminal historical sessions.
- The report tool response, not the final chat text, acknowledges acceptance.
  Prompts explicitly tell the verifier not to claim recorded success after errors.
- Passing verification continues the existing durable delivery saga. Publication
  and review metadata remain Main-owned; a failure uses existing delivery retry.
  User acceptance, merge and release are never automatic.

## Storage and UI

Schema v8 rebuilds `task_verifications` additively, preserving all v7 row identities,
reports, evidence, sessions and timestamps. New fields are positive `attempt` and
nullable `deadline_at`; uniqueness becomes `(coding_run_id, commit_sha, attempt)`.
Repository retry atomically creates an attempt and reactivates the same Run.
Both packaged Task smoke checks validate schema v8, attempt/deadline columns,
quick integrity and foreign keys. GUI smoke waits at most 30 seconds for the
Task-ready diagnostic marker and database, rather than assuming startup is complete
after five seconds (historical session discovery exceeded that assumption locally). Migration is checked on populated fixtures and a
read-only online snapshot of historical application data before installation.

Task details offer verification-only retry, narrow legacy report recovery, and
opening the independent verification session to inspect/stop it. IPC accepts only
Task identity and revision; Renderer cannot supply a verdict, evidence or path.

## Regression coverage

Timeout/abort/late rejection, same-Run retry/history, report-versus-timeout race,
cancellation during pass validation, unsafe recovery rejection, report replay
without coding-session load, shutdown drain, strict evidence and deadline parsing,
populated v7 migration, IPC allowlisting, UI actions and restricted tool responses.

## Verified delivery

- Final `pnpm check`: 106 Vitest files / 876 tests and 35 release tests passed.
- Production build, macOS app signing, app smoke and mounted-DMG smoke passed;
  the installed application matches the validated `app.asar` hash.
- A read-only historical-data snapshot retained all 21 Task and 32 Run identities,
  all original verification reports and all unrelated Task/Run rows. Schema v8,
  quick integrity and foreign keys were rechecked after normal application restart.
- The authorized legacy report recovery reused coding Run
  `014e1d2c-6f76-4b0f-bd17-cfbf1467c7aa` and exact commit
  `e01f74fb98a5a96304ad06732cf2ac064e46175f`, preserved the original inconclusive
  attempt, and added a passing attempt with source-session provenance.
- The real allowlisted recovery API resumed delivery to Ready PR
  <https://github.com/klioen/spirecode/pull/108>. A duplicate recovery request was
  rejected with no Task revision, verification or PR change. Task remains
  `needs_review`; no acceptance, merge or release was performed.

## Report format correction, session routing, and changed-commit retry

- One successfully accepted report is required, not one tool invocation. The
  verifier may correct schema-rejected calls at most twice before acceptance;
  terminal/deadline/cancellation fences still reject late or duplicate verdicts.
- The tool accepts issue evidence as a string or up to 100 string fragments.
  Main preserves fragments as newline-separated canonical text, enforcing the
  existing 8 KiB UTF-8 issue limit and 256 KiB report limit without truncation.
  The stored schema remains v8. Recovery excludes only positively identified SDK
  schema rejections and still requires one unambiguous valid report.
- Main assigns `chat`, `task-intake`, and `task-verification` presentation kinds
  independently of permissions. The narrow `chat_session_kind(worktreeId,
  sessionId)` query reconciles restored tabs before rendering intake UI, including
  empty intakes whose pi JSONL is not yet created. Kind is never sent to pi.
- **Verify current commit again** requires explicit user confirmation. Its
  `task_retry_verification_current_commit(taskId, expectedRevision)` command reads
  the current clean HEAD on the persisted Task branch in Main; Renderer cannot
  provide a SHA, verdict, evidence, or path. Dirty, busy, cancelled, delivered,
  stale, and wrong-branch requests are rejected before mutation.
- A transaction retains old verification rows, audits old/new SHA and old Git
  preparation, replaces the delivery pin, creates a fresh independent attempt,
  and reactivates the same coding Run. Attempt numbering is monotonic across all
  commits of that Run. Restart continues the new verification without coding;
  any insertion failure rolls back the pin, audit event and Run activation.
- A passed current commit can adopt an already-merged exact hosting receipt after
  rechecking repository, source branch, target, source project, SHA and cleanliness.
  Mismatches remain errors. No new PR, push, merge or acceptance occurs on adoption.
