# Intent

Allow users to copy selected text from Chat conversation content and Task detail content through a localized right-click menu, without changing context menus elsewhere or weakening the Electron renderer boundary.

Risk: standard change because it adds user-visible behavior across shared UI, Chat, Task, localization, and tests, but it does not add IPC, preload capabilities, persistence, or privileged Main-process access.

# Spec

- A non-whitespace DOM selection fully contained in the Chat transcript or Task detail opens a one-item context menu at the right-click location.
- The item is labeled `Copy` in English and `复制` in Simplified Chinese.
- Activating the item writes the exact captured selection, including meaningful surrounding whitespace, through the renderer's existing scoped Clipboard API usage.
- Empty, whitespace-only, out-of-region, or partially out-of-region selections do not open the added menu and do not have their context-menu event consumed.
- Chat history and other existing custom context menus remain outside the new copy regions.
- Existing selection and keyboard-copy behavior remains unchanged; no new Electron IPC or preload capability is introduced.

# Plan

1. Add a reusable selection-copy region that validates selection containment, captures exact text, positions and dismisses a localized menu, and writes the captured value to the clipboard.
2. Apply it only to the Chat transcript and Task detail article while preserving their existing DOM element types and classes.
3. Add English and Chinese localization plus themed menu styling.
4. Add focused tests for selection validation, copy behavior, localization, region integration, and Chat history menu isolation.
5. Run focused tests, `pnpm typecheck`, `pnpm lint`, `pnpm i18n:check`, and `pnpm test`; record manual Electron verification status separately.
