# Spec: Correct project hierarchy and worktree ownership

Status: accepted.

## Visual hierarchy

- The project row remains the root visual level.
- A Git worktree row and a session directly owned by a non-Git directory project share the next visual level.
- A session owned by a Git worktree is indented one additional level beyond that worktree.
- Loading, empty, and error states use the same left edge as session rows at their corresponding level.
- Indentation changes must not alter row hit targets, drag ordering, expansion, selection, context menus, or keyboard behavior.

## Catalog ownership

- Project and worktree paths are canonical absolute roots when created. Reconciliation uses exact root equality only; a merely nested path is not considered an owned worktree.
- Before session candidates are merged, Main builds ownership from each catalog project's non-main worktrees.
- If a standalone project root exactly equals a non-main worktree root owned by another project, Main removes the standalone catalog entry and its `projectOrder` entry.
- Reconciliation applies only to standalone duplicates with exactly one synthetic/main workspace rooted at the same path. Projects with additional worktrees are not silently removed.
- The owner project and worktree IDs, group assignment, and worktree metadata remain authoritative. The duplicate's latest project timestamp is merged into the owner project/worktree.
- If the duplicate workspace was active, `activeWorktreeId` is remapped to the owning worktree ID.
- No filesystem path, Git repository, worktree, Pi session, Chat runtime, or Terminal is deleted or stopped.

## Future discovery and explicit opening

- A Pi session candidate whose resolved Git root exactly matches an existing non-main worktree updates the owner project/worktree recency rather than creating another project.
- Explicitly opening the exact root of a known worktree returns/selects its owning project and worktree rather than creating a standalone project.
- Session candidates for independent Git repositories and ordinary directories continue to be added under Ungrouped.

## Compatibility

- `ProjectCatalog` remains version 5 and no IPC shape changes.
- Existing valid catalogs without duplicates serialize identically except for legitimate recency updates.
- Older binaries can read the reconciled catalog because no schema field changes.
