# Plan

1. Add schema v7 migration, domain types and strict validation for verification evidence.
2. Extend repository mapping and CRUD with exact-SHA lookup and finish-once concurrency guards.
3. Split local Git preparation from remote delivery so verification sees a committed clean HEAD.
4. Add verifier prompt/tool contracts and integrate a restricted independent Chat session.
5. Insert the gate into report settlement, including durable lifecycle events and inconclusive failure handling.
6. Extend Task create/update/detail IPC shapes and renderer types.
7. Add TaskDetail controls and evidence presentation with localized copy.
8. Add migration, repository, prompt, gate/tool, and UI tests; run focused tests and `pnpm check`.

Recovery is based on durable verification rows and coding-run steps. A terminal record at the same run/SHA is reused only to resume the corresponding delivery decision; a different SHA creates a new attempt.
