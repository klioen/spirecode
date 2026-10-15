# Intent

SpireCode currently treats every Project as a Git repository. Opening a directory runs Git discovery immediately, watcher setup requires Git metadata, and the Renderer always exposes Changes and Worktree actions. This prevents users from using SpireCode for an existing source folder that has not been initialized as a repository.

SpireCode should support both Git repositories and ordinary directories as first-class Projects. A directory Project must retain the useful workspace capabilities—file browsing and editing, terminals, Chat, project-local settings and durable restoration—without pretending that Git exists. Git status, diff, commit-related surfaces, and managed Worktree operations must be absent from the UI and rejected by Main when invoked for a directory Project.

The implementation must preserve the existing security boundary: Renderer operations continue to use opaque IDs and relative paths. Renderer must never receive generic filesystem or arbitrary-path IPC. SpireCode only opens existing directories and does not expose a New Project or directory-creation flow.

## Risk

High risk. This changes the durable Project schema, path handling, watcher semantics, and cross-process capability checks. Implementation requires explicit approval after review of this intent, specification, and plan.
