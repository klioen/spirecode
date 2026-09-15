# Plan: Move new managed worktrees to ~/.spirecode (from docs/move-managed-worktrees/spec.md 2026-09-15)

## Files that change

- `electron/domains/worktrees/index.ts` — change the production default managed root to `~/.spirecode` and expose a testable path derivation if required.
- `electron/domains/worktrees/worktrees.test.ts` — add a regression assertion for the default production root while retaining temporary roots for filesystem lifecycle tests.
- `docs/project-worktrees/intent.md` — update the canonical requested location for newly created managed worktrees.
- `docs/project-worktrees/spec.md` — update the canonical path contract.
- `docs/move-managed-worktrees/{intent,spec,plan}.md` — record scope, design, approval, and proof for this change.

## Order of work

1. Add a focused regression test that expects the production default managed root to be `~/.spirecode` and observe it fail against the current implementation.
2. Change only the WorktreeService default root; retain constructor injection and all ownership/security behavior.
3. Update current canonical documentation from `~/.pi/worktrees/<project>/<worktree>` to `~/.spirecode/<project>/<worktree>`.
4. Search source and current requirements for accidental remaining runtime references. Do not add migration logic and do not touch existing directories or catalog state.
5. Run the focused worktree tests and then `pnpm check`.

## Risks

- The highest-risk mistake is moving or rewriting existing catalog entries despite the selected scope. The implementation must contain no migration or filesystem move.
- Existing worktree rename/delete behavior validates the project root derived from the new managed home. Legacy managed entries may not support lifecycle actions after this change; the user explicitly chose not to support/migrate them and will delete them manually.
- Project-name collisions under `~/.spirecode` remain protected by the existing ownership marker and canonical Git common-directory comparison.
- Directly changing persisted state was rejected because it would violate the no-migration requirement.

## Proof

- A regression unit test proves the default root equals `path.join(os.homedir(), ".spirecode")`.
- Existing WorktreeService integration tests prove create, rename, delete, rollback, ownership-marker, and symlink behavior using an injected temporary root.
- `rg` confirms the runtime no longer defaults to `.pi/worktrees`.
- `pnpm check` proves formatting, brand checks, lint, typecheck, and all Renderer/Electron tests pass.
