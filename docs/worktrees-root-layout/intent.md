# Intent: Move managed worktrees under ~/.spirecode/worktrees

Author: user. Status: accepted.

## Problem
Managed worktrees are created under `~/.spirecode/<project-name>/<name>`, which mixes the per-project managed roots directly with other SpireCode-managed content under `~/.spirecode` and produces confusing paths like `~/.spirecode/spirecode/settings`.

## Proposed outcome
New managed worktrees are created under `~/.spirecode/worktrees/<project-name>/<name>`. The per-project ownership marker stays scoped to `~/.spirecode/worktrees/<project-name>`, so the multi-project ownership model is unchanged.

## Affected users and systems
- SpireCode users creating/renaming managed worktrees.
- Electron Main `WorktreeService` (`managedRoot`) and its tests.
- Canonical documentation in `docs/project-worktrees/spec.md`.

## Constraints
- Keep the `worktrees/<project-name>` two-level nesting (option A) to preserve per-project ownership-marker isolation.
- Existing worktrees on disk are migrated in the same delivery (`git worktree move` + state.json path rewrite).
- Preserve ownership-marker, symlink protection, rename, delete, and rollback behavior.
- No Renderer or IPC contract changes.
