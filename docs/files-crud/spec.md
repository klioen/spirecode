# Files CRUD Specification

## Main contract

Add narrow allowlisted commands:

- `fs_create_file(worktreeId, relativePath)`
- `fs_create_directory(worktreeId, relativePath)`
- `fs_rename(worktreeId, relativePath, newName)`
- `fs_move(worktreeId, sourceRelativePath, destinationRelativePath)`
- `fs_copy(worktreeId, sourceRelativePath, destinationRelativePath)`
- `fs_trash(worktreeId, relativePath)`
- `fs_reveal(worktreeId, relativePath)`

Mutations return a typed result containing operation kind, source path when applicable, destination path when applicable, and entry kind. No command accepts an absolute path. `fs_rename` accepts only a leaf name; arbitrary relocation uses `fs_move`.

## Path and mutation safety

- Resolve worktree IDs to canonical roots in Main.
- Reject absolute paths, empty mutation paths, `.`, `..`, NUL, and any `.git` component.
- Require canonical existing parents and reject symlink-parent traversal or escape.
- Never overwrite an existing destination.
- Reject moving/copying a directory into itself or a descendant.
- Copy symlinks as symlinks without traversing them; reject copied symlinks whose target would escape the worktree.
- Create files with exclusive creation and create directories without recursive missing-parent creation.
- Trash uses Electron `shell.trashItem`; failure is surfaced and never falls back to permanent deletion.
- The worktree root cannot be renamed, moved, copied, or trashed.

## Files UI

- A compact toolbar exposes only New File and New Folder with accessible labels and tooltips; filesystem watching keeps the tree current without manual Refresh, and users collapse directories directly in the tree.
- Context menus expose context-appropriate New File/Folder, Rename, Duplicate, Cut, Copy, Paste, Copy Relative Path, Reveal in Finder, and Move to Trash.
- Creation and rename use an inline input. Enter submits, Escape cancels, and validation or command errors remain visible without losing the input.
- Copy stores a source entry and Paste invokes copy. Cut stores a source entry and Paste invokes move. Clipboard state is scoped to one worktree and clears after a successful cut/move.
- Trash requires confirmation. If affected file tabs contain unsaved changes, the confirmation explicitly warns that local drafts will be lost.
- Filesystem failures are localized and announced. Existing tree content remains visible during refresh.

## Editor and tree consistency

- Successful rename/move remaps all open file and diff tabs at the exact source path or below a moved directory, preserving active tab, preview/pinned state, and dirty metadata.
- Draft buffers are keyed by tab ID and are remapped with tabs so unsaved content survives rename/move.
- Successful Trash closes affected tabs only after confirmation; unrelated tabs stay open.
- Copy/create refresh affected directories; rename/move/trash refresh source and destination parents.
- The active file is automatically revealed by expanding ancestors and scrolling it into view without stealing focus.
- Watcher events use their changed paths for directory-level invalidation when not truncated; truncated events retain full-worktree invalidation.

## Accessibility and localization

- Existing ARIA tree semantics and keyboard navigation remain intact.
- Menu and dialog controls are keyboard accessible; inline inputs have localized labels and errors.
- Every user-visible string exists in English and Simplified Chinese catalogs.

## Acceptance criteria

1. Every Main mutation rejects traversal, .git, root operations, symlink escape, descendant moves/copies, and destination conflicts in deterministic tests.
2. Create file/folder, rename, duplicate, cut/paste move, copy/paste, Trash, and Reveal are available from Files UI.
3. Rename/move preserves dirty open editor tabs and updates resource IDs; Trash warns and closes affected tabs only after success.
4. Failed operations do not optimistically corrupt tree or editor state.
5. Existing preview/pinned opening, keyboard tree navigation, ignore filtering, file saves, and watcher behavior remain covered.
6. `pnpm check` and `pnpm build` pass.
