# Execution contract examples

These illustrate different goals using the same skill. They do not define an
exhaustive set of task types or a required `taskType` field.

## Review a PR/MR supplied by URL

**Request:** Review the supplied change and deliver findings in the application.
Do not change code or publish on the provider.

**Contract:** Resolve the repository and reviewable revision snapshot. Inspect
the actual diff and relevant surrounding code. Deliver actionable findings with
severity, locations, impact, and evidence; also report scope and limitations.
The checks are that findings have support and the requested change has been
covered, not that the code has zero findings. Do not run unknown PR code as a
side effect of reading it. Missing diff access blocks a full review. Do not use
an unrelated checkout or put the target into the reporting tool's Draft output
field.

**Boundary:** A proposed patch is follow-up work. A new head needs another review
or an explicitly agreed scope update. Neither the URL nor a finding authorizes
comments, approval, request-changes, push, or merge.

## Investigate login failures without changing code

**Request:** Find why login fails and deliver an evidence-backed report. Do not
modify code.

**Contract:** Inspect permitted source and supplied observations. Deliver the
supported cause if established, or distinguish leading hypotheses, contradictory
evidence, and the smallest next check. Explain reproduction evidence and limits.
If the user required a proven root cause and evidence is insufficient, report
that deliverable as blocked rather than claiming success.

**Boundary:** Reading logs does not authorize reproductions that change data,
install dependencies, or run a write-producing test. Request the missing
permission or evidence. Recommend a separate implementation assignment for the
fix, even if it is a one-line change.

## Implement a bounded behavior change

**Request:** Implement a named behavior and verify it within the assigned
workspace.

**Contract:** Inspect the existing behavior and project instructions. Preserve
pre-existing changes, implement only the requested behavior, and run the
applicable checks that are permitted. Deliver the patch and report actual check
results, acceptance assessment, and remaining risks. An unrelated failing check
is disclosed, not silently fixed or suppressed.

**Boundary:** Implementation does not automatically authorize commit, push,
publication, deployment, or workspace cleanup. Any delivered change request must
follow host rules, including SpireCode's Draft-only policy.

## Produce a document

**Request:** Write a troubleshooting guide to the specified document path using
the supplied incidents; do not change application code.

**Contract:** The document path is an authorized output. Produce the guide there,
verify its claims against the supplied evidence, and report its location and
remaining gaps. This narrow write permission does not authorize edits elsewhere.

**Boundary:** No fixed category is needed. The input, deliverable, and write
scope already determine the workflow and checks.
