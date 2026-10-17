# Orca-inspired P0 UI refinement

## Intent

Make SpireCode's shell quieter and more content-first while preserving its existing Project → Worktree → Chat/Editor/Changes product model and green brand identity. Improve theme behavior, chat readability, and discoverability of icon-only controls without adopting Orca's feature density or changing desktop security boundaries.

Risk classification: standard change because it crosses theme, workbench, chat, settings, and shared UI components and changes visible behavior, but it does not change IPC contracts, persisted data schemas, filesystem access, or command execution.

## Spec

- Use neutral light/dark chrome surfaces; reserve brand green for focus, primary action, running state, and the logo.
- Preserve semantic danger, warning, success, Git, Monaco, and terminal colors with accessible contrast.
- Reduce chat reading width and establish a compact prose/metadata/code type scale without adding user-facing appearance knobs.
- Restore `system` as a persisted theme preference in Settings. The top-bar theme button remains a two-state light/dark shortcut and never exposes a third computer icon.
- Follow live `prefers-color-scheme` changes only while the stored mode is `system`.
- Suppress transitions during theme swaps so surfaces change atomically.
- Add a reusable, keyboard-visible tooltip primitive and apply it to the primary icon-only workbench controls. Existing accessible names remain intact.
- Keep Project/Worktree breadcrumbs, panel arrangement, chat message chrome, and Renderer/Main security boundaries unchanged.

## Plan

1. Add regression tests for system theme persistence/resolution, two-state top-bar behavior under system mode, the Settings system option, and tooltip accessibility.
2. Implement system-aware theme state and localized Settings copy while keeping the top-bar shortcut explicit light/dark.
3. Add a zero-dependency tooltip primitive and use it for top-bar and right-panel icon actions.
4. Replace colored chrome tokens with neutral surfaces, introduce semantic interaction aliases, normalize focus/hover/selected/elevation, and tune chat width/type scale.
5. Run targeted tests, formatting, lint, typecheck, the full `pnpm check` gate, and inspect the final diff for scope and token completeness.
6. If rendered-app validation is available without disrupting the desktop, verify light, dark, system-follow, tooltip focus, and representative Chat/Editor/Changes screens.
