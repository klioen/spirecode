# Intent: Move new managed worktrees to ~/.spirecode
Author: user. Status: accepted.

## Problem
SpireCode currently creates managed Git worktrees under `~/.pi/worktrees/<project>/<worktree>`, even though these worktrees are owned by SpireCode rather than pi.

## Proposed outcome
New managed worktrees are created under `~/.spirecode/<project>/<worktree>`.

## Affected users and systems
- SpireCode users creating managed worktrees.
- Electron Main `WorktreeService` and its tests.
- Documentation that defines the managed worktree location.

## Constraints
- Do not migrate, modify, or delete existing worktrees under `~/.pi/worktrees`.
- Existing catalog entries keep their recorded paths and remain usable until the user removes them.
- Preserve ownership-marker, symlink protection, Git argument-array execution, rename, delete, and rollback behavior.
- No Renderer or IPC contract changes.

## Open questions
None. The user selected the new-worktrees-only approach and will remove legacy worktrees manually.
