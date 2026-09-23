# Plan: Preserve Chat thinking block order (from docs/fix-chat-thinking-order/spec.md 2026-09-23)

## Files that change

- `electron/domains/chat/wire.ts` — preserve assistant content-block order in snapshot and event normalization.
- `electron/domains/chat/wire.test.ts` — add restored and live ordering regressions.
- `src/features/chat/sessionReducer.test.ts` — prove keyed streaming updates retain block positions.
- `docs/fix-chat-thinking-order/intent.md` — capture the approved user-visible correction.
- `docs/fix-chat-thinking-order/spec.md` — define block ordering and compatibility requirements.
- `docs/fix-chat-thinking-order/plan.md` — record implementation order, risks, and proof.

## Order of work

1. Add regression assertions showing that `thinking -> text -> tool -> thinking -> text` is currently flattened out of order in restored and live normalization.
2. Run the focused tests and retain the expected failure as red evidence.
3. Refactor assistant normalization around stable per-content-index block IDs, emitting timeline items/events in Pi source order.
4. Ensure tool block IDs correlate with execution events and preserve error fallback behavior.
5. Add reducer coverage proving later partial/final updates replace blocks in place rather than appending them.
6. Run focused Chat normalization/reducer/display tests.
7. Run `pnpm check`, inspect the diff, commit, push, and open a pull request.

## Risks

- The most dangerous change is replacing one aggregated assistant text item with block-level text items; React keys and reducer IDs must remain stable across stream updates.
- Tool cards can arrive from assistant content and tool execution lifecycle events; mismatched IDs would create duplicate cards.
- Providers may expose sparse content arrays during streaming. Iteration must preserve defined indices without inventing unstable IDs.
- A renderer-only reorder is rejected because the original content index is already discarded by the backend DTO.
- A simple “put thinking before message” swap is rejected because it still fails interleaved multi-block responses.

## Proof

- Red: focused wire test fails because current output places aggregated text before thinking.
- Green: `pnpm test -- electron/domains/chat/wire.test.ts src/features/chat/sessionReducer.test.ts src/features/chat/chatDisplayItems.test.tsx` (or the matching existing `.ts` path) exits 0.
- `pnpm check` exits 0.
- `git diff --check` exits 0.
