# Spec: Session rename and consistent context menus

Status: accepted.

## Domain behavior

- Add `chat_session_rename(worktreeId, sessionId, title) -> ChatSessionSummary`.
- Main trims the title and rejects empty titles, control characters, and titles longer than 200 Unicode code points.
- Main resolves the supplied worktree ID to its canonical root and verifies that the session belongs to that root.
- For a loaded session, rename uses the existing Pi `AgentSession.setSessionName()` path and updates the in-memory record.
- For an unloaded session, Main resolves exactly one SDK session entry, validates its canonical file is contained by the canonical Pi session root, opens only its `SessionManager`, and calls `appendSessionInfo()`; it must not initialize models, extensions, skills, or an Agent session merely to rename metadata.
- Rename appends Pi's native `session_info` metadata. It never renames the JSONL file and never stores session titles in `ProjectCatalog`.
- The command returns the authoritative normalized summary. A failed rename leaves Renderer state and the session title unchanged.
- Lifecycle serialization prevents rename from racing attach/delete for the same session.

## Projects session UX

- Right-clicking a session row opens a menu with Rename and Delete.
- `Context Menu` and `Shift+F10` open the same menu for keyboard users.
- Rename opens a modal with the existing title selected, Cancel and Rename actions, Enter submission, pending protection, and inline error text.
- On success, the Projects list and an already-open Chat tab adopt the returned title.
- On cancel, menu Escape, or a completed action, focus returns to the originating session row when it still exists; rename failures stay in the dialog for correction or retry.
- Delete retains the current quick Trash behavior and pending/error semantics.

## Chat History UX

- Remove the hover/focus delete icon entirely.
- Right-click or keyboard context-menu invocation opens the same Rename/Delete menu pattern.
- Rename uses the shared dialog and updates the list plus any open Chat tab.
- Delete starts the existing Trash mutation directly from the context menu, matching Projects. There is no second confirmation dialog; right-click plus menu selection is the two-step guard, and the system Trash remains the recovery path.
- Pending rename/delete blocks duplicate row opens and conflicting actions. Failures leave the row visible and show an inline error.
- Search and date grouping recompute from the authoritative renamed summary. Rename does not close Chat History.

## Accessibility and localization

- Menus use `role=menu`/`role=menuitem` and move focus to the first item when opened.
- Escape closes menus/dialogs and restores row focus.
- Dialog fields have visible labels, descriptions, validation state, and localized English/Simplified Chinese copy.
- Pointer opening must suppress the browser context menu without making normal click navigation unavailable.

## Compatibility

- Existing list/create/attach/delete contracts and persisted transcripts remain readable.
- Older Renderers do not call the additive rename command; older Main versions reject it through the existing allowlist rather than misinterpreting it.
