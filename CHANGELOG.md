# Changelog

All notable user-visible changes to SpireCode will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and formal releases are expected to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) where practical.

## [Unreleased]

### Added

- Public contribution, security, support, conduct, issue, and pull request guidance.
- Cross-platform development packaging for macOS arm64, Windows x64, and Linux x64.
- Projects, managed worktrees, file editing, Git changes, terminals, multi-tab pi Agent chat, settings, and support for user-installed standard Pi resources.

### Removed

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
