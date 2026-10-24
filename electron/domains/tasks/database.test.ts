import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { TaskRepository } from "./repository.js";
import { CURRENT_TASK_SCHEMA_VERSION, openTaskDatabase } from "./database.js";

const directories: string[] = [];

function temporaryDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "spire-tasks-"));
  directories.push(directory);
  return join(directory, "tasks.sqlite3");
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function removeV7Schema(connection: DatabaseSync): void {
  connection.exec(`
    DROP TABLE task_verifications;
    ALTER TABLE tasks DROP COLUMN verification_enabled;
    DELETE FROM schema_migrations WHERE version = 7;
  `);
}

function removeV6Schema(connection: DatabaseSync): void {
  removeV7Schema(connection);
  connection.exec(`
    ALTER TABLE tasks DROP COLUMN metadata_json;
    DELETE FROM schema_migrations WHERE version = 6;
  `);
}

function removeV5Schema(connection: DatabaseSync): void {
  removeV6Schema(connection);
  connection.exec(`
    DROP TABLE IF EXISTS task_archive_states;
    DROP TABLE IF EXISTS task_artifact_archives;
    DROP TABLE IF EXISTS task_run_retention;
    DROP TABLE IF EXISTS task_session_archives;
    DELETE FROM schema_migrations WHERE version = 5;
  `);
}

const historicalSchemaV5 = readFileSync(
  join(process.cwd(), "electron/domains/tasks/fixtures/schema-v5.sql"),
  "utf8",
);

function removeV4Schema(connection: DatabaseSync): void {
  removeV5Schema(connection);
  connection.exec(`
    DELETE FROM schema_migrations WHERE version = 4;
    ALTER TABLE tasks DROP COLUMN workspace_cleanup_error_code;
    ALTER TABLE tasks DROP COLUMN workspace_cleaned_at;
    ALTER TABLE tasks DROP COLUMN workspace_cleanup_status;
    ALTER TABLE tasks DROP COLUMN owns_managed_worktree;
    ALTER TABLE tasks DROP COLUMN resolved_worktree_id;
  `);
}

