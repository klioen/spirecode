# Pi App

A native Tauri desktop workbench for local Git projects. The V1 surface includes Projects, Files, Git Changes, and Terminal; chat and file editing are intentionally deferred.

## Stack

- Tauri 2 and Rust for local capabilities
- React, TypeScript, Zustand, and Tailwind CSS in the system WebView
- Monaco for read-only source and diff views
- xterm.js backed by a native PTY

## Development

Requirements: Node 24+, pnpm 10+, Rust stable, Xcode command-line tools, and Git.

```bash
pnpm install --frozen-lockfile
pnpm tauri dev
```

## Verification

```bash
pnpm check
pnpm bundle
```

`pnpm bundle` builds and ad-hoc signs the `.app`, creates a deterministic DMG without Finder automation, and smoke-tests both artifacts. The outputs are written under `src-tauri/target/release/bundle/`.

The local build is not notarized. Gatekeeper assessment will reject it until a Developer ID signing and notarization pipeline is configured.

Design artifacts are in [`docs/pi-app`](docs/pi-app/).
