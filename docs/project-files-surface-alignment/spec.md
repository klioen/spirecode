# Spec: Align Projects overlays with Files

## Dialogs

- Worktree create, rename, and delete dialogs match the Files confirmation dialog's width, border, radius, background, shadow, title typography, and compact spacing.
- Form controls and action buttons continue to expose clear focus, primary, destructive, disabled, and pending states.

## Menus

- Project actions, worktree actions, and the origin-branch option list match the Files context menu's popover surface, border, radius, shadow, minimum row height, typography, and neutral hover state.
- Destructive actions remain visually distinct.
- Existing menu roles, listbox roles, keyboard behavior, and action semantics remain unchanged.

## Acceptance

- Projects and Files overlays use the same semantic surface and interaction tokens.
- Existing Projects and Files tests pass.
- Formatting, lint, type checking, and all repository tests pass.
