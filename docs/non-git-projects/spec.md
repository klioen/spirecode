# Spec

## 1. Project model

Add an explicit Project capability discriminator:

```ts
type ProjectKind = "git" | "directory";

interface ProjectSummary {
  kind: ProjectKind;
  // existing fields remain
}
```

The durable Project catalog moves from version 2 to version 3.

- Existing version 2 Projects migrate deterministically to `kind: "git"` without probing the filesystem or changing IDs.
- A directory Project has exactly one synthetic primary workspace represented by the existing `WorktreeSummary` shape.
- The synthetic workspace uses `kind: "main"`, the canonical Project path, the Project display name, and empty `branch` / `baseRef` strings. Project capability is determined only by `ProjectSummary.kind`, never inferred from these placeholder fields.
- `activeWorktreeId` remains the active workspace identity. This intentionally avoids a broad rename of filesystem, terminal, Chat, editor, event, and settings contracts.
- Parsed catalogs reject unknown Project kinds and inconsistent workspace ownership.

## 2. Open an existing folder

The existing Open Project action accepts:

- a Git repository root;
- a subdirectory of a Git worktree, normalized to its repository top level;
- an empty or non-empty ordinary directory, retained at the selected canonical root;
- a directory symlink, normalized with `realpath` so aliases do not create duplicate Projects.

It rejects missing paths, regular files, inaccessible paths, and paths that cannot be canonicalized. Such failures do not modify the catalog.

Git discovery must distinguish an ordinary directory from operational Git failures. A missing Git executable, timeout, permission failure, unsafe repository condition, or other unexpected failure must not silently downgrade a repository to a directory Project.

Opening the same canonical root reuses the existing Project and primary workspace IDs. If an existing directory Project later becomes a Git repository and is reopened, its existing IDs are retained while its kind and primary workspace branch metadata are upgraded to Git.

## 3. Runtime capabilities

Directory Projects retain:

- file tree and UTF-8 file editing;
- filesystem change refresh;
- terminal creation with the directory as `cwd`;
- Chat sessions with the directory as `cwd`;
- project-local settings, skills, and extensions resolved from that root;
- reveal, close, durable restore, and Project switching.

Directory Projects do not support:

- Git status;
- staged, unstaged, or untracked diff;
- Changes or commit-related UI;
- origin branch listing;
- managed Worktree create, rename, inspect-delete, or delete.

Main is authoritative. Git and managed Worktree domain methods reject directory Projects with `NOT_A_GIT_REPOSITORY` even if Renderer IPC is called directly. Renderer capability flags are never trusted for authorization.

## 4. Watchers and events

Watcher registration accepts optional Git metadata.

- Git Projects watch the workspace root and external Git directory when needed, preserving existing filesystem and `git://changed` events.
- Directory Projects watch only their root and emit only `filesystem://changed`.
- Directory file changes never trigger Git refresh.
- Startup restoration must register directory watchers without executing Git.

## 5. Renderer behavior

### Project rail

- The add control opens an existing folder. SpireCode does not expose a New Project or directory-creation action.
- Git Projects retain repository icon, expand/collapse, Worktree rows, and Create Worktree.
- Directory Projects use a folder icon, hide all Worktree controls and rows, and select their synthetic primary workspace when the Project row is clicked.
- Reveal and Close remain available for both kinds.

### Workbench

- Directory Projects never call Git status refresh.
- The Changes tab is hidden for directory Projects.
- If the current in-memory right panel preference is Changes, a directory Project renders Files without destroying the preference; switching back to Git restores normal behavior.
- Files, editor, terminal, and Chat remain available.

### Breadcrumb

- Git Projects retain Project > Worktree > Branch.
- Directory Projects display only the Project-level switcher and no synthetic Worktree or branch metadata.

### Diff tabs

A restored or stale Git diff tab must not execute `git_diff_file` for a directory Project. Directory workspaces remove or ignore diff tabs while preserving file, terminal, and Chat tabs. Chat tool output and patches remain visible because they are Chat content, not the Git Changes feature.

## 6. Compatibility and security

- Existing Git Project behavior and IDs remain stable after migration.
- Renderer continues to use `worktreeId + relativePath`; no raw filesystem or shell IPC is added.
- Filesystem containment, symlink escape rejection, `.git` exclusion, hardened Git execution, and atomic catalog persistence remain unchanged.
- Git capability checks are derived from Main's durable catalog.

## 7. Acceptance criteria

1. Opening an existing empty or non-empty non-Git directory creates or reuses a directory Project.
2. SpireCode exposes no New Project or directory-creation action.
3. Directory Projects support Files, editing, Terminal, and Chat before and after restart.
4. Directory Projects show no Changes, diff, commit-related, or Worktree UI.
5. Direct Git and managed Worktree calls for directory Projects return `NOT_A_GIT_REPOSITORY` before running Git or mutating disk.
6. Directory watcher events do not produce Git invalidations.
7. Existing Git Projects, linked worktrees, managed Worktrees, Changes, and diffs continue to work.
8. Version 2 catalogs migrate to version 3 without changing existing IDs.
9. `pnpm check` passes.
