# Spec: Upgrade Pi SDK to 0.87.1

## Requirements

1. `package.json` must pin `@earendil-works/pi-coding-agent` to `0.87.1`.
2. `pnpm-lock.yaml` must resolve the Pi package family and transitive dependencies produced by that version.
3. The installed dependency tree must report Pi SDK 0.87.1.
4. Existing SpireCode SDK integration must compile and pass all automated tests.
5. Production dependency license and release packaging checks must continue to pass.

## Design

This is an in-place dependency upgrade. No Renderer API, IPC contract, persistence schema, or product behavior is intentionally changed. pnpm remains the sole dependency resolver and updates the committed lockfile from the exact direct dependency pin.

The relevant SDK integration remains in:

- `electron/domains/chat/piAdapter.ts`
- `electron/domains/chat/spireSettings.ts`
- `electron/domains/models/modelCatalog.ts`
- `electron/domains/settings/index.ts`

Pi 0.86 and 0.87 introduce breaking changes around custom providers, extension event unions, JSON-compatible tool details, and canonical SessionManager context. Current reconnaissance found no SpireCode call sites using the removed `shouldStopAfterTurn` option or assigning `session.agent.state.messages`; TypeScript and tests are the compatibility guard.

## Concerns

- Bundled and user extensions may exercise Pi extension APIs beyond SpireCode's compile-time surface. Existing resource isolation and adapter tests provide local coverage, while CI covers supported host platforms.
- The upgraded SDK replaces and adds transitive packages. License checks and release tests must validate the resolved production tree.
