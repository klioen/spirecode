# Intent: Upgrade Pi SDK to 0.87.1
Author: SpireCode maintainer. Status: approved.

## Problem

SpireCode pins `@earendil-works/pi-coding-agent` at 0.85.1 while npm and the locally installed Pi toolchain have advanced to 0.87.1. The application therefore misses the latest SDK fixes, provider updates, and session-context behavior.

## Proposed outcome

Pin SpireCode to `@earendil-works/pi-coding-agent@0.87.1`, regenerate the pnpm lockfile, install the resolved dependencies, and prove compatibility with the repository's complete validation gate.

## Affected users and systems

- SpireCode Electron Main chat, model catalog, settings, and extension integrations.
- Packaging and production dependency/license validation.
- Developers installing dependencies from `pnpm-lock.yaml`.

## Constraints

- Keep the dependency exactly pinned.
- Commit `pnpm-lock.yaml`.
- Do not change Renderer security boundaries or expose Pi SDK access outside Electron Main.
- Preserve current Chat/session behavior unless an SDK compatibility fix is required.
- Run `pnpm check` before opening the pull request.

## Open questions

None.
