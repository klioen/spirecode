# Intent: Align Projects overlays with Files

## Problem

Projects currently uses older overlay styling for worktree dialogs, project/worktree action menus, and branch options. Their borders, radii, spacing, typography, hover states, and widths differ from the newer Files dialog and context-menu surfaces, making adjacent navigation modules feel unrelated.

## Outcome

Projects overlays use the same visual language as Files while retaining their existing behavior, accessibility semantics, and project/worktree workflows.

## Non-goals

- Changing project or worktree operations.
- Replacing existing dialog focus management.
- Changing Files behavior or introducing new dependencies.
