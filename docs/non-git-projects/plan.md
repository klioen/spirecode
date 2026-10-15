# Plan

## 1. Establish red tests for the Project schema and directory semantics

Update `electron/domains/projects/projects.test.ts` before production code:

- Git open returns `kind: "git"` and preserves subdirectory-to-repository-root behavior.
- Existing empty and non-empty ordinary directories open as `kind: "directory"` with one primary workspace.
- canonical aliases deduplicate; repeated opens preserve IDs.
- ordinary files and missing/inaccessible paths fail without catalog mutation.
- a directory Project upgraded by a later `git init` preserves IDs.
- version 2 state migrates to version 3 as Git.
- malformed version 3 kind/ownership data is rejected.
- Renderer exposes no New Project or directory-creation action.

## 2. Implement durable Project capabilities

Change `electron/domains/projects/index.ts`:

- add `ProjectKind` and `ProjectSummary.kind`;
- bump `PROJECT_STATE_VERSION` to 3 and add a pure v2 migration;
- separate canonical selected-directory validation from Git repository discovery;
- add directory-root registration and existing-directory-to-Git upgrade;
- add Main-owned capability lookup/assertion helpers by Project/workspace ID;
- preserve atomic catalog writes and opaque workspace IDs.

Update the shared Renderer DTO in `src/bindings/generated.ts` and affected fixtures.

## 3. Make watcher behavior capability-aware

First add tests in `electron/domains/filesystem/watcher.test.ts` proving that a directory watcher emits filesystem events but never Git events.

Then change:

- `electron/domains/filesystem/watcher.ts` to accept optional Git metadata and gate Git invalidation;
- `electron/appState.ts` startup/open paths to register filesystem-only watchers for directory Projects and Git-aware watchers for Git Projects.

## 4. Enforce Main-side Git and Worktree gates

Add regression tests to:

- `electron/domains/git/git.test.ts`;
- `electron/domains/worktrees/worktrees.test.ts`;
- relevant IPC tests.

Then:

- give `GitService` a Main-derived capability resolver and reject directory workspaces before Git execution;
- make `WorktreeService` reject directory Projects before origin lookup, validation, managed-root creation, or Git mutation;
- retain select/list/reveal for the synthetic primary workspace.

## 5. Implement capability-aware Renderer UX

Update tests first, then production code:

- `src/features/projects/ProjectRail.test.tsx` / `ProjectRail.tsx`: Open Folder remains the only Project-add action; use a folder icon and direct selection for directory Projects; hide Worktree UI.
- `src/features/workbench/Workbench.test.tsx` / `Workbench.tsx`: no Git refresh, no Changes tab, and Files fallback for directory Projects.
- `src/features/workbench/BreadcrumbSwitcher.test.tsx` / `BreadcrumbSwitcher.tsx`: Project-only breadcrumb for directory Projects.
- `src/features/editor/editorStore.test.ts` and `EditorPane.test.tsx`: clear or ignore directory diff tabs without affecting file, terminal, or Chat tabs.
- `src/i18n/en.ts` and `src/i18n/zh-CN.ts`: neutral folder/open labels.

## 6. Prove retained non-Git capabilities

Add focused integration/regression coverage where missing:

- `electron/domains/filesystem/filesystem.test.ts`: list/read/write ordinary roots and preserve containment.
- `electron/domains/terminal/service.test.ts`: the ordinary directory is passed as PTY `cwd`.
- `electron/domains/chat/chatService.test.ts`: Chat adapter receives the ordinary directory and ownership isolation remains intact.
- `src/features/projects/projectsStore.test.ts`: directory primary workspace hydration, selection, and close fallback.

## 7. Verification

Run focused red-green suites during implementation, then:

```bash
pnpm test -- electron/domains/projects/projects.test.ts
pnpm test -- electron/domains/filesystem/watcher.test.ts
pnpm test -- electron/domains/git/git.test.ts
pnpm test -- electron/domains/worktrees/worktrees.test.ts
pnpm test -- electron/ipc.test.ts electron/contracts.test.ts
pnpm test -- src/features/projects/ProjectRail.test.tsx
pnpm test -- src/features/workbench/Workbench.test.tsx
pnpm test -- src/features/workbench/BreadcrumbSwitcher.test.tsx
pnpm test -- src/features/editor/EditorPane.test.tsx
pnpm check
```

Finally inspect `git diff --check`, the complete diff, schema migration behavior, and all new IPC fields. No implementation is complete until the full gate passes.
