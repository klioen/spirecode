# Spec: Move new managed worktrees to ~/.spirecode

## Requirements

1. `WorktreeService` defaults its managed root to `~/.spirecode`.
2. A newly created managed worktree has the path `~/.spirecode/<project-name>/<worktree-name>`.
3. The ownership marker remains `<managed-root>/<project-name>/.pi-worktree-owner.json` and retains its current repository-identity and symlink checks.
4. Existing catalog records that point to `~/.pi/worktrees/...` are not rewritten or moved.
5. Rename and delete continue to operate from each worktree's persisted path while enforcing the managed-root ownership rules already required by the service.
6. Tests must verify the production default root rather than only an injected temporary root.

## Design

Change the default `managedHome` constructor value in `electron/domains/worktrees/index.ts` from `path.join(os.homedir(), ".pi", "worktrees")` to `path.join(os.homedir(), ".spirecode")`.

Keep dependency injection for tests. Export a small pure helper or constant only if needed to test the default path without touching the real home directory. Existing lifecycle integration tests continue to use a temporary injected root.

Update the canonical worktree documentation in `docs/project-worktrees/` so it no longer claims that newly created worktrees use the legacy root. Historical implementation plans remain unchanged where they describe the implementation delivered at that time.

## Compatibility

The catalog persists an absolute path for every worktree. Therefore legacy entries remain addressable without migration. New creation derives its path from the new default root. No state schema version change is needed.

## Acceptance criteria

- A default `WorktreeService` resolves its managed home to `~/.spirecode`.
- Creation with that default resolves to `~/.spirecode/<project>/<worktree>`.
- Existing injected-root lifecycle tests pass unchanged.
- No migration code references or rewrites legacy `~/.pi/worktrees` entries.
- `pnpm check` passes.
