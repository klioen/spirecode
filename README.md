# SpireCode

**Fast Lightweight GUI Code Agent**

SpireCode is an Electron desktop workbench for local Git projects. It combines project management, managed worktrees, file editing, Git changes, terminals, and multi-tab AI chat powered directly by the pi Agent SDK.

> [!WARNING]
> SpireCode is pre-release software. The repository does not currently publish formally signed or notarized binaries, and there is no automatic updater. Build from source only if you are comfortable evaluating and running development software.

## Status

Screenshots and signed release downloads will be added when the public release gate is complete. Until then, the source tree and CI artifacts are development outputs, not formal releases.

| Platform | Development and CI target         | Current package output          | Public distribution status       |
| -------- | --------------------------------- | ------------------------------- | -------------------------------- |
| macOS    | Apple Silicon, macOS 14 runner    | arm64 `.app` and `.dmg`         | Not notarized or formally signed |
| Windows  | x64, current GitHub-hosted runner | x64 NSIS `.exe`                 | Not Authenticode-signed          |
| Linux    | x64, current Ubuntu runner        | x64 AppImage and Debian package | Unsigned development packages    |

### macOS：绕过 Gatekeeper

从 GitHub Actions 下载的 `.dmg` 或 `.app` 未经 Apple Developer 签名和公证，
macOS Gatekeeper 会提示「无法验证开发者」。

**首次打开方式（任选其一）：**

1. **右键 → 打开**，在弹出的对话框中选择「打开」（仅首次需要）
2. 或在终端中运行：
   ```bash
   xattr -d com.apple.quarantine /Applications/SpireCode.app
   ```
   如果解压后不在 `Applications`，请替换为实际路径。

Other architectures and package repositories such as Homebrew, winget, and apt are not currently supported release channels.