describe("task database", () => {
  it("creates the current schema atomically with the required pragmas and STRICT tables", () => {
    const path = temporaryDatabasePath();
    const database = openTaskDatabase(path, { now: () => 1_700_000_000_000 });

    expect(database.schemaVersion).toBe(CURRENT_TASK_SCHEMA_VERSION);
    expect(database.connection.prepare("PRAGMA foreign_keys").get()).toEqual({
      foreign_keys: 1,
    });
    expect(database.connection.prepare("PRAGMA journal_mode").get()).toEqual({
      journal_mode: "wal",
    });
    expect(database.connection.prepare("PRAGMA synchronous").get()).toEqual({
      synchronous: 2,
    });
    expect(database.connection.prepare("PRAGMA busy_timeout").get()).toEqual({
      timeout: 5000,
    });
    expect(
      database.connection.prepare("PRAGMA wal_autocheckpoint").get(),
    ).toEqual({ wal_autocheckpoint: 1000 });
    expect(database.connection.prepare("PRAGMA quick_check").get()).toEqual({
      quick_check: "ok",
    });

    const strict = database.connection
      .prepare("SELECT strict FROM pragma_table_list WHERE name = 'tasks'")
      .get();
    expect(strict).toEqual({ strict: 1 });
    expect(
      database.connection
        .prepare("SELECT version, name FROM schema_migrations")
        .all(),
    ).toEqual([
      { version: 1, name: "initial" },
      { version: 2, name: "migration-v2" },
      { version: 3, name: "migration-v3" },
      { version: 4, name: "migration-v4" },
      { version: 5, name: "migration-v5" },
      { version: 6, name: "migration-v6" },
      { version: 7, name: "migration-v7" },
    ]);
    expect(
      database.connection
        .prepare(
          "SELECT name, \"notnull\", dflt_value FROM pragma_table_info('tasks') WHERE name = 'metadata_json'",
        )
        .get(),
    ).toEqual({ name: "metadata_json", notnull: 1, dflt_value: "'{}'" });
    const taskColumns = database.connection
      .prepare("SELECT name FROM pragma_table_info('tasks')")
      .all();
    expect(taskColumns).not.toContainEqual({
      name: "acceptance_criteria_json",
    });
    expect(taskColumns).toContainEqual({ name: "verification_enabled" });
    expect(
      database.connection
        .prepare(
          "SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'task_verifications'",
        )
        .get(),
    ).toEqual({ name: "task_verifications" });
    new TaskRepository(database.connection).createTask({
      id: "10000000-0000-4000-8000-000000000001",
      projectId: "90000000-0000-4000-8000-000000000001",
      title: "Metadata constraints",
      description: "",
      workspace: { mode: "new_managed", baseRef: "origin/main" },
      automationEnabled: false,
    });
    expect(() =>
      database.connection
        .prepare("UPDATE tasks SET metadata_json = ?")
        .run("not-json"),
    ).toThrow();
    expect(() =>
      database.connection
        .prepare("UPDATE tasks SET metadata_json = ?")
        .run(JSON.stringify({ review: "x".repeat(17 * 1024) })),
    ).toThrow();

    database.close();
  });

  it("reopens a WAL database without rerunning migration", () => {
    const path = temporaryDatabasePath();
    const first = openTaskDatabase(path);
    first.connection.exec("PRAGMA wal_checkpoint(PASSIVE)");
    first.close();

    const reopened = openTaskDatabase(path);
    expect(reopened.schemaVersion).toBe(CURRENT_TASK_SCHEMA_VERSION);
    expect(
      reopened.connection
        .prepare("SELECT count(*) AS count FROM schema_migrations")
        .get(),
    ).toEqual({ count: CURRENT_TASK_SCHEMA_VERSION });
    reopened.close();
  });

  it("migrates v1 to the current schema and removes legacy-data backups", () => {
    const path = temporaryDatabasePath();
    const first = openTaskDatabase(path);
    removeV4Schema(first.connection);
    first.connection.exec(
      "ALTER TABLE tasks ADD COLUMN acceptance_criteria_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(acceptance_criteria_json))",
    );
    first.connection.exec("DROP INDEX task_notifications_unread_idx");
    first.connection.exec("DELETE FROM schema_migrations WHERE version >= 2");
    first.close();

    const migrated = openTaskDatabase(path);
    expect(migrated.schemaVersion).toBe(CURRENT_TASK_SCHEMA_VERSION);
    expect(existsSync(`${path}.pre-v2.bak`)).toBe(false);
    expect(existsSync(`${path}.pre-v3.bak`)).toBe(false);
    expect(existsSync(`${path}.pre-v4.bak`)).toBe(false);
    expect(existsSync(`${path}.pre-v5.bak`)).toBe(false);
    expect(existsSync(`${path}.pre-v6.bak`)).toBe(false);
    expect(existsSync(`${path}.pre-v7.bak`)).toBe(true);
    migrated.close();
  });

  it("rolls back a failed migration and retains its backup", () => {
    const path = temporaryDatabasePath();
    const first = openTaskDatabase(path);
    removeV4Schema(first.connection);
    first.connection.exec(
      "ALTER TABLE tasks ADD COLUMN acceptance_criteria_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(acceptance_criteria_json))",
    );
    first.connection.exec("DROP INDEX task_notifications_unread_idx");
    first.connection.exec("DELETE FROM schema_migrations WHERE version >= 2");
    first.connection.exec(
      "CREATE TABLE task_notifications_unread_idx(value TEXT)",
    );
    first.close();

    expect(() => openTaskDatabase(path)).toThrowError(
      expect.objectContaining({ code: "TASK_MIGRATION_FAILED" }),
    );
    expect(existsSync(`${path}.pre-v2.bak`)).toBe(true);
    const verify = new DatabaseSync(path, { readOnly: true });
    expect(
      verify
        .prepare("SELECT max(version) AS version FROM schema_migrations")
        .get(),
    ).toEqual({ version: 1 });
    verify.close();
  });

  it("deletes v2 criteria schema, report data, and the legacy-data backup", () => {
    const path = temporaryDatabasePath();
    const first = openTaskDatabase(path);
    removeV4Schema(first.connection);
    first.connection.exec(
      "ALTER TABLE tasks ADD COLUMN acceptance_criteria_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(acceptance_criteria_json))",
    );
    first.connection.exec("DELETE FROM schema_migrations WHERE version = 3");
    first.connection.exec(`
      INSERT INTO tasks (
        id,title,description,project_id,workspace_mode,requested_worktree_id,base_ref,
        allow_dirty,automation_enabled,status,active_run_id,revision,created_at,updated_at,completed_at,
        acceptance_criteria_json
      ) VALUES ('task','Legacy','Keep description','project','new_managed',NULL,'origin/main',
        0,1,'completed',NULL,1,1,1,1,'[{"id":"criterion","text":"delete me"}]');
      INSERT INTO task_runs (
        id,task_id,attempt,status,saga_phase,project_id,worktree_id,owns_managed_worktree,
        worktree_name,base_ref,session_id,session_path,prompt_marker,report_json,error_code,
        error_message,error_retryable,revision,created_at,started_at,settled_at,reported_at,finished_at
      ) VALUES ('run','task',1,'reported','terminal','project','worktree',1,'legacy','origin/main',
        'session',NULL,'marker','{"outcome":"success","summary":"keep summary","acceptanceCriteria":[{"criterionId":"criterion","status":"passed","evidence":"delete me"}],"tests":[{"command":"pnpm test","status":"passed","summary":"keep test"}],"changeRequest":{"kind":"github_pr","url":"https://example.com/pr/1","draft":true}}',
        NULL,NULL,NULL,1,1,1,1,1,1);
    `);
    first.close();

    const migrated = openTaskDatabase(path);
    expect(migrated.schemaVersion).toBe(CURRENT_TASK_SCHEMA_VERSION);
    expect(existsSync(`${path}.pre-v3.bak`)).toBe(false);
    expect(
      migrated.connection
        .prepare("SELECT name FROM pragma_table_info('tasks')")
        .all(),
    ).not.toContainEqual({ name: "acceptance_criteria_json" });
    expect(
      migrated.connection
        .prepare(
          "SELECT resolved_worktree_id, owns_managed_worktree, workspace_cleanup_status FROM tasks WHERE id = 'task'",
        )
        .get(),
    ).toEqual({
      resolved_worktree_id: "worktree",
      owns_managed_worktree: 1,
      workspace_cleanup_status: "retained",
    });
    const report = migrated.connection
      .prepare("SELECT report_json FROM task_runs WHERE id = 'run'")
      .get() as { report_json: string };
    expect(JSON.parse(report.report_json)).toEqual({
      outcome: "success",
      summary: "keep summary",
      tests: [{ command: "pnpm test", status: "passed", summary: "keep test" }],
      changeRequest: {
        kind: "github_pr",
        url: "https://example.com/pr/1",
        draft: true,
      },
    });
    migrated.close();
  });

  it("rolls back a failed v3 migration and retains its backup", () => {
    const path = temporaryDatabasePath();
    const first = openTaskDatabase(path);
    removeV4Schema(first.connection);
    first.connection.exec(
      "ALTER TABLE tasks ADD COLUMN acceptance_criteria_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(acceptance_criteria_json))",
    );
    first.connection.exec("DELETE FROM schema_migrations WHERE version = 3");
    first.connection.exec(
      "CREATE INDEX legacy_criteria_idx ON tasks(acceptance_criteria_json)",
    );
    first.close();

    expect(() => openTaskDatabase(path)).toThrowError(
      expect.objectContaining({ code: "TASK_MIGRATION_FAILED" }),
    );
    expect(existsSync(`${path}.pre-v3.bak`)).toBe(true);
    const verify = new DatabaseSync(path, { readOnly: true });
    expect(
      verify
        .prepare("SELECT max(version) AS version FROM schema_migrations")
        .get(),
    ).toEqual({ version: 2 });
    expect(
      verify.prepare("SELECT name FROM pragma_table_info('tasks')").all(),
    ).toContainEqual({ name: "acceptance_criteria_json" });
    verify.close();
  });

  it("rolls back a failed v4 migration and retains its recovery backup", () => {
    const path = temporaryDatabasePath();
    const first = openTaskDatabase(path);
    removeV4Schema(first.connection);
    first.connection.exec(
      "ALTER TABLE tasks ADD COLUMN resolved_worktree_id TEXT",
    );
    first.close();

    expect(() => openTaskDatabase(path)).toThrowError(
      expect.objectContaining({ code: "TASK_MIGRATION_FAILED" }),
    );
    expect(existsSync(`${path}.pre-v4.bak`)).toBe(true);
    const verify = new DatabaseSync(path, { readOnly: true });
    expect(
      verify
        .prepare("SELECT max(version) AS version FROM schema_migrations")
        .get(),
    ).toEqual({ version: 3 });
    verify.close();
  });

  it("retries v3 legacy backup cleanup on every open without broad deletion", () => {
    const path = temporaryDatabasePath();
    const first = openTaskDatabase(path);
    first.close();
    writeFileSync(`${path}.pre-v3.bak`, "stale app backup");
    writeFileSync(`${path}.pre-v4.bak`, "future migration backup");
    writeFileSync(`${path}.pre-vmanual.bak`, "user file");

    const reopened = openTaskDatabase(path);
    expect(existsSync(`${path}.pre-v3.bak`)).toBe(false);
    expect(existsSync(`${path}.pre-v4.bak`)).toBe(true);
    expect(existsSync(`${path}.pre-vmanual.bak`)).toBe(true);
    reopened.close();
  });

  it("migrates v4 through the additive v7 schema with a pre-v7 recovery backup", () => {
    const path = temporaryDatabasePath();
    const original = openTaskDatabase(path);
    removeV5Schema(original.connection);
    original.close();
    const migrated = openTaskDatabase(path);
    expect(migrated.schemaVersion).toBe(CURRENT_TASK_SCHEMA_VERSION);
    expect(existsSync(`${path}.pre-v5.bak`)).toBe(false);
    expect(existsSync(`${path}.pre-v6.bak`)).toBe(false);
    expect(existsSync(`${path}.pre-v7.bak`)).toBe(true);
    const backup = new DatabaseSync(`${path}.pre-v7.bak`, { readOnly: true });
    expect(
      backup
        .prepare("SELECT max(version) AS version FROM schema_migrations")
        .get(),
    ).toEqual({ version: 6 });
    backup.close();
    expect(
      migrated.connection
        .prepare(
          "SELECT count(*) AS count FROM sqlite_schema WHERE type='table' AND name LIKE 'task_%'",
        )
        .get(),
    ).toEqual({ count: 10 });
    migrated.close();
  });

  it("rolls back a failed v5 migration without erasing v4 data or its backup", () => {
    const path = temporaryDatabasePath();
    const original = openTaskDatabase(path);
    removeV5Schema(original.connection);
    original.connection.exec(
      "CREATE TABLE task_session_archives(conflict TEXT)",
    );
    original.close();
    expect(() => openTaskDatabase(path)).toThrowError(
      expect.objectContaining({ code: "TASK_MIGRATION_FAILED" }),
    );
    const verify = new DatabaseSync(path, { readOnly: true });
    expect(
      verify
        .prepare("SELECT max(version) AS version FROM schema_migrations")
        .get(),
    ).toEqual({ version: 4 });
    expect(
      verify
        .prepare(
          "SELECT count(*) AS count FROM sqlite_schema WHERE name='task_run_retention'",
        )
        .get(),
    ).toEqual({ count: 0 });
    verify.close();
    expect(existsSync(`${path}.pre-v5.bak`)).toBe(true);
  });

  it("opens an existing historical v5 database without discarding task/archive records or migration history", () => {
    const path = temporaryDatabasePath();
    const original = openTaskDatabase(path);
    removeV5Schema(original.connection);
    original.connection.exec(historicalSchemaV5);
    original.connection
      .prepare("INSERT INTO schema_migrations VALUES (5, 'migration-v5', 1)")
      .run();
    original.connection.exec(`
      INSERT INTO tasks (id,title,description,project_id,workspace_mode,base_ref,allow_dirty,automation_enabled,status,revision,created_at,updated_at)
        VALUES ('task','Retained','Preserve description','project','new_managed','origin/main',0,0,'completed',1,1,1);
      INSERT INTO task_runs (id,task_id,attempt,status,saga_phase,project_id,owns_managed_worktree,prompt_marker,revision,created_at,report_json)
        VALUES ('run','task',1,'reported','terminal','project',1,'marker',1,1,'{"outcome":"success","summary":"Retained report","tests":[],"changeRequest":{"kind":"github_pr","url":"https://github.com/acme/widgets/pull/42#discussion","draft":false}}');
      INSERT INTO task_session_archives VALUES ('task','session','hash',12,1);
      INSERT INTO task_run_retention VALUES ('run','archived',42,1000,1);
      INSERT INTO task_artifact_archives VALUES ('task','run','report.md','hash',12,1);
      INSERT INTO task_archive_states VALUES ('task','ready',NULL,1,'[]');
    `);
    const retainedTables = [
      "task_runs",
      "task_session_archives",
      "task_run_retention",
      "task_artifact_archives",
      "task_archive_states",
    ];
    const before = retainedTables.map((table) =>
      original.connection.prepare(`SELECT * FROM ${table}`).all(),
    );
    original.close();
    writeFileSync(`${path}.pre-v5.bak`, "previous recovery backup");

    const reopened = openTaskDatabase(path);
    expect(reopened.schemaVersion).toBe(CURRENT_TASK_SCHEMA_VERSION);
    expect(
      retainedTables.map((table) =>
        reopened.connection.prepare(`SELECT * FROM ${table}`).all(),
      ),
    ).toEqual(before);
    expect(existsSync(`${path}.pre-v5.bak`)).toBe(false);
    expect(existsSync(`${path}.pre-v6.bak`)).toBe(false);
    expect(existsSync(`${path}.pre-v7.bak`)).toBe(true);
    expect(
      reopened.connection
        .prepare("SELECT version FROM schema_migrations ORDER BY version")
        .all(),
    ).toEqual([1, 2, 3, 4, 5, 6, 7].map((version) => ({ version })));
    expect(
      reopened.connection
        .prepare("SELECT metadata_json FROM tasks WHERE id = 'task'")
        .get(),
    ).toEqual({
      metadata_json:
        '{"review":{"kind":"github_pr","url":"https://github.com/acme/widgets/pull/42","draft":false}}',
    });
    const repository = new TaskRepository(reopened.connection);
    const task = repository.createTask({
      id: "10000000-0000-4000-8000-000000000001",
      projectId: "90000000-0000-4000-8000-000000000001",
      title: "New task after restart",
      description: "Can queue tasks again",
      workspace: { mode: "new_managed", baseRef: "origin/main" },
      automationEnabled: false,
    });
    expect(repository.getTask(task.id)).toMatchObject({
      title: "New task after restart",
      metadata: {},
    });
    expect(
      reopened.connection
        .prepare("SELECT COUNT(*) AS count FROM task_session_archives")
        .get(),
    ).toEqual({ count: 1 });
    reopened.close();
  });

  it("backfills the latest structurally valid review and skips unsafe historical candidates", () => {
    const path = temporaryDatabasePath();
    const original = openTaskDatabase(path);
    removeV6Schema(original.connection);
    original.connection.exec(`
      INSERT INTO tasks (id,title,description,project_id,workspace_mode,base_ref,allow_dirty,automation_enabled,status,revision,created_at,updated_at)
        VALUES ('task-valid','Valid','', 'project','new_managed','origin/main',0,0,'completed',1,1,1),
               ('task-invalid','Invalid','', 'project','new_managed','origin/main',0,0,'completed',1,1,1);
      INSERT INTO task_runs (id,task_id,attempt,status,saga_phase,project_id,owns_managed_worktree,prompt_marker,revision,created_at,report_json)
        VALUES
        ('run-valid-old','task-valid',1,'reported','terminal','project',1,'marker-1',1,1,
         '{"outcome":"success","summary":"Valid","tests":[],"changeRequest":{"kind":"gitlab_mr","url":"https://gitlab.com/acme/widgets/-/merge_requests/7#note","draft":true}}'),
        ('run-invalid-new','task-valid',2,'reported','terminal','project',1,'marker-2',1,2,
         '{"outcome":"success","summary":"Unsafe","tests":[],"changeRequest":{"kind":"github_pr","url":"https://user:secret@github.com/acme/widgets/pull/8","draft":false}}'),
        ('run-invalid-only','task-invalid',1,'reported','terminal','project',1,'marker-3',1,1,
         '{"outcome":"success","summary":"Unknown","tests":[],"changeRequest":{"kind":"other","url":"http://example.com/review/1","draft":false,"extra":true}}');
    `);
    original.close();

    const migrated = openTaskDatabase(path);
    expect(
      migrated.connection
        .prepare("SELECT id, metadata_json FROM tasks ORDER BY id")
        .all(),
    ).toEqual([
      { id: "task-invalid", metadata_json: "{}" },
      {
        id: "task-valid",
        metadata_json:
          '{"review":{"kind":"gitlab_mr","url":"https://gitlab.com/acme/widgets/-/merge_requests/7","draft":true}}',
      },
    ]);
    migrated.close();
  });

  it("rolls back a failed v6 migration and retains the v5 recovery backup", () => {
    const path = temporaryDatabasePath();
    const original = openTaskDatabase(path);
    removeV6Schema(original.connection);
    original.connection.exec(
      "ALTER TABLE tasks ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json))",
    );
    original.close();

    expect(() => openTaskDatabase(path)).toThrowError(
      expect.objectContaining({ code: "TASK_MIGRATION_FAILED" }),
    );
    expect(existsSync(`${path}.pre-v6.bak`)).toBe(true);
    const verify = new DatabaseSync(path, { readOnly: true });
    expect(
      verify
        .prepare("SELECT max(version) AS version FROM schema_migrations")
        .get(),
    ).toEqual({ version: 5 });
    verify.close();
  });

  it("rejects an unknown future migration without modifying it", () => {
    const path = temporaryDatabasePath();
    const raw = new DatabaseSync(path);
    raw.exec(
      "CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, applied_at INTEGER NOT NULL) STRICT",
    );
    raw
      .prepare("INSERT INTO schema_migrations VALUES (?, ?, ?)")
      .run(99, "future", 1);
    raw.close();

    expect(() => openTaskDatabase(path)).toThrowError(
      expect.objectContaining({ code: "TASK_SCHEMA_TOO_NEW" }),
    );

    const verify = new DatabaseSync(path);
    expect(
      verify.prepare("SELECT version FROM schema_migrations").get(),
    ).toEqual({ version: 99 });
    verify.close();
  });

  it("fails closed when quick_check reports corruption", () => {
    const path = temporaryDatabasePath();
    const database = openTaskDatabase(path);
    database.close();

    expect(() =>
      openTaskDatabase(path, { quickCheck: () => "corrupt fixture" }),
    ).toThrowError(expect.objectContaining({ code: "TASK_DATABASE_CORRUPT" }));
  });

  it("rejects a symlink database target", () => {
    const path = temporaryDatabasePath();
    const target = join(path, "..", "target.sqlite3");
    writeFileSync(target, "");
    symlinkSync(target, path);

    expect(() => openTaskDatabase(path)).toThrowError(
      expect.objectContaining({ code: "TASK_DATABASE_UNAVAILABLE" }),
    );
  });

  it("enforces JSON and one-active-run constraints in SQLite", () => {
    const database = openTaskDatabase(temporaryDatabasePath());
    expect(() =>
      database.connection.exec(`INSERT INTO tasks (
        id,title,description,project_id,workspace_mode,requested_worktree_id,base_ref,
        allow_dirty,automation_enabled,status,active_run_id,
        revision,created_at,updated_at,completed_at
      ) VALUES ('bad','x','','p','new_managed',NULL,'main',2,1,'backlog',NULL,1,1,1,NULL)`),
    ).toThrow();
    database.close();
  });
});
