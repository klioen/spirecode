import { lstatSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import type { DatabaseSync as DatabaseConnection } from "node:sqlite";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => DatabaseConnection;
};

export const CURRENT_TASK_SCHEMA_VERSION = 5;

export type TaskDatabaseErrorCode =
  | "TASK_DATABASE_UNAVAILABLE"
  | "TASK_DATABASE_CORRUPT"
  | "TASK_SCHEMA_TOO_NEW"
  | "TASK_MIGRATION_FAILED";

export class TaskDatabaseError extends Error {
  constructor(
    readonly code: TaskDatabaseErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "TaskDatabaseError";
  }
}

export interface OpenTaskDatabaseOptions {
  now?: () => number;
  quickCheck?: (connection: DatabaseConnection) => string;
}

const INITIAL_SCHEMA = `
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at INTEGER NOT NULL
) STRICT;

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  project_id TEXT NOT NULL,
  workspace_mode TEXT NOT NULL CHECK (workspace_mode IN ('new_managed','existing')),
  requested_worktree_id TEXT,
  base_ref TEXT,
  allow_dirty INTEGER NOT NULL CHECK (allow_dirty IN (0,1)),
  automation_enabled INTEGER NOT NULL CHECK (automation_enabled IN (0,1)),
  status TEXT NOT NULL CHECK (status IN ('backlog','queued','running','needs_review','completed','failed','cancelled')),
  active_run_id TEXT,
  resolved_worktree_id TEXT,
  owns_managed_worktree INTEGER NOT NULL DEFAULT 0 CHECK (owns_managed_worktree IN (0,1)),
  workspace_cleanup_status TEXT NOT NULL DEFAULT 'retained' CHECK (workspace_cleanup_status IN ('retained','intent','removed','blocked')),
  workspace_cleaned_at INTEGER,
  workspace_cleanup_error_code TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
) STRICT;

CREATE TABLE task_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  attempt INTEGER NOT NULL CHECK (attempt > 0),
  status TEXT NOT NULL CHECK (status IN ('queued','provisioning','prompting','running','awaiting_report','reported','failed','cancelled')),
  saga_phase TEXT NOT NULL CHECK (saga_phase IN ('created','workspace_intent','workspace_ready','session_intent','session_ready','prompt_intent','prompt_accepted','active','terminal')),
  project_id TEXT NOT NULL,
  worktree_id TEXT,
  owns_managed_worktree INTEGER NOT NULL CHECK (owns_managed_worktree IN (0,1)),
  worktree_name TEXT,
  base_ref TEXT,
  session_id TEXT,
  session_path TEXT,
  prompt_marker TEXT NOT NULL UNIQUE,
  report_json TEXT CHECK (report_json IS NULL OR json_valid(report_json)),
  error_code TEXT,
  error_message TEXT,
  error_retryable INTEGER CHECK (error_retryable IS NULL OR error_retryable IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  settled_at INTEGER,
  reported_at INTEGER,
  finished_at INTEGER,
  UNIQUE(task_id, attempt)
) STRICT;

CREATE TABLE task_run_steps (
  run_id TEXT NOT NULL REFERENCES task_runs(id) ON DELETE CASCADE,
  step TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('intent','done','failed')),
  details_json TEXT CHECK (details_json IS NULL OR json_valid(details_json)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, step)
) STRICT;

CREATE TABLE task_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  run_id TEXT REFERENCES task_runs(id) ON DELETE RESTRICT,
  type TEXT NOT NULL,
  payload_json TEXT CHECK (payload_json IS NULL OR json_valid(payload_json)),
  created_at INTEGER NOT NULL
) STRICT;

CREATE TABLE task_notifications (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL,
  app_read_at INTEGER,
  system_sent_at INTEGER,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (task_id, run_id, kind)
) STRICT;
CREATE INDEX task_list_idx ON tasks(status, updated_at DESC, id);
CREATE INDEX task_runs_task_idx ON task_runs(task_id, attempt DESC);
CREATE INDEX task_events_task_idx ON task_events(task_id, sequence DESC);
CREATE UNIQUE INDEX one_active_run_per_task
ON task_runs(task_id)
WHERE status IN ('queued','provisioning','prompting','running','awaiting_report');
`;

const MIGRATION_2 =
  "CREATE INDEX task_notifications_unread_idx ON task_notifications(app_read_at, created_at DESC) WHERE app_read_at IS NULL";

const MIGRATION_3 = `
UPDATE task_runs
SET report_json = json_remove(report_json, '$.acceptanceCriteria')
WHERE report_json IS NOT NULL
  AND json_type(report_json, '$.acceptanceCriteria') IS NOT NULL;
ALTER TABLE tasks DROP COLUMN acceptance_criteria_json;
`;

