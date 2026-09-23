# Plan: Upgrade Pi SDK to 0.87.1 (from docs/upgrade-pi-sdk-0-87-1/spec.md 2026-09-22)

## Files that change

- `package.json` — update the exact Pi SDK dependency pin.
- `pnpm-lock.yaml` — regenerate Pi SDK and transitive dependency resolutions.
- `docs/upgrade-pi-sdk-0-87-1/intent.md` — record the approved upgrade outcome.
- `docs/upgrade-pi-sdk-0-87-1/spec.md` — document compatibility requirements and design.
- `docs/upgrade-pi-sdk-0-87-1/plan.md` — record execution order, risks, and proof.
- Pi integration source files only if compilation or tests reveal a required compatibility migration.

## Order of work

1. Create an isolated upgrade branch from current `main`.
2. Add the intent, spec, and implementation plan for this dependency upgrade.
3. Use pnpm to install exact `@earendil-works/pi-coding-agent@0.87.1`, updating both manifest and lockfile.
4. Inspect the resulting diff and installed Pi package versions for unexpected dependency movement.
5. Run focused type checking first to catch SDK API incompatibilities quickly.
6. Run the complete `pnpm check` validation gate and resolve implementation compatibility issues without weakening tests.
7. Review the final diff for credentials, unrelated changes, and exact dependency pins.
8. Commit, push the branch, and open a GitHub pull request with upgrade risks and validation evidence.

## Risks

- The most dangerous step is resolving the new SDK tree because 0.86 and 0.87 contain breaking TypeScript and runtime changes around sessions, extension events, providers, and tool payloads.
- Transitive dependency changes may affect packaging, native helpers, license policy, or Electron runtime startup even if TypeScript compiles.
- User-installed extensions cannot all be exhaustively tested in this repository; the upgrade relies on upstream compatibility plus bundled-extension and adapter coverage.
- A broader refactor is intentionally rejected: keeping the change dependency-focused makes any regression attributable and easy to revert.
- A floating semver range is rejected because this repository requires pinned npm dependencies and deterministic lockfiles.

## Proof

- `node -p "require('./node_modules/@earendil-works/pi-coding-agent/package.json').version"` prints `0.87.1`.
- `pnpm typecheck` exits 0.
- `pnpm check` exits 0, covering formatting, brand, localization, secrets, licenses, lint, type checking, Renderer/Electron tests, and release tests.
- `git diff --check` exits 0 and the final diff contains only the planned dependency and SDLC artifacts unless a documented SDK compatibility fix is required.
