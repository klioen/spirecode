# Plan: Move managed worktrees under ~/.spirecode/worktrees (from docs/worktrees-root-layout/spec.md 2026-09-16)

## Touch points

- `electron/domains/worktrees/index.ts` — `managedRoot()` becomes `path.join(this.managedHome, "worktrees", project.name)`.
- `electron/domains/worktrees/worktrees.test.ts` — update expected marker/worktree paths to the new layout.
- `docs/project-worktrees/spec.md` — update canonical Path section.

## Steps

1. Update `managedRoot()` to insert the `worktrees` segment.
2. Update test assertions (marker path, `worktree list --porcelain` path, symlink/foreign root fixtures).
3. Run `pnpm check`; every command must exit 0.
4. Migrate existing worktrees on disk: `git worktree move` each managed worktree to the new root, move ownership markers, remove old roots (temporary compat symlinks during the live session).
5. Rewrite managed worktree paths in the running app's `state.json` (after app quit or with immediate restart).

## Risks

- Project literally named `worktrees` would collide with the shared root segment; rejected by the existing owner-marker check.
- Running app holds the old paths in memory; requires restart after migration.
