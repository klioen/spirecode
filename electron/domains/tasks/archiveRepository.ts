import type { DatabaseSync } from "node:sqlite";
import { validateId } from "./validation.js";

export interface ArchiveFile {
  sha256: string;
  size: number;
  created_at: number;
}
export interface RunRetention {
  archive_kind: "archived" | "empty" | null;
  token_count: number | null;
  duration_ms: number | null;
  frozen_at: number | null;
}
export interface ArchiveArtifact extends ArchiveFile {
  run_id: string;
  relative_path: string;
}
export class TaskArchiveRepository {
  constructor(readonly connection: DatabaseSync) {}
  state(taskId: string) {
    return this.connection
      .prepare(
        "SELECT status, error_code, artifacts_json FROM task_archive_states WHERE task_id = ?",
      )
      .get(taskId) as
      | {
          status: "intent" | "ready" | "failed";
          error_code: string | null;
          artifacts_json: string;
        }
      | undefined;
  }
  setState(
    taskId: string,
    status: "intent" | "ready" | "failed",
    code: string | null = null,
  ) {
    validateId(taskId);
    this.connection
      .prepare(
        `INSERT INTO task_archive_states(task_id, status, error_code, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(task_id) DO UPDATE SET status=excluded.status, error_code=excluded.error_code, updated_at=excluded.updated_at`,
      )
      .run(taskId, status, code, Date.now());
  }
  begin(taskId: string, selections: unknown) {
    this.connection
      .prepare(
        `INSERT INTO task_archive_states(task_id, status, error_code, updated_at, artifacts_json) VALUES (?, 'intent', NULL, ?, ?)
      ON CONFLICT(task_id) DO UPDATE SET status='intent', error_code=NULL, updated_at=excluded.updated_at, artifacts_json=excluded.artifacts_json`,
      )
      .run(taskId, Date.now(), JSON.stringify(selections));
  }
  sessionBytes(taskId: string): number {
    return (
      this.connection
        .prepare(
          "SELECT COALESCE(SUM(size), 0) AS size FROM task_session_archives WHERE task_id=?",
        )
        .get(taskId) as { size: number }
    ).size;
  }
  session(taskId: string, sessionId: string) {
    return this.connection
      .prepare(
        "SELECT sha256, size, created_at FROM task_session_archives WHERE task_id=? AND session_id=?",
      )
      .get(taskId, sessionId) as ArchiveFile | undefined;
  }
  saveSession(taskId: string, sessionId: string, file: ArchiveFile) {
    this.connection
      .prepare(
        "INSERT OR IGNORE INTO task_session_archives VALUES (?, ?, ?, ?, ?)",
      )
      .run(taskId, sessionId, file.sha256, file.size, file.created_at);
  }
  retention(runId: string) {
    return this.connection
      .prepare(
        "SELECT archive_kind, token_count, duration_ms, frozen_at FROM task_run_retention WHERE run_id=?",
      )
      .get(runId) as RunRetention | undefined;
  }
  freeze(
    runId: string,
    sourcePath: string | null,
    tokens: number,
    duration: number,
  ) {
    this.connection.exec("BEGIN IMMEDIATE");
    try {
      if (sourcePath)
        this.connection
          .prepare(
            "UPDATE task_runs SET session_path = COALESCE(session_path, ?) WHERE id=?",
          )
          .run(sourcePath, runId);
      this.connection
        .prepare(
          `INSERT INTO task_run_retention(run_id, token_count, duration_ms, frozen_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(run_id) DO UPDATE SET token_count=COALESCE(task_run_retention.token_count, excluded.token_count), duration_ms=COALESCE(task_run_retention.duration_ms, excluded.duration_ms), frozen_at=COALESCE(task_run_retention.frozen_at, excluded.frozen_at)`,
        )
        .run(runId, tokens, duration, Date.now());
      this.connection.exec("COMMIT");
    } catch (error) {
      this.connection.exec("ROLLBACK");
      throw error;
    }
  }
  markRun(runId: string, kind: "archived" | "empty") {
    this.connection
      .prepare(
        `INSERT INTO task_run_retention(run_id, archive_kind) VALUES (?, ?)
      ON CONFLICT(run_id) DO UPDATE SET archive_kind=excluded.archive_kind`,
      )
      .run(runId, kind);
  }
  artifacts(taskId: string, runId?: string) {
    return this.connection
      .prepare(
        `SELECT run_id, relative_path, sha256, size, created_at FROM task_artifact_archives WHERE task_id=? ${runId ? "AND run_id=?" : ""} ORDER BY run_id, relative_path`,
      )
      .all(
        ...(runId ? [taskId, runId] : [taskId]),
      ) as unknown as ArchiveArtifact[];
  }
  saveArtifact(
    taskId: string,
    runId: string,
    relativePath: string,
    file: ArchiveFile,
  ) {
    this.connection
      .prepare(
        "INSERT OR IGNORE INTO task_artifact_archives VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        taskId,
        runId,
        relativePath,
        file.sha256,
        file.size,
        file.created_at,
      );
  }
}
