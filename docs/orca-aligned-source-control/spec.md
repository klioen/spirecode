# Spec: Orca-aligned Source Control

## Panel structure

- The header shows the unique changed-file count, a compact path filter, and an overflow menu containing List and Tree view choices.
- There is no manual Refresh action.
- Entries are projected into Conflicts, Staged Changes, Changes, and Untracked Files. Empty sections are omitted.
- Sections are collapsible buttons with `aria-expanded`, visible counts, and eligible section actions.
- Filtering matches the full relative path case-insensitively. Section-wide actions are hidden while filtering so visible results cannot be mistaken for the mutation scope.

## Change rows

- Rows retain roving tree focus, Arrow/Home/End navigation, Enter/Space preview opening, single-click preview, and double-click pinning.
- Rows show filename, muted parent path in list mode, accurate status labels and colors, rename origin when present, and available addition/deletion counts.
- Conflicts are shown before normal groups and are not presented as untracked changes.
- Active Diff rows remain visibly selected.
- Eligible hover/focus actions are Stage, Unstage, and Discard.

## Git mutations

Renderer receives only narrow commands:

- `git_stage(worktreeId, relativePath)`
- `git_unstage(worktreeId, relativePath)`; Main derives any rename origin from current status
- `git_discard(worktreeId, relativePath, untracked)`
- `git_commit(worktreeId, message)`

Main resolves worktree IDs to registered roots and validates every relative path. It rejects empty/absolute/traversal/NUL/`.git` paths and symlink escape. Git commands use argument arrays through the hardened runner, clear repository/index redirect environment variables, disable system Git config, and execute serially per worktree. Repositories selecting executable Git filters fail closed and must use the terminal for those operations.

- Stage uses literal pathspec separation.
- Unstage restores the index from HEAD and includes both rename paths when required.
- Discard tracked restores only the selected worktree path.
- Discard untracked moves only the validated selected file or symlink entry to system Trash; it never invokes repository-wide clean, never follows the leaf symlink, and rejects directories.
- Commit requires a non-empty message within the IPC limit and commits staged content only.
- Mutation success and subsequent refresh failure are reported separately; successful mutations are never presented as failed solely because refresh failed.

## Discard safety

- Discard always requires an explicit destructive confirmation describing the target.
- Unresolved conflicts cannot be discarded from the panel.
- A dirty file cannot be discarded until its in-flight editor save has settled; the confirmation warns that unsaved content will be lost.
- After successful discard, file and diff resource caches are invalidated and visible editors reload from disk. For discarded untracked files, affected tabs are removed only after Main succeeds.
- Failure leaves editor state and caches intact.

## Commit

- Commit drafts are session-scoped and keyed by worktree ID.
- Commit is enabled only when staged entries exist, the trimmed message is non-empty, there is no unresolved conflict, and no mutation is active.
- Command/Ctrl+Enter submits only when Commit is eligible and ignores IME composition.
- Submission is single-flight. Success clears the draft only if the user has not edited it during the request, then refreshes status and open diffs.

## Refresh and concurrency

- Existing `git://changed` watcher refresh remains active.
- Renderer mutation state prevents duplicate operations.
- Changes and Diff generation guards continue to reject stale results.
- Main serializes status, diff, save, and Git mutations per worktree through the existing worktree operation queue boundary.

## Accessibility

- Header controls expose toolbar/group semantics and labels.
- Section headers expose expanded state and action labels.
- Row actions are keyboard-focusable and do not steal row preview activation.
- Dialogs trap focus, close on Escape when idle, and expose descriptions/errors through ARIA.

## Acceptance

- Happy paths: stage, unstage, tracked discard, untracked discard, and commit update the repository and panel correctly.
- Error paths: Git failure, path rejection, stale refresh failure, save conflict, and duplicate invocation preserve consistent state.
- Edge paths: rename, staged+unstaged file, deleted file, untracked file, unresolved conflict, detached HEAD, empty repository, and worktree switch are covered.
- `pnpm check`, `pnpm build`, and `git diff --check` pass.
