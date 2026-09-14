# SpireCode Engineering Guide

## Architecture
- Electron desktop application: React runs in a sandboxed Renderer; Electron Main owns projects, filesystem access, Git, PTYs, pi Agent sessions, and durable state.
- Frontend feature modules live under `src/features/`; backend domain modules live under `electron/domains/`.
- Renderer code never receives Node, generic filesystem, shell, Electron IPC, or pi SDK permissions. Every path is `worktreeId + relativePath` and is validated in Main.
- Preload exposes only the allowlisted `window.spire.invoke/subscribe` bridge.
- Full design and scope: `docs/spirecode/{intent,spec,plan}.md`, `docs/pi-agent-chat/`, and `docs/electron-migration/`.

## Commands
- `pnpm check` — formatting, brand, lint, typecheck, and all Renderer/Electron tests. Healthy result: every command exits 0.
- `pnpm dev` — run Vite, Electron main watch, and the development app.
- `pnpm bundle` — build and package the Apple Silicon `.app` and `.dmg` under `release/`.

## Conventions
- Keep npm dependencies pinned and commit `pnpm-lock.yaml`.
- Zustand stores hold view metadata, not file bodies, diffs, terminal output, or Chat transcripts.
- Git uses argument arrays, never shell command strings.
- Do not enable `nodeIntegration`, disable context isolation/sandbox, or expose raw IPC.
- Do not pass arbitrary paths from Renderer; resolve IDs to canonical roots in Main and reject traversal/symlink escape.
- Add repeated pitfalls here, not in source comments.
