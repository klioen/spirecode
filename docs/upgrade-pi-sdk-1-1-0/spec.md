# Specification: Pi SDK 1.1.0 Upgrade

## Requirements

1. `package.json` is the SpireCode application manifest and pins `@earendil-works/pi-coding-agent` to `1.1.0`.
2. `pnpm-lock.yaml` resolves the SDK and its Pi-family transitive packages consistently at the release-compatible versions.
3. Prompt acknowledgement handles the 1.1.0 `PromptDisposition` protocol rather than the removed boolean preflight protocol.
4. SpireCode's internal adapter does not expose the SDK's new `followUp()` disposition to the Renderer unless product behavior requires it.
5. Existing `noExtensions: true` resource isolation remains in force; newly introduced built-in extensions are not implicitly enabled.
6. Existing session open/list/resume, model catalog, extension provider precedence, working status, abort, and tool event behavior remain compatible.
7. Node remains compatible with the SDK requirement of `>=22.19.0`.

## Compatibility decisions

- Continue using coding-agent's `AgentSession`, `SessionManager`, `ModelRuntime`, and resource loader APIs; these remain public in 1.1.0.
- Treat `"started"`, `"handled"`, and `"queued"` as successful prompt acceptance dispositions. Prompt rejection is represented by `prompt()` rejecting before acceptance.
- Await and discard `followUp()`'s disposition inside the adapter to preserve SpireCode's current `Promise<void>` seam.
- Do not add virtual-model conflict policy, timing UI, MCP, or Codemode behavior in this upgrade. Those are separate product changes.
- User extensions implementing custom provider streams may require their own 1.1.0 migration to `AssistantMessageEventStream`; repository validation covers SpireCode-owned integration only.

## Acceptance criteria

- Installed SDK reports `1.1.0`.
- Focused Electron tests covering the adapter, resource isolation, settings, model catalog, wire normalization, and Chat service pass.
- `pnpm check` exits zero.
- `git diff --check` exits zero and the diff contains no unrelated manifest replacement.
