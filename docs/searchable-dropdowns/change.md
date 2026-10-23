# Searchable dropdowns

## Intent

Make selection controls practical when their option catalogs grow by giving every dropdown a consistent, keyboard-accessible search experience. This includes project, branch, worktree, model, settings, and other value selectors; action/context menus are not value dropdowns and are out of scope.

Risk: standard. This is a cross-feature, user-visible Renderer change, but it does not change IPC, persistence, security boundaries, or dependencies.

## Spec

- Replace native value-selection dropdowns with one shared searchable selector.
- Opening a selector exposes a focused search field and filters options case-insensitively by label, group, and optional keywords.
- Preserve option grouping, disabled states, current values, and existing change callbacks.
- Support pointer and keyboard selection (arrows, Enter, Escape) with combobox/listbox semantics.
- Show localized search and empty-result text.
- Existing bespoke searchable project/branch switchers remain searchable; migrate the task project picker to the shared behavior so selection controls are consistent.
- Do not add search to action/context menus.

## Plan

1. Add regression coverage for filtering, grouped options, keyboard selection, disabled behavior, and empty results.
2. Implement a reusable `SearchableSelect` component and shared styling/localization.
3. Migrate all native `<select>` value controls and the task project picker.
4. Update feature tests to interact through the searchable listbox.
5. Run focused tests, then `pnpm check`.
