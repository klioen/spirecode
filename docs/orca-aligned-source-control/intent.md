# Intent: Orca-aligned Source Control

## Problem

SpireCode Changes is a safe, automatically refreshed Git status and diff viewer, but it does not yet support the source-control interactions users expect beside an editor. Status detail already returned by Main is underused, group headers imply collapse without supporting it, and common stage, unstage, discard, and commit workflows require leaving the panel for a terminal.

## Outcome

Turn Changes into a compact Source Control panel inspired by Orca while preserving SpireCode's Project -> Worktree -> Editor model, keyboard-accessible tree, automatic refresh, and strict Renderer/Main boundary.

Success means users can filter and inspect accurate change metadata, stage or unstage individual/groups of files, safely discard eligible worktree changes, and commit staged changes without exposing paths, shell commands, or generic Git execution to Renderer.

## Non-goals

- Push, pull, sync, publish branch, or force push.
- Pull request or hosted review workflows.
- AI-generated commit messages or conflict repair.
- Git history or branch comparison.
- Multi-selection, virtualized rows, submodule expansion, or remote runtime routing.
- A manual refresh control; watcher-driven refresh remains authoritative.
