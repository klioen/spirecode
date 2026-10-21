# New task project search

## Intent

Projects can become numerous, making the native Project select in the New task form slow to scan. Add direct project-name filtering without changing task creation semantics.

## Spec

- Replace the New task Project select with an accessible searchable dropdown.
- Opening the dropdown focuses a search field.
- Search is case-insensitive and ignores surrounding whitespace.
- Selecting a filtered project keeps the existing workspace reset and directory-project behavior.
- Editing an existing task continues to prevent changing its project.
- Show a localized empty state when no project matches.

## Plan

1. Add a renderer regression test for opening, filtering, and selecting projects.
2. Implement the searchable project picker inside `TaskForm` and retain existing selection side effects.
3. Add localized labels and focused styling consistent with the task form.
4. Run the focused test and repository verification.

Risk: standard, because this is a localized user-visible form behavior change with no IPC, persistence, or security-boundary changes.
