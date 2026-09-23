# Intent: Reduce startup, Chat, and Project loading latency
Author: SpireCode maintainer. Status: approved.

## Problem

SpireCode feels blocked during cold startup, when opening a Chat conversation, and when adding a Project. Read-only diagnosis found that expensive watcher, Git, Pi resource, extension, session snapshot, and durable persistence work is awaited on user-visible critical paths.

On the current development machine, startup restores 17 Projects and 23 Worktrees. The startup path performs one serial Git lookup and watcher initialization per Worktree before loading the Renderer. Opening a cold Chat session initializes Pi resources and extensions before returning its snapshot. Adding a Project waits for watcher initialization before returning to the Renderer.

## Proposed outcome

1. Show the application without waiting for all persisted Worktree watchers.
2. Return newly added Projects after durable catalog registration while initializing their watchers in the background.
3. Avoid redundant Chat session scans and repeated identical resource discovery where lifecycle-safe.
4. Bound Chat snapshots in Electron Main before IPC transfer.
5. Add privacy-safe phase timing logs so startup, Project open, and Chat attach improvements are measurable.

## Affected users and systems

- All users starting SpireCode with persisted Projects and Worktrees.
- Users adding local Git repositories.
- Users opening restored or historical Chat sessions.
- Electron Main watcher, Git, Chat, settings/resource, diagnostics, and IPC domains.

## Constraints

- Preserve canonical root validation and watcher coverage.
- Project catalog durability must complete before Project open reports success.
- Background watcher failures must not become unhandled rejections or remove Projects.
- Do not share session-bound Pi state across conversations unless the SDK explicitly permits it.
- Keep Renderer sandbox and narrow IPC contracts unchanged unless a bounded DTO field is required.
- Performance logs must not include paths, prompts, credentials, message content, or extension configuration.

## Open questions

None.
