# Task review metadata — Spec

## Domain model

```ts
interface TaskMetadata {
  review?: {
    kind: "github_pr" | "gitlab_mr" | "other";
    url: string;
    draft: boolean;
  };
}
```

Every domain Task and Renderer Task summary/detail contains `metadata`. New Tasks initialize it to `{}`.

## Validation and storage

- `tasks.metadata_json` is `TEXT NOT NULL DEFAULT '{}'` with SQLite `json_valid` enforcement.
- The serialized metadata has a fixed byte ceiling.
- The top-level object accepts only optional `review`; review accepts exactly `kind`, `url`, and `draft`.
- URL validation requires credential-free HTTPS, strips fragments, and enforces GitHub `/pull/<number>` and GitLab `/-/merge_requests/<number>` provider matching for their respective kinds. `other` remains provider-neutral but must satisfy the same URL safety rules.
- Reads validate persisted metadata and fail closed on malformed, unknown, unsafe, or oversized values rather than exposing unchecked JSON.
- Task create/update IPC shapes remain exact and do not accept metadata.

## Lifecycle

- Main Git delivery is the sole runtime source of `metadata.review`.
- Applying a verified delivery updates the run report review and Task metadata through one repository transaction, using run/task revision guards and incrementing the Task revision only when its metadata changes.
- Replaying an already-applied delivery is idempotent.
- A delivery without a new verified review leaves existing metadata unchanged.
- Request-changes runs and delivery retries overwrite the snapshot only with the newest verified review.
- Normal Task changed events/read-model refresh expose the new revision and metadata.

## Migration

Schema v6 adds `metadata_json`. During the same transaction, each existing Task is backfilled from the newest run (descending attempt) whose `report.changeRequest` passes the current strict metadata validation. Tasks without a valid historical review receive `{}`. Invalid candidates are never copied. Existing migration backup, rollback, integrity, contiguous-history, and newer-version rejection behavior remains intact.

## Compatibility

`TaskRun.report.changeRequest` and the current detail UI continue unchanged. List and detail DTOs add metadata without changing create/update request DTOs.
