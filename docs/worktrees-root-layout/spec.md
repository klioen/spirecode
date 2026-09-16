# Spec: Move managed worktrees under ~/.spirecode/worktrees (from docs/worktrees-root-layout/intent.md 2026-09-16)

## Behavior

1. `WorktreeService` derives each project's managed root as `~/.spirecode/worktrees/<project-name>`.
2. Ownership marker `.pi-worktree-owner.json` lives at `~/.spirecode/worktrees/<project-name>`, one per project; creation/rename/delete still validate it.
3. Worktree paths are `~/.spirecode/worktrees/<project-name>/<worktree-name>`; all existing validation (safe path-segment, uniqueness, symlink rejection) is unchanged.
4. Renderer/IPC contracts are unchanged.

## Acceptance criteria

1. A newly created managed worktree has the path `~/.spirecode/worktrees/<project-name>/<worktree-name>`.
2. Creation with that default resolves the ownership marker at `~/.spirecode/worktrees/<project-name>/.pi-worktree-owner.json`.
3. Ownership conflict / symlink rejection still triggers under the new root (unit tests cover both).
4. Existing on-disk worktrees migrated via `git worktree move`; `state.json` managed paths rewritten to the new layout.

## Out of scope

- Flat `~/.spirecode/worktrees/<worktree>` layout (rejected: breaks per-project ownership isolation).
- Migration of pi sessions or chat state keyed by old worktree paths.
