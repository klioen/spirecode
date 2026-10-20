# Directory Project Pi sessions

## Intent

Projects with several Pi conversations require opening Chat history elsewhere to find an existing session. Directory projects need a direct session list, and Git projects need session lists scoped to each worktree. Every rail session list should also expose a fast, recoverable delete action.

Risk: standard change. It changes user-visible Renderer behavior across Projects, Chat, and Editor state, but does not change persistence formats, IPC contracts, filesystem authority, or native packaging.

## Spec

- A directory project row has an expand/collapse chevron and `aria-expanded`, matching Git project affordances.
- Clicking a directory project selects its synthetic main workspace and toggles its session list.
- Git projects retain Project → worktree structure; every worktree row gains an independent session-list chevron without changing the existing workspace selection button.
- Expanding any session list loads sessions through the existing allowlisted `chat_session_list` API for that workspace.
- Sessions are ordered by most recent `updatedAt`, then `createdAt`; missing titles use the existing localized Untitled label.
- Loading, empty, and failure states render inside the expanded project without hiding project actions.
- Clicking a session first selects the owning workspace, then opens or activates the matching Chat tab through `editorStore.openChat`; a selection generation guard prevents late async responses from overriding newer navigation intent.
- Session rows do not show a persistent delete control. Right-clicking a row opens a compact menu with Delete; keyboard users can open the same menu with the Context Menu key or Shift+F10. Delete calls the existing `chat_session_delete` boundary, which moves the session file to the operating-system Trash; pending rows cannot be opened or deleted twice.
- Successful deletion removes the row, closes its Editor Chat tab, and detaches it from `chatRuntime`. Failure keeps the session visible and shows an inline alert.
- Session listing does not persist transcripts or session bodies in Zustand and does not introduce a new Main/Renderer capability.

Out of scope: creating sessions from the Projects rail, transcript previews, permanent deletion that bypasses Trash, bulk deletion, or persisting expanded state across restarts.

## Plan

1. Extend ProjectRail regression tests for directory and Git-worktree session expansion, reverse-order selection completion, fast deletion success, and deletion failure.
2. Generalize the session-list child component to use `hostChatApi.list/delete`, localized labels, and editor/project/runtime stores.
3. Keep directory select-and-toggle behavior; add independent Git worktree session chevrons so existing worktree selection semantics remain intact.
4. Add compact session-row/context-menu styles and missing localized copy.
5. Run focused tests and `pnpm check`, then update the open directory-project-sessions PR.

## Verification result

- Red: the new ProjectRail tests failed because directory projects exposed only the prior `Open {name}` action and rendered no sessions.
- Green: `pnpm exec vitest run src/features/projects/ProjectRail.test.tsx` passed with 16 tests, including Git worktree lists, direct Trash deletion, duplicate-delete prevention, and failure retention.
- Full gate: `pnpm check` passed with 72 Vitest files / 501 tests and 18 release tests.
