# Files CRUD Plan

## 1. Contract and domain tests

- Extend generated-facing TypeScript types, command allowlists, argument validation, bindings, and IPC dispatch.
- Add failing filesystem-domain tests for create, rename, move, recursive copy, Trash injection, conflicts, root rejection, .git/traversal, symlink-parent escape, and directory-into-descendant rejection.
- Implement operations in `FilesystemService` using exclusive creation and existing path guards; inject Trash from `AppState`.

Proof: filesystem and IPC contract tests pass, including platform-conditional symlink cases.

## 2. Store consistency tests

- Add failing tests for directory-targeted invalidation, collapse-all/expansion helpers, editor path remapping, affected dirty-tab inspection, and tab removal after Trash.
- Implement focused FileTree and editor-store mutation APIs, including persisted tab IDs and draft remapping support.

Proof: file-tree store, filesystem event, and editor store tests pass.

## 3. Files interactions

- Add toolbar, menu, inline input, operation error, clipboard state, and Trash confirmation to Files.
- Wire commands so state changes occur only after Main success.
- Add active-file ancestor expansion and scroll-to-row behavior.
- Add localized strings and neutral semantic styling consistent with the current workbench.

Proof: component tests exercise keyboard create/rename cancellation and submission, CRUD command arguments, conflict errors, confirmation, clipboard move/copy, and editor synchronization.

## 4. Refresh behavior and integration

- Refresh only affected cached directories from non-truncated watcher payloads; preserve full invalidation for truncated payloads.
- Reuse existing Git invalidation and editor reload behavior without broadening Renderer authority.
- Update Changelog.

Proof: watcher event tests cover exact, ancestor, and truncated invalidation.

## 5. Verification and review

- Run targeted red-green suites during each step.
- Run formatting, localization/brand/security guards, lint, both TypeScript projects, all Renderer/Electron tests, release tests, and production build through `pnpm check` and `pnpm build`.
- Inspect the final diff for raw paths, shell strings, unsafe overwrite, permanent-delete fallback, unlocalized copy, and contract drift.

## Delivery note

This branch is stacked on the current Orca-inspired P0 branch because it reuses the shared Tooltip and visual tokens. It should be merged only after its base change or rebased onto main.
