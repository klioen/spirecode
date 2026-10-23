# Task review metadata — Plan

1. Add shared TaskMetadata/review types and strict bounded normalization helpers, reusing the existing review URL rules.
2. Introduce schema v6 with a transactional additive column migration and validated latest-run backfill; update the historical v5 fixture and migration/rollback/restart tests.
3. Extend repository row mapping, create defaults, and add an atomic idempotent operation that applies a Main-verified review to both the run report and Task metadata under revision guards.
4. Route fresh and recovered Git delivery results through that operation, retaining metadata when no new verified review exists.
5. Add metadata to Main list/detail projections and Renderer DTOs while keeping create/update IPC exact-key validation unchanged.
6. Add repository, migration, validation, service/delivery, IPC/bindings/API, and Renderer contract coverage for empty, update, preserve, replay, restart, backfill, and unsafe/unknown/oversized inputs.
7. Run focused Task and API/UI tests, then `pnpm check`; review the final diff for scope, generated files, and accidental arbitrary metadata ingress.

## Verification evidence

- Focused domain/API/UI command: `pnpm exec vitest run electron/domains/tasks/validation.test.ts electron/domains/tasks/database.test.ts electron/domains/tasks/repository.test.ts electron/domains/tasks/service.test.ts electron/domains/tasks/delivery.test.ts electron/domains/tasks/prompt.test.ts electron/appState.test.ts electron/ipc.test.ts src/features/tasks/tasksApi.test.ts src/features/tasks/tasksStore.test.ts src/features/tasks/TaskDetail.test.tsx` — 11 files, 144 tests passed.
- `pnpm typecheck` — passed.
- `pnpm check` — passed, including 100 Vitest files / 799 tests and 19 release tests.
