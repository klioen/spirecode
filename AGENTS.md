# Pi App Engineering Guide

## Architecture
- Tauri 2 desktop application: React runs in the system WebView; Rust owns projects, filesystem access, Git, PTYs, and durable state.
- Frontend feature modules live under `src/features/`; backend domain modules live under `src-tauri/src/`.
- WebView code never receives generic filesystem or shell permissions. Every path is `projectId + relativePath` and is validated in Rust.
- Full design and scope: `docs/pi-app/{intent,spec,plan}.md`.

## Commands
- `pnpm check` — formatting, lint, typecheck, frontend tests, Rust fmt/clippy/tests. Healthy result: every command exits 0.
- `pnpm tauri dev` — run the macOS development app.
- `pnpm bundle` — build, ad-hoc sign, package, and smoke-test the release `.app` and `.dmg`. Healthy result: both app and DMG smoke checks pass.

## Conventions
- Keep npm and Cargo dependencies pinned; commit both lockfiles.
- Zustand stores hold view metadata, not file bodies, diffs, or terminal output.
- Git uses argument arrays, never shell command strings.
- No ignored errors, lint suppressions, or broad Tauri capabilities.
- Add repeated pitfalls here, not in source comments.
