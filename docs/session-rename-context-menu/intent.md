# Intent: Session rename and consistent context menus

Status: accepted.

## Problem

Pi sessions appear in two navigation surfaces: nested under projects/worktrees in the Projects rail and in the Chat History popover. Neither surface can rename a session. Their destructive interaction is also inconsistent: Projects sessions use a compact right-click menu, while Chat History exposes a delete icon on row hover.

This makes session management harder to discover consistently and adds persistent hover chrome to the denser Chat History list.

## Outcome

- Sessions can be renamed from both Projects and Chat History.
- Both surfaces use the same right-click/keyboard context-menu pattern with Rename and Delete actions.
- Chat History no longer reveals a delete icon on hover.
- A successful rename updates every visible copy of the title, including an already-open Chat tab, and persists through Pi's native session metadata.

## Scope

Included:

- Pi session metadata mutation through Main.
- One narrow rename IPC command and Renderer API method.
- Shared rename dialog, context-menu interactions, focus restoration, localized copy, state synchronization, and tests.
- Existing Trash-based session deletion; Chat History adopts the Projects quick-delete menu behavior.

Excluded:

- Renaming project/worktree entities.
- Renaming or moving the JSONL session file.
- Bulk session operations, nested menus, tags, or cross-window live synchronization.

## Risk

High risk because rename adds a cross-process contract and appends durable metadata to a Pi session file. The user explicitly requested this behavior before implementation. The mutation remains narrow, ownership/path validated, append-only through the Pi SDK, and reversible by renaming again.
