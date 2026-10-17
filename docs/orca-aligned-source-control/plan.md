# Plan: Orca-aligned Source Control

## Phase 1: Rich read-only interaction

1. Add a projection layer for conflicts, staged, unstaged, and untracked sections.
2. Add filtering, collapsible section headers, and an overflow view-mode menu without reintroducing manual refresh.
3. Render status-specific decoration, parent/original paths, numstat, active Diff state, and correct ARIA structure.
4. Add focused tests for projection, filtering, grouping, collapse, keyboard navigation, and status display.

This phase is independently usable as a richer diff browser.

## Phase 2: Safe Git mutations

1. Add narrow command contracts, IPC argument validation, bindings, and GitService methods for stage, unstage, discard, and commit.
2. Extend backend tests first for normal operation, rename, path attacks, symlink escape, untracked deletion, Git failures, and per-worktree serialization.
3. Add row and section actions with mutation state and post-success refresh.
4. Add a destructive discard dialog and coordinate dirty/in-flight editor saves before mutation.
5. Add per-worktree commit drafts, eligibility, keyboard submit, single-flight execution, and post-commit refresh.
6. Verify focused tests, the full quality gate, production build, and final diff.

This phase is independently usable without future remote, PR, history, AI, multi-select, or virtualization work.

## Rollback

The feature stores no migration state. Reverting the narrow commands, panel interactions, and styles restores the prior read-only viewer. Git mutations themselves are explicit user actions and are not automatically reversible; discard therefore remains confirmation-gated.
