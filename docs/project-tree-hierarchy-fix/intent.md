# Intent: Correct project hierarchy and worktree ownership

Status: accepted.

## Problem

The Projects rail currently renders Git worktrees at the same visual depth as their parent project, while sessions directly owned by a non-Git directory project can appear even farther left. This obscures the actual tree hierarchy.

At startup, Pi session discovery can also treat a SpireCode-managed Git worktree root as a new standalone Git project. The same directory then appears once under its owning project and again in Ungrouped. Existing catalogs can retain this duplicate indefinitely.

## Outcome

- The Projects rail visibly preserves the hierarchy `project -> worktree or directory session -> Git-worktree session` with one consistent indentation step per level.
- A directory that is already represented by a non-main worktree of a Git project is never added as an independent project.
- Existing standalone duplicates of owned worktrees are reconciled out of the catalog on startup without deleting files, sessions, terminals, or worktrees.

## Scope

Included:

- Projects rail indentation for Git worktrees, directory-project sessions, and Git-worktree sessions.
- Main-process project catalog reconciliation during Pi session project synchronization.
- Exact canonical-root ownership matching, selection remapping, persistence, regression tests, and packaged UI verification.

Excluded:

- Treating arbitrary nested directories as worktrees.
- Moving or deleting any repository/worktree/session files.
- Changing project groups, worktree creation layout, Pi session discovery, IPC contracts, or the catalog schema.

## Risk

High risk because the fix mutates durable project catalog membership based on filesystem identity. Reconciliation is therefore limited to exact roots already recorded as non-main worktrees, retains the owning project/worktree IDs, remaps active selection, and never touches filesystem content.
