# Spec

## Metrics

The Dashboard reports all persisted tasks across all projects:

- total tasks;
- active tasks: `queued` or `running`;
- needs attention: `backlog`, `needs_review`, `failed`, plus `running` whose active run is `awaiting_report` (overlap with active is intentional);
- completed tasks: `completed` only;
- tasks created in the rolling `[now - 7 days, now]` window;
- tasks completed in that window using non-null `completedAt`;
- cumulative wall-clock duration across every run, with live runs measured at query time;
- cumulative readable Pi-session token usage, with missing/deleted/unreadable sessions contributing zero;
- explicit counts for all seven Task statuses.

The DTO includes its measurement time and count of currently advancing runs so Renderer can advance the displayed duration on the existing page clock without rescanning token files.

## Data and performance

SQLite computes task/status/recent/attention counts with aggregate queries. Run metrics are read in fixed-size indexed batches. Main coalesces concurrent requests for one invalidation generation and never caches a result across a Task invalidation that arrived while it was being calculated. No persistence schema changes are made.

The only new IPC command is no-argument `task_dashboard`. It rejects every field and returns aggregate values only; it exposes no SQL, path, session identifier, or file capability.

## Renderer

The Dashboard appears after the Task page header and before notifications/list controls, only on the list home. It has independent loading, error, retry, and empty states. Task events invalidate it through a coalesced trailing refresh; generation checks prevent stale responses replacing newer data.

Active, attention, and completed KPI buttons select the existing corresponding list views. Each status distribution button selects exactly that status. These actions preserve search and project filters. Other metrics are not interactive.

All seven statuses are text-labelled and numbered; bars are supplemental. Native buttons, focus styles, accessible names, bilingual copy, existing theme tokens, and responsive wrapping are required.
