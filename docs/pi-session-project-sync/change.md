# Pi Session Project Startup Sync

## Intent

SpireCode's Projects rail should reflect all working directories represented by existing Pi conversations, including sessions created outside SpireCode after the catalog was first initialized. On every application launch, Main should discover Pi session projects and incrementally merge them into the durable project catalog under Ungrouped.

Risk: standard change. It adds startup metadata discovery and catalog merging, but keeps ProjectCatalog v4, existing path validation, Main-process filesystem authority, and current IPC contracts unchanged.

## Spec

- Every SpireCode startup asks the Pi SDK `SessionManager.listAll()` for session metadata; SpireCode never scans `~/.pi/agent/sessions` directly.
- Each non-empty session `cwd` is treated as a candidate project path. The newest session timestamp is used as recency metadata when it is newer than the catalog value.
- Candidates pass through the existing canonical-directory and Git-root discovery rules. Nested paths and duplicate session directories that resolve to the same project produce one catalog entry.
- Newly discovered projects use `groupId: null`, so the Renderer synthesizes them under Ungrouped.
- Existing projects remain in the catalog even when they currently have no Pi sessions. Existing custom group assignments and project/worktree IDs are preserved.
- A previously closed project with sessions is discovered again on the next startup and re-added under Ungrouped.
- Sync does not change `activeWorktreeId`; startup never selects an imported project.
- Missing, non-directory, or otherwise invalid session working directories are skipped without blocking startup or valid imports.
- Discovery failure does not block startup or alter the existing catalog. A successful merge is persisted atomically only when it changes catalog data.
- No session transcript is persisted in ProjectCatalog, and no new Renderer or IPC capability is introduced.

## Plan

1. Add ProjectService tests for repeated startup discovery, canonical/Git-root deduplication, Ungrouped assignment, group and ID preservation, recency merging, invalid-path skipping, no active-selection changes, and discovery failure.
2. Extend `ProjectService.load` with an optional lazy session-project discovery callback that runs after loading or migrating the catalog.
3. Resolve and deduplicate candidates, incrementally merge them into a cloned catalog, and save through the existing atomic persistence helper only when changed.
4. Pass a callback from `AppState.create` that maps `SessionManager.listAll()` metadata to candidate paths and timestamps.
5. Run focused Electron tests and the full `pnpm check` gate, then submit a dedicated PR.

## Verification

- Red: repeated-load tests failed against the first-launch-only implementation because existing catalogs skipped discovery and closed projects were not restored.
- Focused: `pnpm exec vitest run electron/domains/projects/projects.test.ts` passed 19 tests, including repeated sync, metadata preservation, closed-project rediscovery, failure retention, and corrupt-state recovery.
- Full gate: `pnpm check` passed with 72 Vitest files / 505 tests and 18 release tests.
