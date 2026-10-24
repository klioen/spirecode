# SpireCode Engineering Guide

## Architecture
- Electron desktop application: React runs in a sandboxed Renderer; Electron Main owns projects, filesystem access, Git, PTYs, pi Agent sessions, and durable state.
- Frontend feature modules live under `src/features/`; backend domain modules live under `electron/domains/`.
- Renderer code never receives Node, generic filesystem, shell, Electron IPC, or pi SDK permissions. Every path is `worktreeId + relativePath` and is validated in Main.
- Preload exposes only the allowlisted `window.spire.invoke/subscribe` bridge.
- Full design and scope: `docs/spirecode/{intent,spec,plan}.md`, `docs/pi-agent-chat/`, and `docs/electron-migration/`.

## Commands
- `pnpm check` — formatting, brand, lint, typecheck, and all Renderer/Electron tests. Healthy result: every command exits 0.
- CI runs the same gate on macOS, Windows, and Linux for pull requests and pushes to `main` via GitHub Actions (`.github/workflows/ci.yml`); `main` additionally builds and smoke-tests each native artifact.
- `pnpm dev` — run Vite, Electron main watch, and the development app.
- `pnpm bundle` — package the native host target under `release/`: macOS arm64 DMG, Windows x64 NSIS, or Linux x64 AppImage + deb. Run it on the target OS because `node-pty` is native.

## Conventions
- Keep npm dependencies pinned and commit `pnpm-lock.yaml`.
- Zustand stores hold view metadata, not file bodies, diffs, terminal output, or Chat transcripts.
- Git uses argument arrays, never shell command strings. All product Git calls go through the hardened runner; repository-defined fsmonitor, filters, hooks, external diff, or text conversion must never execute implicitly.
- Do not enable `nodeIntegration`, disable context isolation/sandbox, or expose raw IPC.
- Do not pass arbitrary paths from Renderer; resolve IDs to canonical roots in Main and reject traversal/symlink escape.
- Domain commands with optional or nullable fields must reuse dedicated typed parsers in both IPC validation and dispatch; do not let them fall through generic required-string validation.
- Restricted Task intake sessions must restore their Main-owned tool/resource policy through every Chat create/open/rebind path. Never reload them as ordinary coding sessions; clear executable resource package declarations as well as disabling extension discovery.
- Local application data may already use a schema from an unmerged feature branch. Before reinstalling an older baseline, verify database schema compatibility on a copy; never downgrade or replace live databases to make startup pass. Packaged smoke must validate Task schema/integrity, not merely window liveness.
- In Electron Main, `process.execPath` is the application executable, not Node. Never use it as a Node shebang for Git askpass or other helpers; use a self-contained platform helper to avoid recursively launching the application.
- Test Git configuration isolation with a real empty file. Node's `os.devNull` Windows device path is not a valid Git config file path.
- Update both packaged Task smoke checks when the Task schema advances; keep version, migration name, new columns, and integrity assertions in sync with Main.
- Packaged GUI PATH may omit Homebrew hosting CLIs. Resolve gh/glab from Main-owned trusted installation locations without sourcing shell startup files; reconcile a merged Task PR only against its exact source repository, branch, target, and clean local HEAD before persisting review metadata.
- Add repeated pitfalls here, not in source comments.
