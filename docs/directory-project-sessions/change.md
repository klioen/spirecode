# Directory Project Pi sessions

## Intent

Non-Git directory projects currently behave as one-click workspace rows and cannot expand in the Projects rail. Users with several Pi conversations in a directory project must open Chat history elsewhere to find an existing session. Directory projects should support the same compact drill-down pattern as Git projects, but their children should be Pi session titles rather than Git worktrees.

Risk: standard change. It changes user-visible Renderer behavior across Projects, Chat, and Editor state, but does not change persistence formats, IPC contracts, filesystem authority, or native packaging.

## Spec

- A directory project row has an expand/collapse chevron and `aria-expanded`, matching Git project affordances.
- Clicking a directory project selects its synthetic main workspace and toggles its session list.
- Expanding a directory project loads its sessions through the existing allowlisted `chat_session_list` API for the synthetic workspace.
- Sessions are ordered by most recent `updatedAt`, then `createdAt`; missing titles use the existing localized Untitled label.
- Loading, empty, and failure states render inside the expanded project without hiding project actions.
- Clicking a session first selects the owning workspace, then opens or activates the matching Chat tab through `editorStore.openChat`; a selection generation guard prevents late async responses from overriding newer navigation intent.
- Session listing does not persist transcripts or session bodies in Zustand and does not introduce a new Main/Renderer capability.
- Git projects keep their existing Project → worktree behavior.

Out of scope: creating/deleting sessions from the Projects rail, showing transcript previews, listing sessions below Git worktrees, or persisting expanded state across restarts.

## Plan

1. Add a ProjectRail regression test for directory expansion, session-title loading, empty/error fallback, opening a selected session, and reverse-order selection completion.
2. Add a focused directory-session child component that uses `hostChatApi.list`, localized labels, and editor/project stores.
3. Change directory project click behavior from direct selection to select-and-toggle; retain existing project menus and active session indicator.
4. Add compact session-row styles and any missing localized copy.
5. Run focused tests and `pnpm check`, then push the new commit to the existing project-groups PR.

## Verification result

- Red: the new ProjectRail tests failed because directory projects exposed only the prior `Open {name}` action and rendered no sessions.
- Green: `pnpm exec vitest run src/features/projects/ProjectRail.test.tsx` passed with 14 tests.
- Full gate: `pnpm check` passed with 72 Vitest files / 499 tests and 18 release tests.
