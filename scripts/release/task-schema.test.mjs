import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const databaseSource = await readFile(
  "electron/domains/tasks/database.ts",
  "utf8",
);
const currentVersion = Number(
  databaseSource.match(/CURRENT_TASK_SCHEMA_VERSION = (\d+)/)?.[1],
);
assert.ok(Number.isInteger(currentVersion) && currentVersion > 0);

const taskTables = [
  "task_runs",
  "task_run_steps",
  "task_events",
  "task_notifications",
  "task_session_archives",
  "task_run_retention",
  "task_artifact_archives",
  "task_archive_states",
];

for (const script of [
  "scripts/smoke-app.sh",
  "scripts/smoke-packaged-app.mjs",
]) {
  const source = await readFile(script, "utf8");
  test(`${script} validates the current Task migration`, () => {
    const version = source.match(/\?\.version === (\d+)/)?.[1];
    assert.equal(Number(version), currentVersion);
    assert.ok(source.includes(`"migration-v${currentVersion}"`));
    assert.match(source, /quick_check === "ok"/);
    assert.match(source, /tables\?\.count === 10/);
  });

  test(`${script} checks Task metadata and verification columns and reports failures`, () => {
    assert.match(source, /PRAGMA table_info\(tasks\)/);
    assert.match(source, /TASK_DATABASE_READY/);
    assert.match(source, /30_000|seq 1 300/);
    assert.match(source, /column\.name === "attempt"/);
    assert.match(source, /attempt\?\.notnull === 1/);
    assert.match(source, /column\.name === "deadline_at"/);
    assert.match(source, /PRAGMA foreign_key_check/);
    assert.match(source, /column\.name === "metadata_json"/);
    assert.match(source, /metadata\?\.type === "TEXT"/);
    assert.match(source, /metadata\?\.notnull === 1/);
    assert.match(source, /metadata\?\.dflt_value ===/);
    assert.match(source, /column\.name === "verification_enabled"/);
    assert.match(source, /verification\?\.type === "INTEGER"/);
    assert.match(source, /verification\?\.notnull === 1/);
    assert.match(source, /verification\?\.dflt_value === "1"/);
    assert.match(source, /console\.error\("Task schema smoke failed"/);
    assert.match(source, /process\.exit\(valid \? 0 : 2\)/);
  });

  for (const [
    version,
    metadataPresent,
    verificationPresent,
    tablePresent,
    expected,
  ] of [
    [6, true, false, false, 2],
    [8, true, true, true, 0],
    [8, false, true, true, 2],
    [8, true, false, true, 2],
    [8, true, true, false, 2],
    [9, true, true, true, 2],
  ]) {
    test(`${script} ${expected === 0 ? "accepts" : "rejects"} schema ${version} metadata=${metadataPresent} verification=${verificationPresent} table=${tablePresent}`, async () => {
      const directory = await mkdtemp(
        path.join(tmpdir(), "spirecode-smoke-schema-"),
      );
      try {
        const file = path.join(directory, "tasks.sqlite3");
        const db = new DatabaseSync(file);
        try {
          db.exec(
            "CREATE TABLE schema_migrations (version INTEGER, name TEXT)",
          );
          db.prepare("INSERT INTO schema_migrations VALUES (?, ?)").run(
            version,
            `migration-v${version}`,
          );
          const columns = ["id TEXT"];
          if (metadataPresent)
            columns.push("metadata_json TEXT NOT NULL DEFAULT '{}'");
          if (verificationPresent)
            columns.push("verification_enabled INTEGER NOT NULL DEFAULT 1");
          db.exec(`CREATE TABLE tasks (${columns.join(",")})`);
          if (tablePresent)
            db.exec("CREATE TABLE task_verifications (id TEXT, attempt INTEGER NOT NULL, deadline_at INTEGER)");
          for (const name of taskTables)
            db.exec(`CREATE TABLE ${name} (id TEXT)`);
        } finally {
          db.close();
        }
        const check = source.match(
          /const \{ DatabaseSync \}[\s\S]*?process\.exit\(valid \? 0 : 2\);/,
        )?.[0];
        assert.ok(check, "schema smoke executable must be present");
        const code = check.replace(
          "${JSON.stringify(taskDatabase)}",
          "process.argv[1]",
        );
        const result = spawnSync(process.execPath, ["-e", code, file], {
          encoding: "utf8",
          timeout: 5000,
        });
        assert.equal(result.status, expected, result.stderr);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
  }
}
