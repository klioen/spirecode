# Task session bootstrap fix

## Intent

Task runs currently fail during the `session:intent` step because a newly created Pi session has no JSONL file until its first persisted entry. Main names the in-memory session and then immediately resolves `sessionPath`; Pi session discovery cannot find the still-empty session, so every attempt is recorded as `TASK_FAILED` before prompt submission.

## Spec

- A newly created Task session binds its durable `sessionId` immediately but stores `sessionPath = null` until the session has persisted a transcript.
- Session naming still happens before prompt submission so the eventual persisted metadata keeps the Task name.
- Prompt delivery remains the operation that creates the first durable transcript entry.
- Existing metrics lookup continues resolving a missing `sessionPath` lazily from `worktreeId + sessionId`.
- No SQLite, IPC, or Renderer contract changes are required.

## Plan

1. Add a regression test proving Task session bootstrap never resolves the JSONL path before the first prompt.
2. Move Task session creation into a focused AppState helper and return `sessionPath: null` after create/name.
3. On restart, recreate a bound but still-empty session when Pi reports it missing before the prompt was persisted.
4. Verify the focused tests and `pnpm check`, reinstall the packaged app, then retry the affected Task.

Risk: standard bug fix. It changes session bootstrap ordering but does not change the persistence schema or trust boundary.

## Verification

- Focused AppState and TaskService tests cover both initial bootstrap and restart recovery.
- `pnpm check` passed with 91 test files and 658 tests.
- The final packaged app passed App/DMG smoke and strict codesign checks, then installed successfully.
- The affected Task succeeded on attempt 5, reaching `needs_review` with a persisted report.
