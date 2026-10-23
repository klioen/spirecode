# Task session navigation fix

> **Auto-delivery amendment:** Current Git delivery, Ready PR/MR, dirty workspace, branch, failure, retry, and recovery rules are defined by `docs/task-auto-delivery/spec.md`; they supersede older Draft-only or optional-push statements in this document.


## Intent

Opening a Task session can leave the workbench at `No project open`, hiding the live Pi session. Investigation of the reported `Running` Tasks found that their first attempts had completed and submitted reports, while newer attempts had been explicitly created through `Request changes` and were still executing; Main persistence and Task event invalidation were current, so no status-state repair is required.

Risk: **standard**. The fix changes Renderer in-memory project catalog synchronization only. It does not change SQLite schema, IPC commands, filesystem behavior, Git execution, or durable Task state.

## Spec

- Opening a Task session must use the authoritative `WorktreeSummary` returned by `worktree_select` to insert/update the managed worktree in the Renderer project catalog before activating it and opening Chat. Existing worktrees update in place without changing tree order.
- Task surface closes only after worktree selection succeeds. Selection failure keeps the Task surface open and reports the command error through the Projects store.
- Async navigation uses a generation fence. A late Task selection cannot overwrite a newer Task or Project session navigation.
- Existing Task state semantics remain unchanged: an active follow-up attempt remains `Running`; a valid report transitions it to `Needs review` through the existing Main-owned event invalidation path.

## Plan

1. Add Workbench regression tests for a missing Renderer worktree, actual Chat tab creation, selection failure, and late-response suppression; add a store test for stable worktree ordering.
2. Update the Task session navigation callback with an authoritative worktree upsert and generation fence.
3. Run focused tests, `pnpm check`, package/smoke the macOS app, then validate the behavior in the packaged application before installation.
