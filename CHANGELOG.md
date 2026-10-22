# Changelog

All notable user-visible changes to SpireCode will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and formal releases are expected to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) where practical.

## [Unreleased]

### Added

- Persistent Tasks above Projects, with managed or existing workspaces, automatic Pi Agent execution and recovery, explicit result reports, review notifications, editable backlog tasks, Draft PR/MR links, isolated AI-assisted task-draft optimization, and safe cleanup controls for completed managed workspaces.
- Drag-and-drop project organization in the Projects rail, including keyboard-accessible handles, cross-group moves, same-group ordering, empty/collapsed group targets, and ordering that persists across restarts.
- Persistent custom project groups in the Projects rail, including create, rename, delete, move-to-group, and Ungrouped workflows; every startup syncs Pi session working directories into Ungrouped, and directory projects plus Git worktrees can expand to show, open, and move sessions to Trash.
- Pi Extension Marketplace in Settings for browsing community catalog packages and safely installing, updating, or uninstalling user-scoped npm extensions through Pi's package manager.
- Complete Files CRUD with inline file/folder creation and rename, duplication, cut/copy/paste moves, system Trash deletion, file-manager reveal, active-file reveal, and secure worktree-relative Main-process operations.
- Public contribution, security, support, conduct, issue, and pull request guidance.
- Cross-platform development packaging for macOS arm64, Windows x64, and Linux x64.
- Projects, managed worktrees, file editing, Git changes, terminals, multi-tab pi Agent chat, settings, and support for user-installed standard Pi resources.

### Changed

- Kept Task workspaces leased until their Pi Agent session settles, reused the resolved workspace across retries and the idle session across requested changes, and attributed shared-session token usage per Run.
- Added persistent Pi session renaming from Projects and Chat History, and aligned both surfaces on accessible context menus for Rename and direct Move to Trash actions.
- Simplified Chat transcripts to show final answers directly while folding thinking, tool calls, todos, and intermediate updates into a Codex-style `Working for…` / `Worked for…` summary.
- Made Installed the first and default Extensions tab, loading the remote Marketplace only when opened.
- Added safe `Remove from Pi` actions for user-configured local extension packages; this removes only their settings reference and never deletes local source files.
- Moved Projects and Settings controls into the Projects rail and redesigned Settings as an Orca-inspired full-window page with grouped navigation and search.
- Upgraded Git Changes into an Orca-inspired Source Control panel with filtering, collapsible conflict-aware groups, rich status metadata, safe stage/unstage/discard actions, and per-worktree commit drafts.
- Refined the workbench with quieter neutral chrome, a narrower Chat reading column, accessible icon tooltips, and a System appearance option that follows the operating system theme.

### Fixed

- Fixed Task runs failing before prompt delivery when Pi has not yet created the new session's JSONL file, including restart recovery for that pre-prompt window.
- Stabilized native recursive watcher startup so immediate filesystem changes are not missed while a project opens.
- Corrected Projects tree indentation and stopped Pi session discovery from duplicating SpireCode-managed worktrees as standalone Ungrouped projects.
- Fixed `Remove from Pi` for relative local package sources by resolving the configured package path before asking Pi's PackageManager to remove the settings reference.
- Restored Marketplace extension installation for desktop-launched apps by locating the user's Node.js/npm runtime before invoking Pi's package manager.
- Widened Chat history so long session titles have more room in the popover row.

### Removed

- Removed separate Task acceptance criteria from creation, editing, execution reports, UI, and persistent storage; the schema migration also deletes legacy criterion data while preserving Task summaries and test results.
- **Breaking:** SpireCode no longer depends on or bundles packages from `github:klioen/pi-extensions`. Web access, subagents, memory, todo, plan, goal, and SDLC resources must now be installed and declared by users through standard Pi settings.
- Removed the upstream `pi-extensions` redistribution-license blocker because SpireCode no longer downloads, stages, or distributes that repository's code. Production dependency and notice checks still apply to resources that SpireCode actually ships.

### Security

- Documented the local execution and extension trust boundaries.

### Known release blockers

- No formal GitHub Release has been published.
- macOS and Windows artifacts are not yet formally signed; macOS artifacts are not notarized or stapled.
- Although the root source license is Apache-2.0, formal binary publication remains blocked until the legal owner approves the production dependency inventory and final Electron/Chromium notices.
- The tag-only release pipeline, checksums, SBOM, and provenance gates are implemented; a release candidate still requires protected signing environments, valid Apple/Windows credentials, and target-platform CI verification.

## Release policy

There are no tagged releases yet. Until the formal release gate is complete, version numbers, CI artifacts, and local package outputs are development indicators rather than supported public releases.

For each future release, maintainers should move relevant entries from **Unreleased** into a dated version section and publish matching GitHub release notes. Release notes must identify supported platforms, known limitations, security-impacting changes, migration steps, and whether artifacts passed the applicable signing and verification gates. Unsigned development artifacts must not be described as formal releases.

[Unreleased]: https://github.com/klioen/spirecode/compare/HEAD...HEAD