The latest successful development packages from `main` are available from the
[`nightly` prerelease](https://github.com/klioen/spirecode/releases/tag/nightly).
Release assets use GitHub's download CDN and are generally faster to download
than GitHub Actions artifacts. Nightly packages are development outputs, not
formally signed releases.

## What it includes

- Projects and managed Git worktrees
- File browsing and conflict-safe editing with explicit saves
- Git status and diff views
- Integrated terminals backed by `node-pty`
- Persistent, multi-tab pi Agent chat sessions
- Standard Pi packages, extensions, skills, prompts, and themes explicitly configured by the user

The React Renderer is sandboxed, has no Node.js access, and communicates through a narrow preload bridge. Filesystem requests use a worktree ID and relative path validated by Electron Main. This does **not** sandbox the Agent, terminals, extensions, or other processes running as your operating-system user.

## Install from source

### Prerequisites

All platforms require:

- Git
- Node.js 24 or newer
- pnpm 10 (the repository pins the expected pnpm version)
- Native build tools required by `node-pty`

Platform-specific native prerequisites typically include Xcode Command Line Tools on macOS, Visual Studio Build Tools with the Desktop development with C++ workload on Windows, or Python and a C/C++ build toolchain on Linux.

```bash
git clone https://github.com/klioen/spirecode.git
cd spirecode
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` starts Vite, watches Electron Main, and launches the development app.

## Configure pi and a model provider

SpireCode embeds the pi Agent SDK but does not own provider accounts or credentials. Authentication is external to SpireCode and is managed by pi and the provider you choose.

1. Run `pi` in a terminal.
2. Configure or authenticate an available model provider using pi's prompts and documentation.
3. Confirm the desired model works in pi.
4. Start or retry Chat in SpireCode.

Existing pi configuration, authentication, models, and sessions are read from `~/.pi/agent`. Do not paste API keys into SpireCode issues, diagnostics, or project files. If Chat reports `CHAT_AUTH_REQUIRED`, complete authentication in pi and retry the session.

## Pi resources and trust

SpireCode embeds the pi Agent SDK and its basic coding tools, but it does not bundle packages or extensions from `github:klioen/pi-extensions`. Web access, subagents, memory, todo, plan, goal, SDLC workflows, and similar add-ons are not built-in SpireCode capabilities.

Install any additional resource through Pi's standard package/resource mechanism, then explicitly declare it in `~/.pi/agent/settings.json` or `~/.spirecode/settings.json`. SpireCode loads the user-configured packages, extensions, skills, prompts, and themes that the pi SDK resolves. The Extensions settings page reflects configured user resources; it is not a catalog of SpireCode-built-in extensions. Resource changes apply to new Agent sessions.

Treat every installed package or extension as executable code. It runs with the permissions of your current operating-system user and may read or change files, execute commands, start subprocesses, or access network services. A worktree is context, not an OS security sandbox. Review a resource's source, license, and capabilities before installing or enabling it. Removing the former bundled set is a breaking change for existing development users; configure replacements through Pi if you relied on those tools.

## Local data

Default locations in the current development build are:

| Data                                               | Location                                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| pi authentication, models, resources, and sessions | `~/.pi/agent`                                                                           |
| SpireCode overrides and managed worktrees          | `~/.spirecode`                                                                          |
| macOS application state and logs                   | `~/Library/Application Support/io.github.klioen.spirecode`                              |
| Windows application state and logs                 | `%APPDATA%\io.github.klioen.spirecode`                                                  |
| Linux application state and logs                   | `$XDG_CONFIG_HOME/io.github.klioen.spirecode` or `~/.config/io.github.klioen.spirecode` |

Current builds use the production application identifier `io.github.klioen.spirecode`. On first launch they migrate valid state from the former `com.bytedance.spirecode.dev` directory when the new directory does not already exist; an explicit `--user-data-dir` bypasses migration. Back up important work before testing migration builds. See [PRIVACY.md](PRIVACY.md) for data and diagnostics details.

## Build and verify

```bash
pnpm check
pnpm bundle
```

`pnpm check` runs formatting, brand and localization checks, linting, type checking, and tests. `pnpm bundle` builds only the native host target and writes outputs under `release/`:

- macOS arm64: DMG
- Windows x64: NSIS installer
- Linux x64: AppImage and Debian package

Run packaging on the target operating system because `node-pty` is native. Current bundles are development artifacts. They are not a substitute for a signed GitHub Release, and users may see operating-system trust warnings.

## Troubleshooting

### Chat requires authentication

Run `pi` in a terminal, complete provider authentication, verify a model can run there, and then retry in SpireCode. Provider availability, billing, rate limits, and data handling are controlled by the selected external provider.

### Native dependency installation fails

Confirm Node 24, pnpm 10, Python, and the platform C/C++ toolchain are installed. Remove partially generated dependencies only after preserving any local changes, then rerun `pnpm install --frozen-lockfile`.

### A packaged app is blocked by the operating system

There is no formally signed public binary yet. Do not bypass platform security prompts for artifacts you do not trust. Build from a reviewed checkout or wait for a formal signed release.

### Unsaved changes

File edits require an explicit save. SpireCode warns before a normal window or application close would discard unsaved files, but autosave and crash recovery are not currently provided.

## Security, support, and contributing

- Read [SECURITY.md](SECURITY.md) before reporting a vulnerability. Do not disclose vulnerabilities in a public issue.
- Use [SUPPORT.md](SUPPORT.md) to choose the correct support channel.
- See [CONTRIBUTING.md](CONTRIBUTING.md) for the development and pull request process.
- Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- Release history and policy are in [CHANGELOG.md](CHANGELOG.md).

Architecture and accepted design artifacts are under [`docs/`](docs/). These documents may describe planned gates as well as delivered behavior; current code and the status notices above determine what is available today.

## License status

SpireCode's source license is the [Apache License 2.0](LICENSE). The broader public redistribution gate may remain open until the copyright holder, package metadata, production dependencies, and required third-party notices have completed review. The checked-in `LICENSE` and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) are authoritative for the checkout you are using; do not assume that an unsigned development binary has passed the formal release or legal gates.