const MIGRATION_4 = `
ALTER TABLE tasks ADD COLUMN resolved_worktree_id TEXT;
ALTER TABLE tasks ADD COLUMN owns_managed_worktree INTEGER NOT NULL DEFAULT 0 CHECK (owns_managed_worktree IN (0,1));
ALTER TABLE tasks ADD COLUMN workspace_cleanup_status TEXT NOT NULL DEFAULT 'retained' CHECK (workspace_cleanup_status IN ('retained','intent','removed','blocked'));
ALTER TABLE tasks ADD COLUMN workspace_cleaned_at INTEGER;
ALTER TABLE tasks ADD COLUMN workspace_cleanup_error_code TEXT;
UPDATE tasks
SET resolved_worktree_id = (
      SELECT worktree_id FROM task_runs
      WHERE task_runs.task_id = tasks.id AND worktree_id IS NOT NULL
      ORDER BY attempt DESC LIMIT 1
    ),
    owns_managed_worktree = COALESCE((
      SELECT owns_managed_worktree FROM task_runs
      WHERE task_runs.task_id = tasks.id AND worktree_id IS NOT NULL
      ORDER BY attempt DESC LIMIT 1
    ), 0);
`;

const MIGRATION_5 = `
CREATE TABLE task_session_archives (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  session_id TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size >= 0),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (task_id, session_id)
) STRICT;
CREATE TABLE task_run_retention (
  run_id TEXT PRIMARY KEY REFERENCES task_runs(id) ON DELETE RESTRICT,
  archive_kind TEXT CHECK (archive_kind IN ('archived','empty')),
  token_count INTEGER CHECK (token_count >= 0),
  duration_ms INTEGER CHECK (duration_ms >= 0),
  frozen_at INTEGER
) STRICT;
CREATE TABLE task_artifact_archives (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  run_id TEXT NOT NULL REFERENCES task_runs(id) ON DELETE RESTRICT,
  relative_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size >= 0),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, relative_path)
) STRICT;
CREATE TABLE task_archive_states (
  task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('intent','ready','failed')),
  error_code TEXT,
  updated_at INTEGER NOT NULL,
  artifacts_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(artifacts_json))
) STRICT;
`;

function tableExists(connection: DatabaseConnection, name: string): boolean {
  return Boolean(
    connection
      .prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?")
      .get(name),
  );
}

function runQuickCheck(
  connection: DatabaseConnection,
  override?: (connection: DatabaseConnection) => string,
): void {
  const result = override
    ? override(connection)
    : (
        connection.prepare("PRAGMA quick_check").get() as
          { quick_check?: unknown } | undefined
      )?.quick_check;
  if (result !== "ok") {
    throw new TaskDatabaseError(
      "TASK_DATABASE_CORRUPT",
      "Task database integrity check failed",
    );
  }
}

function migrate(
  connection: DatabaseConnection,
  now: () => number,
  databasePath: string,
): number {
  if (!tableExists(connection, "schema_migrations")) {
    try {
      connection.exec("BEGIN IMMEDIATE");
      connection.exec(INITIAL_SCHEMA);
      connection
        .prepare(
          "INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)",
        )
        .run(1, "initial", now());
      connection.exec(MIGRATION_2);
      connection
        .prepare(
          "INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)",
        )
        .run(2, "migration-v2", now());
      connection
        .prepare(
          "INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)",
        )
        .run(3, "migration-v3", now());
      connection
        .prepare(
          "INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)",
        )
        .run(4, "migration-v4", now());
      connection.exec(MIGRATION_5);
      connection
        .prepare(
          "INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)",
        )
        .run(5, "migration-v5", now());
      connection.exec("COMMIT");
      return CURRENT_TASK_SCHEMA_VERSION;
    } catch (error) {
      try {
        connection.exec("ROLLBACK");
      } catch {
        // The original migration error is authoritative.
      }
      throw new TaskDatabaseError(
        "TASK_MIGRATION_FAILED",
        "Failed to create task database schema",
        {
          cause: error,
        },
      );
    }
  }

  const rows = connection
    .prepare("SELECT version FROM schema_migrations ORDER BY version")
    .all() as Array<{ version: number }>;
  const latest = rows.at(-1)?.version ?? 0;
  if (latest > CURRENT_TASK_SCHEMA_VERSION) {
    throw new TaskDatabaseError(
      "TASK_SCHEMA_TOO_NEW",
      `Task database schema ${latest} is newer than supported schema ${CURRENT_TASK_SCHEMA_VERSION}`,
    );
  }
  if (
    rows.some(({ version }, index) => version !== index + 1) ||
    rows.length !== latest
  )
    throw new TaskDatabaseError(
      "TASK_MIGRATION_FAILED",
      "Task database has an incomplete migration history",
    );
  let version = latest;
  while (version < CURRENT_TASK_SCHEMA_VERSION) {
    const targetVersion = version + 1;
    let backupPath: string | undefined;
    try {
      backupPath = createMigrationBackup(
        connection,
        databasePath,
        targetVersion,
      );
      connection.exec("BEGIN IMMEDIATE");
      if (targetVersion === 2) connection.exec(MIGRATION_2);
      else if (targetVersion === 3) connection.exec(MIGRATION_3);
      else if (targetVersion === 4) connection.exec(MIGRATION_4);
      else if (targetVersion === 5) connection.exec(MIGRATION_5);
      else throw new Error(`No Task migration for schema ${targetVersion}`);
      connection
        .prepare(
          "INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)",
        )
        .run(targetVersion, `migration-v${targetVersion}`, now());
      connection.exec("COMMIT");
      if (targetVersion !== 3)
        removeOlderMigrationBackups(databasePath, backupPath);
      version = targetVersion;
    } catch (error) {
      try {
        connection.exec("ROLLBACK");
      } catch {
        // The original migration error is authoritative.
      }
      throw new TaskDatabaseError(
        "TASK_MIGRATION_FAILED",
        `Failed to migrate task database to schema ${targetVersion}`,
        { cause: error },
      );
    }
  }
  return version;
}

