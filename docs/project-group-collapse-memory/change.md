# Project group collapse memory

## Intent

Project groups currently start expanded on every Renderer launch, so a user must repeatedly restore the rail layout they prefer. Groups should start collapsed when they have no saved preference and should otherwise retain the expanded/collapsed state from the previous app session.

## Spec

- Persist the set of expanded project-group section IDs in Renderer-local storage; project catalog data and Main IPC contracts remain unchanged.
- A group ID absent from persisted state is collapsed by default, including newly created groups and the synthetic Ungrouped section.
- Toggling a group updates the persisted state immediately, and a newly mounted `ProjectRail` restores it.
- Invalid or unavailable local storage falls back safely to all groups collapsed.

## Plan

1. Add focused persistence helpers for loading and saving expanded group IDs.
2. Initialize and update `ProjectRail` group expansion state through those helpers.
3. Update the ProjectRail regression test to prove default collapse and restoration across remounts, then run focused and repository verification.

Risk: standard, because this changes user-visible Renderer behavior and adds local view-state persistence, but does not alter durable project data, IPC, filesystem access, or security boundaries.
