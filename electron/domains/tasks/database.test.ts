import {
  existsSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
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
    ]);

    database.close();
  });

  it("reopens a WAL database without rerunning migration", () => {
    const path = temporaryDatabasePath();
    const first = openTaskDatabase(path);
    first.connection.exec("PRAGMA wal_checkpoint(PASSIVE)");
    first.close();

    const reopened = openTaskDatabase(path);
    expect(reopened.schemaVersion).toBe(2);
    expect(
      reopened.connection
        .prepare("SELECT count(*) AS count FROM schema_migrations")
        .get(),
    ).toEqual({ count: 2 });
    reopened.close();
  });

  it("checkpoints and backs up v1 before migrating to v2", () => {
    const path = temporaryDatabasePath();
    const first = openTaskDatabase(path);
    first.connection.exec("DROP INDEX task_notifications_unread_idx");
    first.connection.exec("DELETE FROM schema_migrations WHERE version = 2");
    first.close();

    const migrated = openTaskDatabase(path);
    expect(migrated.schemaVersion).toBe(2);
    expect(existsSync(`${path}.pre-v2.bak`)).toBe(true);
    migrated.close();

    const backup = new DatabaseSync(`${path}.pre-v2.bak`, { readOnly: true });
    expect(
      backup
        .prepare("SELECT max(version) AS version FROM schema_migrations")
        .get(),
    ).toEqual({ version: 1 });
    backup.close();
  });

  it("rolls back a failed migration and retains its backup", () => {
    const path = temporaryDatabasePath();
    const first = openTaskDatabase(path);
    first.connection.exec("DROP INDEX task_notifications_unread_idx");
    first.connection.exec("DELETE FROM schema_migrations WHERE version = 2");
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
        allow_dirty,acceptance_criteria_json,automation_enabled,status,active_run_id,
        revision,created_at,updated_at,completed_at
      ) VALUES ('bad','x','','p','new_managed',NULL,'main',0,'not-json',1,'backlog',NULL,1,1,1,NULL)`),
    ).toThrow();
    database.close();
  });
});
