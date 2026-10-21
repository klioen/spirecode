# Plan: Session rename and consistent context menus

Status: implemented.

## Implementation

1. Add red tests for the rename command allowlist/argument whitelist, Main title validation, loaded and unloaded Pi rename paths, ownership/path containment, authoritative summary return, and failure preservation.
2. Extend the Pi adapter with the minimum metadata operations: loaded `setSessionName` and unloaded `SessionManager.appendSessionInfo`, without loading agent resources.
3. Add the serialized `ChatService.rename` operation and narrow IPC/binding/API plumbing.
4. Add an editor-store operation that updates and persists titles for already-open Chat tabs.
5. Add a shared `SessionRenameDialog` with controlled pending/error behavior and localized copy.
6. Extend `ProjectSessionList` context menus with Rename and synchronize successful results to the list and editor store.
7. Replace Chat History's hover delete button and confirmation dialog with a keyboard-accessible Rename/Delete context menu; preserve Trash deletion, pending/error handling, popover stability, and focus restoration.
8. Update focused tests, styles, localization, changelog, and this plan with implementation deviations.
9. Run focused red/green tests, `pnpm check`, macOS bundle verification, and packaged UI interaction smoke. Commit, push, open a focused PR, then atomically install the verified app.

## Verification

```text
pnpm exec vitest run \
  electron/contracts.test.ts \
  electron/ipc.test.ts \
  electron/domains/chat/piAdapter.test.ts \
  electron/domains/chat/chatService.test.ts \
  src/features/chat/SessionRenameDialog.test.tsx \
  src/features/chat/ChatHistory.test.tsx \
  src/features/editor/editorStore.test.ts \
  src/features/editor/EditorPane.test.tsx \
  src/features/projects/ProjectRail.test.tsx
pnpm check
pnpm bundle
```

Verification completed on 2026-10-21:

- Focused backend, IPC, store, dialog, Projects, and Chat History suites passed.
- `pnpm check`: formatting, brand, localization, secrets, licenses, lint, both TypeScript projects, 75 Vitest files with 525 tests, and 18 release tests passed.
- `pnpm bundle`: macOS arm64 build, strict ad-hoc signature verification, packaged app smoke, DMG creation, and mounted-DMG smoke passed.
- Packaged CDP smoke used a disposable real Pi JSONL session. Projects and Chat History both exposed Rename/Delete context menus; the rename input selected the existing title; both renames appended authoritative `session_info` entries; the Projects row, Chat History row, and open tab all adopted the returned title; Chat History had no hover delete element and stayed open; direct menu deletion removed the row and open tab without a confirmation dialog.
- Packaged `app.asar` SHA-256: `ed4df535f5e365a373d13f86acd1441d404e53b10c8b10dad8caa24fdba747d4`.
- DMG SHA-256: `5c973397dcf8606034a09507903b2bd2e0ed544e647a64350da0d3e702b6eaef`.

## Rollback

Revert the additive IPC/UI commit. Existing `session_info` entries remain valid Pi metadata; reverting does not require a data migration, and a later rename can replace the displayed title.