function createMigrationBackup(
  connection: DatabaseConnection,
  databasePath: string,
  targetVersion: number,
): string {
  connection.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  const backupPath = `${databasePath}.pre-v${targetVersion}.bak`;
  const backupMetadata = (() => {
    try {
      return lstatSync(backupPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  })();
  if (backupMetadata?.isSymbolicLink())
    throw new TaskDatabaseError(
      "TASK_MIGRATION_FAILED",
      "Task migration backup path must not be a symlink",
    );
  rmSync(backupPath, { force: true });
  connection.prepare("VACUUM INTO ?").run(backupPath);
  return backupPath;
}

function removeOlderMigrationBackups(
  databasePath: string,
  retainedBackupPath: string | null,
  maximumVersion = CURRENT_TASK_SCHEMA_VERSION,
): void {
  const directory = dirname(databasePath);
  const prefix = `${basename(databasePath)}.pre-v`;
  for (const entry of readdirSync(directory)) {
    if (!entry.startsWith(prefix) || !entry.endsWith(".bak")) continue;
    const version = entry.slice(prefix.length, -".bak".length);
    if (!/^\d+$/.test(version)) continue;
    if (Number(version) > maximumVersion) continue;
    const candidate = join(directory, entry);
    if (candidate === retainedBackupPath) continue;
    let metadata;
    try {
      metadata = lstatSync(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (metadata.isFile()) rmSync(candidate, { force: true });
  }
}

export class TaskDatabase {
  #closed = false;

  constructor(
    readonly connection: DatabaseConnection,
    readonly schemaVersion: number,
  ) {}

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    try {
      this.connection.exec("PRAGMA wal_checkpoint(PASSIVE)");
    } finally {
      this.connection.close();
    }
  }
}

export function openTaskDatabase(
  databasePath: string,
  options: OpenTaskDatabaseOptions = {},
): TaskDatabase {
  let connection: DatabaseConnection | undefined;
  try {
    try {
      const metadata = lstatSync(databasePath);
      if (!metadata.isFile())
        throw new TaskDatabaseError(
          "TASK_DATABASE_UNAVAILABLE",
          "Task database path must be a regular file",
        );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    connection = new DatabaseSync(databasePath);
    connection.exec("PRAGMA foreign_keys = ON");
    connection.exec("PRAGMA journal_mode = WAL");
    connection.exec("PRAGMA synchronous = FULL");
    connection.exec("PRAGMA busy_timeout = 5000");
    connection.exec("PRAGMA wal_autocheckpoint = 1000");
    runQuickCheck(connection, options.quickCheck);
    const schemaVersion = migrate(
      connection,
      options.now ?? Date.now,
      databasePath,
    );
    if (schemaVersion >= 3) removeOlderMigrationBackups(databasePath, null, 3);
    return new TaskDatabase(connection, schemaVersion);
  } catch (error) {
    if (connection) {
      try {
        connection.close();
      } catch {
        // Preserve the stable opening error below.
      }
    }
    if (error instanceof TaskDatabaseError) throw error;
    throw new TaskDatabaseError(
      "TASK_DATABASE_UNAVAILABLE",
      "Task database could not be opened",
      {
        cause: error,
      },
    );
  }
}
