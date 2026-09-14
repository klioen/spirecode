# SpireCode

**Fast Lightweight GUI Code Agent**

An Electron desktop workbench for local Git projects. It includes Projects, managed Worktrees, Files, Git Changes, Terminal, and multi-tab Chat powered directly by the pi Agent SDK.

## Stack

- Electron Main for trusted local capabilities with a sandboxed React Renderer
- React, TypeScript, Zustand, and Tailwind CSS
- `@earendil-works/pi-coding-agent` embedded in Electron Main
- Monaco for read-only source and diff views
- xterm.js backed by `node-pty`

The Renderer has no Node access. A narrow preload bridge exposes allowlisted commands and events; filesystem paths remain `worktreeId + relativePath` and are validated in Main.

## Development

Requirements: Node 24+, pnpm 10+, Xcode command-line tools, and Git. Chat uses your existing pi configuration and authentication under `~/.pi/agent`.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

## Verification

```bash
pnpm check
pnpm bundle
```

`pnpm bundle` builds the Apple Silicon `.app` and `.dmg` under `release/`. The build uses Developer ID signing when a suitable identity is available; otherwise the local artifact is unsigned and is not suitable for public distribution or notarization.

Base design artifacts are in [`docs/spirecode`](docs/spirecode/); Chat is specified in [`docs/pi-agent-chat`](docs/pi-agent-chat/), and the host migration is specified in [`docs/electron-migration`](docs/electron-migration/).
