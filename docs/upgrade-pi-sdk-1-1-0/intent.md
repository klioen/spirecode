# Intent: Upgrade Pi SDK to 1.1.0

## Context

SpireCode currently pins `@earendil-works/pi-coding-agent` at `0.87.1`, while the latest published release is `1.1.0`. The intervening releases add MCP, Codemode, virtual models, unified model types, timing metadata, and provider/runtime fixes. They also change prompt queue dispositions and provider stream contracts.

The working tree's `package.json` was accidentally replaced with the Pi SDK package manifest before this change. Restore the SpireCode manifest from `HEAD` before changing dependencies.

## Outcome

Restore the SpireCode package manifest, pin `@earendil-works/pi-coding-agent@1.1.0`, regenerate the pnpm lockfile, make only required compatibility changes, and prove the existing Electron integration, resource isolation, tests, and release checks remain healthy.

## Constraints

- Keep the dependency exact-pinned.
- Do not enable newly added built-in MCP, Codemode, or tool-search capabilities as part of this dependency-only upgrade.
- Preserve Renderer/Main privilege boundaries and explicit extension loading.
- Do not weaken tests or validation gates.
