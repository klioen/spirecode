# Plan: Upgrade Pi SDK to 1.1.0 (from docs/upgrade-pi-sdk-1-1-0/spec.md 2026-10-08)

## Files that change

- `package.json` — restore the SpireCode manifest and update the exact Pi SDK dependency pin.
- `pnpm-lock.yaml` — regenerate Pi SDK and transitive dependency resolutions.
- `electron/domains/chat/piAdapter.ts` — make prompt acknowledgement and follow-up handling compatible if required by 1.1.0 types.
- `electron/domains/chat/piAdapter.test.ts` — cover the new prompt disposition protocol if existing tests do not already prove it.
- `docs/upgrade-pi-sdk-1-1-0/{intent,spec,plan}.md` — record intent, compatibility decisions, execution order, risks, and proof.
- Other Pi integration files only if compilation or tests demonstrate a required compatibility migration.

## Order of work

1. Restore `package.json` exactly from the current `HEAD`, removing the accidental Pi package-manifest replacement.
2. Install exact `@earendil-works/pi-coding-agent@1.1.0` with pnpm and inspect manifest/lockfile movement.
3. Run Electron type checking to identify concrete SDK API incompatibilities.
4. Update the narrow adapter seam for `PromptDisposition` and `followUp()` return semantics; add focused regression coverage where needed.
5. Run focused Pi integration tests for Chat adapter, resource isolation, settings, model catalog, wire normalization, and Chat service.
6. Run the complete `pnpm check` repository gate.
7. Verify the installed SDK version, lockfile consistency, formatting, and final diff scope.

## Risks

- The most dangerous runtime change is prompt acknowledgement: 1.1.0 replaces a boolean callback with `started | handled | queued`, and rejection no longer calls the hook.
- New built-in MCP/Codemode/tool-search extensions could change resource loading if `noExtensions` behavior is misunderstood; this upgrade preserves explicit loading and tests isolation.
- User-installed custom providers may still require an ecosystem migration because stream implementations must return `AssistantMessageEventStream`; arbitrary user extensions cannot be exhaustively validated here.
- New virtual-model registrations are intentionally not given SpireCode-specific conflict policy in this dependency upgrade because doing so would expand product scope.
- A floating version range is rejected because SpireCode requires deterministic exact pins and a committed lockfile.

## Proof

- `node -p "require('./node_modules/@earendil-works/pi-coding-agent/package.json').version"` prints `1.1.0`.
- `pnpm typecheck` exits zero.
- Focused Pi integration tests exit zero.
- `pnpm check` exits zero.
- `git diff --check` exits zero.
- `git diff -- package.json` shows the original SpireCode manifest with only the intended SDK version change.
