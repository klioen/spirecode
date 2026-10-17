# Files CRUD Intent

## Problem

SpireCode's Files panel can browse and open files but cannot create, rename, move, copy, or delete project content. Users must leave the app for routine project organization, and external mutations can leave editor tabs and the tree out of sync.

## Outcome

Make Files a complete, accessible project file manager while preserving SpireCode's Electron security boundary: Renderer operations identify a worktree and relative paths only; Main resolves canonical roots, rejects traversal and .git access, and owns every filesystem mutation.

Users can create files and folders, rename or move entries, duplicate them, and move them to the operating system Trash. The tree refreshes without losing context, active files can be revealed, and open editor resources follow successful path mutations.

## Non-goals

- Exposing Node, Electron, absolute project paths, generic filesystem APIs, or shell command strings to Renderer.
- Permanent deletion as the default or a silent fallback when Trash fails.
- Following symlinks during recursive copy or allowing operations through symlinked parents.
- Cross-worktree moves, multi-selection, file-operation undo/redo, or tree virtualization in this delivery.
- Overwrite-on-conflict; mutations fail closed when a destination exists.

## Risk

High risk: this changes filesystem/path-isolation behavior and the Renderer/Main IPC contract, and includes destructive user-visible operations. The user explicitly confirmed the design and requested implementation after these risks and behaviors were described.
