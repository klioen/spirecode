# Spec

## Data model

- `tasks.verification_enabled` is a non-null boolean persisted with default enabled.
- Schema v8 `task_verifications` preserves every attempt and binds it to task, coding run, worktree, exact commit SHA, positive attempt number and a durable deadline.
- A verification starts with no verdict and finishes exactly once with `pass`, `fail`, or `inconclusive`, a summary, and validated structured evidence.
- Task detail returns the latest verification; historical rows remain queryable in the repository.

## Gate

For Git projects, after a coding report is durable and before push or change-request operations:

1. Host commits local implementation changes, records HEAD, and proves the worktree clean.
2. If verification is disabled, delivery continues unchanged.
3. If enabled, host creates a fresh read-only pi session bound to the verification id. Restricted resource loading disables extensions, skills, prompts, context files, themes, and MCP; the exposed tools are read, constrained bash and the verification report tool.
4. The prompt contains the original Task title and description, identifiers, commit SHA, and verification instructions. It never contains coding chat or coding report summary.
5. The report tool validates verification identity and a strict evidence schema and is accepted once only by the current active attempt/session, before expiry or cancellation.
6. PASS continues delivery. FAIL or INCONCLUSIVE skips push/change-request creation. Session/prompt failures and settling without a report finish as INCONCLUSIVE.

A previous verdict is never reused for another commit: each delivery attempt resolves the latest record by coding run and exact SHA. Explicit verification-only retries create a new attempt at the same run/SHA, preserving all previous records.

## Product behavior

- Completed verification verdicts finalize the coding run and place the Task in `needs_review`; Task cancellation remains cancelled.
- Verification has a persisted default 60-minute deadline, including setup. Timeout cancels the verifier and records an explicit inconclusive result; chat prose cannot acknowledge an unaccepted report.
- Task events record verification started and terminal verdict. Existing review notifications still notify the user.
- TaskDetail exposes a switch and shows the latest verdict, summary, acceptance checks, commands, and issues.
- TaskDetail also exposes verification-only retry and narrow, audited legacy late-report recovery. Passing either path resumes the existing delivery saga without rerunning coding. See [recovery change](../task-verification-recovery/change.md).
- Turning verification off on an editable/review Task permits the next run/retry to use the direct delivery path.

## Exclusions

No mutation, property, fuzz testing, automatic builder retry loop, separate sandbox, or verifier-specific model selection is introduced.
