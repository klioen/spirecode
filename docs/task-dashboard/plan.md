# Plan

1. Add explicit Dashboard aggregate and run-batch types to the Task domain.
2. Add repository aggregate queries and indexed fixed-size run pagination; cover empty data, all statuses, attention/active overlap, seven-day boundaries, and data beyond list pagination.
3. Add a Dashboard aggregation service that reuses `taskRunDurationMs`, accepts resilient token reading, processes bounded batches, coalesces same-generation work, and discards cache candidates invalidated during calculation.
4. Wire the service into `AppState`, invalidate it for `task://event` changed/notification events, and add the exact no-argument `task_dashboard` command through contracts, dispatch validation, preload bindings, and API DTOs.
5. Add Renderer Dashboard state/rendering above the toolbar, event refresh coalescing and stale-response protection, list-view/status interactions, live duration formatting, bilingual strings, semantic CSS, and responsive/accessibility behavior.
6. Add focused repository/service/contracts/IPC/bindings/Renderer/i18n/layout tests, including token-read failure tolerance and event storms.
7. Run focused tests, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and full `pnpm check`; inspect the final diff and report exact results.
