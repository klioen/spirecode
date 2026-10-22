# Report guide

Use the user's language and requested format. If no format was specified, use
this structure and omit sections that do not apply:

1. **Result**: the deliverable and whether the goal was achieved, blocked, or
   failed. Distinguish execution success from the quality of the reviewed code.
2. **Scope and input snapshot**: what was examined or changed, stable revision
   identities when relevant, and what was not covered.
3. **Deliverables**: the actual patch, findings, diagnosis, document, or other
   output. Include permitted artifact identifiers or links, not invented files.
4. **Evidence**: source locations, observations, or actual check results that
   support the important claims. Separate facts and hypotheses.
5. **Acceptance assessment**: each explicit or clearly identified inferred check,
   its status (`met`, `not met`, `not verified`), and the supporting evidence or
   remaining gap. User acceptance is still pending.
6. **Verification and limitations**: what ran, what did not, partial access,
   uncertainty, and unavailable prerequisites.
7. **Next action**: only required follow-up, with its owner or needed decision.
   Suggest an implementation task for a discovered fix rather than doing it
   without permission.

## Existing SpireCode reporting tool

The host already provides this schema. It is not extended by this skill:

```ts
task_report_result({
  runId: string,
  outcome: "success" | "blocked" | "failed",
  summary: string,
  tests: Array<{
    command: string,
    status: "passed" | "failed" | "not_run",
    summary: string,
  }>,
  changeRequest?: {
    kind: "github_pr" | "gitlab_mr" | "other",
    url: string,
    draft: true,
  },
})
```

- Use the run ID supplied by the host, not an input's PR number or an invented ID.
- Put the narrative report, findings, evidence, deliverables, and acceptance
  assessment in `summary`. Do not add fields such as `taskType`, `findings`,
  `artifacts`, or `acceptanceCriteria` to the tool arguments.
- `tests` contains actual executable checks and their real result. A report-only
  task with no executable checks can use `tests: []`; explain this in `summary`.
  If a named check was required but could not run, include it as `not_run` with
  the reason. Do not represent source reading as a passed test command.
- `success` means the agreed deliverables were produced with sufficient evidence.
  A review may succeed while reporting severe defects. A diagnosis may succeed
  with qualified uncertainty if that satisfies the requested deliverable. Use
  `blocked` when a missing decision, input, permission, or capability prevents the
  deliverable; use `failed` for an unsuccessful attempt with a known failure.
- `changeRequest` is for a Draft change request delivered by the task. Do not put
  the PR/MR being reviewed there: it is an input and may not be Draft. Identify
  the review target and revision in `summary` instead.
- Respect the host's field-size limits. Keep the report concise. If required
  evidence exceeds the report budget, use an explicitly authorized artifact
  destination; otherwise report the limitation rather than silently dropping
  required evidence or writing files without permission.
- Submit one final result. If the tool rejects malformed fields before storing a
  report, correct that rejected call. If delivery is uncertain, retry only the
  identical payload when the host supports idempotency; never submit a different
  second result after a report was accepted. If transport stays unavailable,
  preserve the report in the conversation and disclose that submission failed.
- A stored report is not Task completion. SpireCode handles Agent settlement,
  review state, and owner acceptance. Never edit its database or lifecycle state.

## Outside SpireCode

Follow the actual host's reporting contract. If there is no reporting tool,
return the narrative report in the conversation. This skill does not create
sessions, queue work, clean workspaces, or archive files; those belong to the host.
