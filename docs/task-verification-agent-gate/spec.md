# Spec

## Data model

- `tasks.verification_enabled` is a non-null boolean persisted with default enabled.
- `task_verifications` preserves every attempt and binds it to task, coding run, worktree, and commit SHA.
- A verification starts with no verdict and finishes exactly once with `pass`, `fail`, or `inconclusive`, a summary, and validated structured evidence.
- Task detail returns the latest verification; historical rows remain queryable in the repository.

## Gate

For Git projects, after a coding report is durable and before push or change-request operations:

1. Host commits local implementation changes, records HEAD, and proves the worktree clean.
2. If verification is disabled, delivery continues unchanged.
3. If enabled, host creates a fresh read-only pi session bound to the verification id. Restricted resource loading disables extensions, skills, prompts, context files, themes, and MCP; only the verification report tool is exposed.
4. The prompt contains the original Task title and description, identifiers, commit SHA, and verification instructions. It never contains coding chat or coding report summary.
5. The report tool validates verification identity and a strict evidence schema and is accepted once only.
6. PASS continues delivery. FAIL or INCONCLUSIVE skips push/change-request creation. Session/prompt failures and settling without a report finish as INCONCLUSIVE.

A previous verdict is never reused for another commit: each delivery attempt creates or resolves a record by coding run and exact SHA.

## Product behavior

- All verdicts finalize the coding run and place the Task in `needs_review`.
- Task events record verification started and terminal verdict. Existing review notifications still notify the user.
- TaskDetail exposes a switch and shows the latest verdict, summary, acceptance checks, commands, and issues.
- Turning verification off on an editable/review Task permits the next run/retry to use the direct delivery path.

## Exclusions

No mutation, property, fuzz testing, automatic builder retry loop, separate sandbox, or verifier-specific model selection is introduced.
