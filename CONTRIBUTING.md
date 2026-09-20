# Contributing to SpireCode

Thank you for helping improve SpireCode. The project is currently pre-release, so discuss substantial changes before investing in a large implementation.

By submitting a contribution, you agree that it may be distributed under the repository's Apache-2.0 license (inbound equals outbound). The checked-in `LICENSE` remains authoritative, and broader legal or bundled-dependency redistribution review may still block a formal release. No CLA or DCO sign-off is currently required.

## Before you start

- Use [Support](SUPPORT.md) to choose the right channel.
- Search existing issues and pull requests.
- Report vulnerabilities privately according to [SECURITY.md](SECURITY.md), never in a public issue or pull request.
- For a non-trivial feature, behavior change, architecture change, or release-policy change, open a proposal issue first.
- Keep a contribution focused; unrelated refactors make review and rollback harder.

## Development setup

Prerequisites:

- Git
- Node.js 24 or newer
- pnpm 10
- Native build tools for `node-pty`: Xcode Command Line Tools on macOS, Visual Studio Build Tools with C++ support on Windows, or a C/C++ toolchain and Python on Linux

```bash
git clone https://github.com/klioen/spirecode.git
cd spirecode
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Do not commit credentials, local configuration, generated release artifacts, or changes to the pinned lockfile that are unrelated to your contribution.

## Design and implementation workflow

SpireCode records non-trivial changes as an SDLC artifact chain:

```text
docs/<change-slug>/
├── intent.md
├── spec.md
└── plan.md
```

1. **Intent** states the user problem, desired outcome, scope, and constraints.
2. **Spec** defines accepted behavior, boundaries, and acceptance criteria.
3. **Plan** lists exact files, order of work, risks, and proof.
4. Implementation follows an accepted spec and plan. If implementation must depart from the accepted design, update the artifact in the same change and explain why.

Small documentation corrections and narrowly scoped maintenance may not require a new artifact set. If uncertain, ask in the proposal issue before coding.

## Architecture and security rules

- React runs in a sandboxed Renderer; Electron Main owns filesystem, Git, PTYs, pi sessions, and durable state.
- Do not enable Node integration, disable context isolation or sandboxing, or expose generic IPC, shell, or filesystem access to the Renderer.
- Renderer paths must remain `worktreeId + relativePath`; Main resolves and validates canonical roots.
- Git processes use executable and argument arrays, never shell command strings.
- Do not log credentials, environment variables, prompts, tool arguments/results, file contents, or arbitrary error objects.
- Agent and extension execution is not an OS sandbox. Do not document it as one.
- Keep dependencies pinned and commit `pnpm-lock.yaml` when an approved dependency change requires it.

Read the repository `AGENTS.md` and relevant accepted documents under `docs/` before implementation.

## Tests and verification

Add or update tests for behavior changes. Bug fixes should begin with a regression test that fails for the reported defect and passes after the fix.

Run the full required gate before opening or updating a pull request:

```bash
pnpm check
```

This checks formatting, brand and localized copy, linting, TypeScript, and tests. When changing packaging or native-host behavior, also run the target-platform package build:

```bash
pnpm bundle
```

`node-pty` is native, so packaging must be verified on each affected operating system. Do not hide failures with retries, disabled tests, or `continue-on-error`.

To check only formatting:

```bash
pnpm format:check
```

## Pull requests

- Create a focused branch from the current default branch.
- Use a clear title and explain the user-visible outcome.
- Link the issue and relevant `docs/<change-slug>/` artifacts.
- Describe risks, security/privacy impact, and rollback considerations.
- List the exact commands run and their results.
- Include screenshots or recordings for visible UI changes, while redacting private data.
- Update public documentation and `CHANGELOG.md` when behavior visible to users or contributors changes.
- Confirm no secrets, credentials, personal data, or unrelated generated files are included.
- Respond to review feedback and keep the branch current without rewriting shared history unexpectedly.

Maintainers may close proposals that conflict with accepted scope, duplicate existing work, lack a safe design, or cannot be supported. Review and merge are not guaranteed.

## Commit and review quality

Prefer small, coherent commits with messages that explain intent. Review your own diff in three passes before requesting review:

1. correctness and regression risk;
2. security and privacy boundaries; and
3. compliance with the accepted spec and public claims.

## Community conduct

All interactions must follow the [Code of Conduct](CODE_OF_CONDUCT.md).
