# Project session selection

## Intent

Make the Projects rail reflect the Chat session that is actually displayed in the editor, so users can distinguish it from other saved sessions in both directory projects and Git worktrees.

## Spec

- A session row is current only when its resource ID matches the owning worktree editor view's `activeTabId` and that worktree is the globally selected worktree.
- The current row uses the existing `interactive-selected` visual language and exposes `aria-current="page"`; all other rows omit `aria-current`.
- Opening or activating another session updates the marker immediately. Activating a file, terminal, diff, or another worktree removes the stale marker.
- Session loading, ordering, navigation race protection, rename, delete, menus, and empty/error states remain unchanged.

## Plan

1. Pass the selected-worktree fact from `ProjectRail` to each directory/Git `ProjectSessionList`.
2. Subscribe each rendered session list to its worktree's editor `activeTabId`, and derive the current row from the canonical Chat resource ID.
3. Add selected-row styling using existing theme tokens while retaining hover, focus, and disabled behavior.
4. Extend Project rail behavior and CSS tests for initial/current semantics, session/resource/worktree switching, and both project kinds; run focused tests and `pnpm check`.

Risk: Standard, because this is a localized, reversible Renderer behavior change with accessibility semantics and no backend, persistence, IPC, or public API changes.
