import type { DatabaseSync } from "node:sqlite";
import {
  assertRunTransition,
  assertTaskTransition,
  TaskStateError,
} from "./stateMachine.js";
import {
  TASK_STATUSES,
  type CreateRunInput,
  type CreateTaskInput,
  type Page,
  type RunStepState,
  type SagaPhase,
  type Task,
  type TaskEvent,
  type TaskNotification,
  type TaskRun,
  type TaskRunError,
  type TaskRunReport,
  type TaskRunStatus,
  type TaskRunStep,
  type TaskStatus,
} from "./types.js";
import {
  TaskValidationError,
  validateCreateTaskInput,
  validateId,
  validateJsonPayload,
  validateTaskRunReport,
} from "./validation.js";

export type TaskRepositoryErrorCode =
  | "TASK_NOT_FOUND"
  | "TASK_RUN_NOT_FOUND"
  | "TASK_CONFLICT"
  | "TASK_ACTIVE_RUN_EXISTS"
  | "TASK_INVALID_STATE"
  | "TASK_RESULT_INVALID"
  | "TASK_RESULT_ALREADY_REPORTED";

export class TaskRepositoryError extends Error {
  constructor(
    readonly code: TaskRepositoryErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "TaskRepositoryError";
  }
}

export interface TaskRepositoryOptions {
  now?: () => number;
}

export interface ListTasksOptions {
  limit: number;
  cursor?: string | null;
  statuses?: readonly TaskStatus[];
  query?: string;
  projectId?: string;
  attentionOnly?: boolean;
}

export interface TaskQueueSnapshot {
  occupiedSlots: number;
  busyWorktreeIds: Set<string>;
}

export interface ListOptions {
  limit: number;
  cursor?: string | null;
}

export interface TransitionRunOptions {
  sagaPhase?: SagaPhase;
  taskStatus?: TaskStatus;
  settledAt?: number | null;
  finishedAt?: number | null;
}

interface TaskRow {
  id: string;
  title: string;
  description: string;
  project_id: string;
  workspace_mode: "new_managed" | "existing";
  requested_worktree_id: string | null;
  base_ref: string | null;
  allow_dirty: number;
  automation_enabled: number;
  status: TaskStatus;
  active_run_id: string | null;
  resolved_worktree_id: string | null;
  owns_managed_worktree: number;
  workspace_cleanup_status: Task["workspaceCleanupStatus"];
  workspace_cleaned_at: number | null;
  workspace_cleanup_error_code: string | null;
  revision: number;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
}

interface RunRow {
  id: string;
  task_id: string;
  attempt: number;
  status: TaskRunStatus;
  saga_phase: SagaPhase;
  project_id: string;
  worktree_id: string | null;
  owns_managed_worktree: number;
  worktree_name: string | null;
  base_ref: string | null;
  session_id: string | null;
  session_path: string | null;
  prompt_marker: string;
  report_json: string | null;
  error_code: string | null;
  error_message: string | null;
  error_retryable: number | null;
  revision: number;
  created_at: number;
  started_at: number | null;
  settled_at: number | null;
  reported_at: number | null;
  finished_at: number | null;
}

function mapTask(row: TaskRow): Task {
  const workspace =
    row.workspace_mode === "new_managed"
      ? { mode: "new_managed" as const, baseRef: row.base_ref ?? "" }
      : {
          mode: "existing" as const,
          worktreeId: row.requested_worktree_id ?? "",
          allowDirty: row.allow_dirty === 1,
        };
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    projectId: row.project_id,
    workspace,
    automationEnabled: row.automation_enabled === 1,
    status: row.status,
    activeRunId: row.active_run_id,
    resolvedWorktreeId: row.resolved_worktree_id,
    ownsManagedWorktree: row.owns_managed_worktree === 1,
    workspaceCleanupStatus: row.workspace_cleanup_status,
    workspaceCleanedAt: row.workspace_cleaned_at,
    workspaceCleanupErrorCode: row.workspace_cleanup_error_code,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function mapRun(row: RunRow): TaskRun {
  return {
    id: row.id,
    taskId: row.task_id,
    attempt: row.attempt,
    status: row.status,
    sagaPhase: row.saga_phase,
    projectId: row.project_id,
    worktreeId: row.worktree_id,
    ownsManagedWorktree: row.owns_managed_worktree === 1,
    worktreeName: row.worktree_name,
    baseRef: row.base_ref,
    sessionId: row.session_id,
    sessionPath: row.session_path,
    promptMarker: row.prompt_marker,
    report: row.report_json
      ? (JSON.parse(row.report_json) as TaskRunReport)
      : null,
    error:
      row.error_code && row.error_message && row.error_retryable !== null
        ? {
            code: row.error_code,
            message: row.error_message,
            retryable: row.error_retryable === 1,
          }
        : null,
    revision: row.revision,
    createdAt: row.created_at,
    startedAt: row.started_at,
    settledAt: row.settled_at,
    reportedAt: row.reported_at,
    finishedAt: row.finished_at,
  };
}

function requireLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new TaskRepositoryError(
      "TASK_RESULT_INVALID",
      "limit must be an integer from 1 to 100",
    );
  }
  return limit;
}

function encodeCursor(values: unknown[]): string {
  return Buffer.from(JSON.stringify(values)).toString("base64url");
}

function decodeCursor(
  cursor: string | null | undefined,
  width: number,
): unknown[] | null {
  if (!cursor) return null;
  try {
    const values = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as unknown;
    if (!Array.isArray(values) || values.length !== width)
      throw new Error("invalid cursor");
    return values;
  } catch {
    throw new TaskRepositoryError("TASK_RESULT_INVALID", "cursor is invalid");
  }
}

export class TaskRepository {
  readonly #now: () => number;

  constructor(
    readonly connection: DatabaseSync,
    options: TaskRepositoryOptions = {},
  ) {
    this.#now = options.now ?? Date.now;
  }

  #transaction<T>(operation: () => T): T {
    this.connection.exec("BEGIN IMMEDIATE");
    try {
      const value = operation();
      this.connection.exec("COMMIT");
      return value;
    } catch (error) {
      try {
        this.connection.exec("ROLLBACK");
      } catch {
        // Keep the domain error that caused the rollback.
      }
      if (error instanceof TaskRepositoryError) throw error;
      if (error instanceof TaskValidationError) {
        throw new TaskRepositoryError("TASK_RESULT_INVALID", error.message, {
          cause: error,
        });
      }
      if (error instanceof TaskStateError) {
        throw new TaskRepositoryError("TASK_INVALID_STATE", error.message, {
          cause: error,
        });
      }
      throw error;
    }
  }

  #taskRow(id: string): TaskRow | undefined {
    return this.connection
      .prepare("SELECT * FROM tasks WHERE id = ?")
      .get(id) as TaskRow | undefined;
  }

  #runRow(id: string): RunRow | undefined {
    return this.connection
      .prepare("SELECT * FROM task_runs WHERE id = ?")
      .get(id) as RunRow | undefined;
  }

  #requireTask(id: string): TaskRow {
    const row = this.#taskRow(id);
    if (!row)
      throw new TaskRepositoryError("TASK_NOT_FOUND", "Task was not found");
    return row;
  }

  #requireRun(id: string): RunRow {
    const row = this.#runRow(id);
    if (!row)
      throw new TaskRepositoryError(
        "TASK_RUN_NOT_FOUND",
        "Task run was not found",
      );
    return row;
  }

  createTask(input: CreateTaskInput, initialRun?: CreateRunInput): Task {
    return this.#transaction(() => {
      const value = validateCreateTaskInput(input);
      const now = this.#now();
      const requestedWorktreeId =
        value.workspace.mode === "existing" ? value.workspace.worktreeId : null;
      const baseRef =
        value.workspace.mode === "new_managed" ? value.workspace.baseRef : null;
      const allowDirty =
        value.workspace.mode === "existing" && value.workspace.allowDirty
          ? 1
          : 0;
      this.connection
        .prepare(
          `INSERT INTO tasks (
          id, title, description, project_id, workspace_mode, requested_worktree_id, base_ref,
          allow_dirty, automation_enabled, status, active_run_id,
          resolved_worktree_id, owns_managed_worktree, workspace_cleanup_status,
          workspace_cleaned_at, workspace_cleanup_error_code,
          revision, created_at, updated_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'backlog', NULL, NULL, 0, 'retained', NULL, NULL, 1, ?, ?, NULL)`,
        )
        .run(
          value.id,
          value.title,
          value.description,
          value.projectId,
          value.workspace.mode,
          requestedWorktreeId,
          baseRef,
          allowDirty,
          value.automationEnabled ? 1 : 0,
          now,
          now,
        );
      if (initialRun) this.#insertRun(value.id, 1, initialRun);
      return mapTask(this.#requireTask(value.id));
    });
  }

  updateTask(
    id: string,
    expectedRevision: number,
    input: Omit<CreateTaskInput, "id" | "projectId">,
  ): Task {
    return this.#transaction(() => {
      validateId(id);
      const current = this.#requireTask(id);
      if (current.revision !== expectedRevision)
        throw new TaskRepositoryError(
          "TASK_CONFLICT",
          "Task revision does not match",
        );
      if (
        current.active_run_id ||
        !["backlog", "failed", "cancelled"].includes(current.status)
      )
        throw new TaskRepositoryError(
          "TASK_INVALID_STATE",
          "Task cannot be edited in its current state",
        );
      const value = validateCreateTaskInput({
        id,
        projectId: current.project_id,
        ...input,
      });
      const requestedWorktreeId =
        value.workspace.mode === "existing" ? value.workspace.worktreeId : null;
      const baseRef =
        value.workspace.mode === "new_managed" ? value.workspace.baseRef : null;
      const allowDirty =
        value.workspace.mode === "existing" && value.workspace.allowDirty
          ? 1
          : 0;
      this.connection
        .prepare(
          `UPDATE tasks SET title = ?, description = ?, workspace_mode = ?,
             requested_worktree_id = ?, base_ref = ?, allow_dirty = ?,
             automation_enabled = ?, revision = revision + 1, updated_at = ?
           WHERE id = ? AND revision = ?`,
        )
        .run(
          value.title,
          value.description,
          value.workspace.mode,
          requestedWorktreeId,
          baseRef,
          allowDirty,
          value.automationEnabled ? 1 : 0,
          this.#now(),
          id,
          expectedRevision,
        );
      return mapTask(this.#requireTask(id));
    });
  }

  getTask(id: string): Task | null {
    validateId(id);
    const row = this.#taskRow(id);
    return row ? mapTask(row) : null;
  }

  getRun(id: string): TaskRun | null {
    validateId(id);
    const row = this.#runRow(id);
    return row ? mapRun(row) : null;
  }

  findRunBySessionId(sessionId: string): TaskRun | null {
    validateId(sessionId, "sessionId");
    const row = this.connection
      .prepare(
        `SELECT * FROM task_runs WHERE session_id = ?
        ORDER BY CASE WHEN status IN ('queued','provisioning','prompting','running','awaiting_report') THEN 0 ELSE 1 END,
        attempt DESC LIMIT 1`,
      )
      .get(sessionId) as unknown as RunRow | undefined;
    return row ? mapRun(row) : null;
  }

  listWorkspaceCleanupIntents(): Task[] {
    const rows = this.connection
      .prepare(
        "SELECT * FROM tasks WHERE workspace_cleanup_status = 'intent' ORDER BY updated_at, id",
      )
      .all() as unknown as TaskRow[];
    return rows.map(mapTask);
  }

  listTasksByResolvedWorktreeId(worktreeId: string): Task[] {
    validateId(worktreeId, "worktreeId");
    const rows = this.connection
      .prepare(
        "SELECT * FROM tasks WHERE resolved_worktree_id = ? ORDER BY updated_at DESC, id DESC",
      )
      .all(worktreeId) as unknown as TaskRow[];
    return rows.map(mapTask);
  }

  listActiveRuns(): TaskRun[] {
    const rows = this.connection
      .prepare(
        `SELECT * FROM task_runs WHERE status IN
        ('queued','provisioning','prompting','running','awaiting_report')
        ORDER BY created_at, id`,
      )
      .all() as unknown as RunRow[];
    return rows.map(mapRun);
  }

  executionQueueSnapshot(): TaskQueueSnapshot {
    const rows = this.connection
      .prepare(
        `SELECT worktree_id, status FROM task_runs
      WHERE status IN ('queued','provisioning','prompting','running','awaiting_report') AND status <> 'queued'`,
      )
      .all() as unknown as Array<{
      worktree_id: string | null;
      status: TaskRunStatus;
    }>;
    return {
      occupiedSlots: rows.filter((run) => run.status !== "awaiting_report")
        .length,
      busyWorktreeIds: new Set(
        rows.flatMap((run) => (run.worktree_id ? [run.worktree_id] : [])),
      ),
    };
  }

  listAllRuns(taskId: string): TaskRun[] {
    validateId(taskId, "taskId");
    const rows = this.connection
      .prepare(
        "SELECT * FROM task_runs WHERE task_id = ? ORDER BY attempt DESC, id DESC",
      )
      .all(taskId) as unknown as RunRow[];
    return rows.map(mapRun);
  }

  listRuns(taskId: string, options: ListOptions): Page<TaskRun> {
    validateId(taskId, "taskId");
    const limit = requireLimit(options.limit);
    const cursor = decodeCursor(options.cursor, 2);
    let where = "";
    const parameters: Array<string | number> = [taskId];
    if (cursor) {
      const [attempt, id] = cursor;
      if (typeof attempt !== "number" || typeof id !== "string") {
        throw new TaskRepositoryError(
          "TASK_RESULT_INVALID",
          "cursor is invalid",
        );
      }
      where = "AND (attempt < ? OR (attempt = ? AND id < ?))";
      parameters.push(attempt, attempt, id);
    }
    const rows = this.connection
      .prepare(
        `SELECT * FROM task_runs WHERE task_id = ? ${where} ORDER BY attempt DESC, id DESC LIMIT ?`,
      )
      .all(...parameters, limit + 1) as unknown as RunRow[];
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(mapRun);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        hasMore && last ? encodeCursor([last.attempt, last.id]) : null,
    };
  }

  listTasks(options: ListTasksOptions): Page<Task> {
    const limit = requireLimit(options.limit);
    const cursor = decodeCursor(options.cursor, 2);
    const statuses = options.statuses ?? [];
    if (statuses.some((status) => !TASK_STATUSES.includes(status))) {
      throw new TaskRepositoryError(
        "TASK_RESULT_INVALID",
        "status filter is invalid",
      );
    }
    const clauses: string[] = [];
    const parameters: Array<string | number> = [];
    if (statuses.length > 0) {
      clauses.push(`status IN (${statuses.map(() => "?").join(",")})`);
      parameters.push(...statuses);
    }
    if (options.query !== undefined) {
      if (
        typeof options.query !== "string" ||
        Buffer.byteLength(options.query, "utf8") > 256
      )
        throw new TaskRepositoryError(
          "TASK_RESULT_INVALID",
          "query is too large",
        );
      const query = options.query.trim();
      if (query) {
        clauses.push(
          "(title LIKE ? ESCAPE '!' OR description LIKE ? ESCAPE '!')",
        );
        const pattern = `%${query.replace(/[!%_]/g, "!$&")}%`;
        parameters.push(pattern, pattern);
      }
    }
    if (options.projectId) {
      validateId(options.projectId, "projectId");
      clauses.push("project_id = ?");
      parameters.push(options.projectId);
    }
    if (
      options.attentionOnly !== undefined &&
      typeof options.attentionOnly !== "boolean"
    )
      throw new TaskRepositoryError(
        "TASK_RESULT_INVALID",
        "attentionOnly is invalid",
      );
    if (options.attentionOnly)
      clauses.push(
        "(status IN ('backlog','needs_review','failed') OR (status = 'running' AND EXISTS (SELECT 1 FROM task_runs WHERE task_runs.id = tasks.active_run_id AND task_runs.status = 'awaiting_report')))",
      );
    if (cursor) {
      const [updatedAt, id] = cursor;
      if (typeof updatedAt !== "number" || typeof id !== "string") {
        throw new TaskRepositoryError(
          "TASK_RESULT_INVALID",
          "cursor is invalid",
        );
      }
      clauses.push("(updated_at < ? OR (updated_at = ? AND id < ?))");
      parameters.push(updatedAt, updatedAt, id);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.connection
      .prepare(
        `SELECT * FROM tasks ${where} ORDER BY updated_at DESC, id DESC LIMIT ?`,
      )
      .all(...parameters, limit + 1) as unknown as TaskRow[];
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(mapTask);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        hasMore && last ? encodeCursor([last.updatedAt, last.id]) : null,
    };
  }

  taskCounts(): { incompleteCount: number; activeCount: number } {
    const row = this.connection
      .prepare(
        `SELECT
           SUM(CASE WHEN status NOT IN ('completed', 'cancelled') THEN 1 ELSE 0 END) AS incomplete_count,
           SUM(CASE WHEN status IN ('queued', 'running') THEN 1 ELSE 0 END) AS active_count
         FROM tasks`,
      )
      .get() as {
      incomplete_count: number | null;
      active_count: number | null;
    };
    return {
      incompleteCount: row.incomplete_count ?? 0,
      activeCount: row.active_count ?? 0,
    };
  }

  createRun(
    taskId: string,
    expectedTaskRevision: number,
    input: CreateRunInput,
  ): { task: Task; run: TaskRun } {
    return this.#transaction(() =>
      this.#insertRun(taskId, expectedTaskRevision, input),
    );
  }

  #insertRun(
    taskId: string,
    expectedTaskRevision: number,
    input: CreateRunInput,
  ): { task: Task; run: TaskRun } {
    validateId(taskId, "taskId");
    validateId(input.id, "run.id");
    validateId(input.projectId, "run.projectId");
    const taskRow = this.#requireTask(taskId);
    if (taskRow.revision !== expectedTaskRevision) {
      throw new TaskRepositoryError(
        "TASK_CONFLICT",
        "Task revision does not match",
      );
    }
    if (taskRow.active_run_id) {
      throw new TaskRepositoryError(
        "TASK_ACTIVE_RUN_EXISTS",
        "Task already has an active run",
      );
    }
    assertTaskTransition(taskRow.status, "queued");
    if (
      typeof input.promptMarker !== "string" ||
      input.promptMarker.length < 1 ||
      input.promptMarker.length > 200
    ) {
      throw new TaskRepositoryError(
        "TASK_RESULT_INVALID",
        "promptMarker is invalid",
      );
    }
    if (input.sessionId) validateId(input.sessionId, "run.sessionId");
    if (
      input.sessionPath !== undefined &&
      input.sessionPath !== null &&
      (typeof input.sessionPath !== "string" ||
        input.sessionPath.length > 16 * 1024)
    )
      throw new TaskRepositoryError(
        "TASK_RESULT_INVALID",
        "sessionPath is invalid",
      );
    const attemptRow = this.connection
      .prepare(
        "SELECT COALESCE(MAX(attempt), 0) + 1 AS attempt FROM task_runs WHERE task_id = ?",
      )
      .get(taskId) as { attempt: number };
    const now = this.#now();
    this.connection
      .prepare(
        `INSERT INTO task_runs (
        id, task_id, attempt, status, saga_phase, project_id, worktree_id,
        owns_managed_worktree, worktree_name, base_ref, session_id, session_path,
        prompt_marker, report_json, error_code, error_message, error_retryable,
        revision, created_at, started_at, settled_at, reported_at, finished_at
      ) VALUES (?, ?, ?, 'queued', 'created', ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 1, ?, NULL, NULL, NULL, NULL)`,
      )
      .run(
        input.id,
        taskId,
        attemptRow.attempt,
        input.projectId,
        input.worktreeId ?? null,
        input.ownsManagedWorktree ? 1 : 0,
        input.worktreeName ?? null,
        input.baseRef ?? null,
        input.sessionId ?? null,
        input.sessionPath ?? null,
        input.promptMarker,
        now,
      );
    const result = this.connection
      .prepare(
        `UPDATE tasks SET status = 'queued', active_run_id = ?,
        owns_managed_worktree = CASE
          WHEN resolved_worktree_id IS NULL AND ? IS NOT NULL THEN ?
          ELSE owns_managed_worktree END,
        resolved_worktree_id = COALESCE(resolved_worktree_id, ?),
        revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?`,
      )
      .run(
        input.id,
        input.worktreeId ?? null,
        input.ownsManagedWorktree ? 1 : 0,
        input.worktreeId ?? null,
        now,
        taskId,
        expectedTaskRevision,
      );
    if (result.changes !== 1)
      throw new TaskRepositoryError(
        "TASK_CONFLICT",
        "Task revision does not match",
      );
    return {
      task: mapTask(this.#requireTask(taskId)),
      run: mapRun(this.#requireRun(input.id)),
    };
  }

  transitionRun(
    runId: string,
    expectedRunRevision: number,
    status: TaskRunStatus,
    options: TransitionRunOptions = {},
  ): { task: Task; run: TaskRun } {
    return this.#transaction(() => {
      const runRow = this.#requireRun(validateId(runId, "runId"));
      if (runRow.revision !== expectedRunRevision) {
        throw new TaskRepositoryError(
          "TASK_CONFLICT",
          "Task run revision does not match",
        );
      }
      if (status === "reported") {
        throw new TaskRepositoryError(
          "TASK_INVALID_STATE",
          "Reported status can only be entered through reportRun",
        );
      }
      assertRunTransition(runRow.status, status);
      const taskRow = this.#requireTask(runRow.task_id);
      if (taskRow.active_run_id !== runId) {
        throw new TaskRepositoryError(
          "TASK_INVALID_STATE",
          "Task run is not active",
        );
      }
      const terminal = status === "failed" || status === "cancelled";
      const nextTaskStatus =
        options.taskStatus ?? (terminal ? status : taskRow.status);
      if (nextTaskStatus !== taskRow.status) {
        assertTaskTransition(taskRow.status, nextTaskStatus);
      }
      const now = this.#now();
      const update = this.connection
        .prepare(
          `UPDATE task_runs SET
          status = ?, saga_phase = COALESCE(?, saga_phase), revision = revision + 1,
          started_at = CASE WHEN ? = 'running' THEN COALESCE(started_at, ?) ELSE started_at END,
          settled_at = COALESCE(?, settled_at), finished_at = CASE WHEN ? THEN COALESCE(?, ?) ELSE finished_at END
          WHERE id = ? AND revision = ?`,
        )
        .run(
          status,
          options.sagaPhase ?? null,
          status,
          now,
          options.settledAt ?? null,
          terminal ? 1 : 0,
          options.finishedAt ?? null,
          now,
          runId,
          expectedRunRevision,
        );
      if (update.changes !== 1)
        throw new TaskRepositoryError(
          "TASK_CONFLICT",
          "Task run revision does not match",
        );
      this.connection
        .prepare(
          "UPDATE tasks SET status = ?, active_run_id = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?",
        )
        .run(
          nextTaskStatus,
          terminal ? null : runId,
          now,
          taskRow.id,
          taskRow.revision,
        );
      return {
        task: mapTask(this.#requireTask(taskRow.id)),
        run: mapRun(this.#requireRun(runId)),
      };
    });
  }

  bindRunWorkspace(
    runId: string,
    expectedRunRevision: number,
    worktreeId: string,
  ): TaskRun {
    return this.#transaction(() => {
      validateId(worktreeId, "worktreeId");
      const run = this.#requireRun(validateId(runId, "runId"));
      if (run.revision !== expectedRunRevision)
        throw new TaskRepositoryError(
          "TASK_CONFLICT",
          "Task run revision does not match",
        );
      const task = this.#requireTask(run.task_id);
      if (task.resolved_worktree_id && task.resolved_worktree_id !== worktreeId)
        throw new TaskRepositoryError(
          "TASK_INVALID_STATE",
          "Task is bound to another workspace",
        );
      if (run.worktree_id && run.worktree_id !== worktreeId)
        throw new TaskRepositoryError(
          "TASK_INVALID_STATE",
          "Task run is bound to another worktree",
        );
      const result = this.connection
        .prepare(
          `UPDATE task_runs SET worktree_id = ?, saga_phase = 'workspace_ready',
          revision = revision + 1 WHERE id = ? AND revision = ?`,
        )
        .run(worktreeId, runId, expectedRunRevision);
      if (result.changes !== 1)
        throw new TaskRepositoryError(
          "TASK_CONFLICT",
          "Task run revision does not match",
        );
      if (!task.resolved_worktree_id)
        this.connection
          .prepare(
            `UPDATE tasks SET resolved_worktree_id = ?, owns_managed_worktree = ?,
            revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?`,
          )
          .run(
            worktreeId,
            run.owns_managed_worktree,
            this.#now(),
            task.id,
            task.revision,
          );
      return mapRun(this.#requireRun(runId));
    });
  }

  bindRunSession(
    runId: string,
    expectedRunRevision: number,
    sessionId: string,
    sessionPath: string | null,
  ): TaskRun {
    return this.#transaction(() => {
      validateId(sessionId, "sessionId");
      const run = this.#requireRun(validateId(runId, "runId"));
      if (run.revision !== expectedRunRevision)
        throw new TaskRepositoryError(
          "TASK_CONFLICT",
          "Task run revision does not match",
        );
      if (run.session_id && run.session_id !== sessionId)
        throw new TaskRepositoryError(
          "TASK_INVALID_STATE",
          "Task run is bound to another session",
        );
      if (
        sessionPath !== null &&
        (typeof sessionPath !== "string" || sessionPath.length > 16 * 1024)
      )
        throw new TaskRepositoryError(
          "TASK_RESULT_INVALID",
          "sessionPath is invalid",
        );
      const result = this.connection
        .prepare(
          `UPDATE task_runs SET session_id = ?, session_path = ?, saga_phase = 'session_ready',
          revision = revision + 1 WHERE id = ? AND revision = ?`,
        )
        .run(sessionId, sessionPath, runId, expectedRunRevision);
      if (result.changes !== 1)
        throw new TaskRepositoryError(
          "TASK_CONFLICT",
          "Task run revision does not match",
        );
      return mapRun(this.#requireRun(runId));
    });
  }

  failRun(
    runId: string,
    expectedRunRevision: number,
    error: TaskRunError,
  ): { task: Task; run: TaskRun } {
    return this.#finishRun(runId, expectedRunRevision, "failed", error);
  }

  cancelRun(
    runId: string,
    expectedRunRevision: number,
  ): { task: Task; run: TaskRun } {
    return this.#finishRun(runId, expectedRunRevision, "cancelled", null);
  }

  #finishRun(
    runId: string,
    expectedRunRevision: number,
    status: "failed" | "cancelled",
    error: TaskRunError | null,
  ): { task: Task; run: TaskRun } {
    return this.#transaction(() => {
      const run = this.#requireRun(validateId(runId, "runId"));
      if (run.revision !== expectedRunRevision)
        throw new TaskRepositoryError(
          "TASK_CONFLICT",
          "Task run revision does not match",
        );
      assertRunTransition(run.status, status);
      const task = this.#requireTask(run.task_id);
      if (task.active_run_id !== runId)
        throw new TaskRepositoryError(
          "TASK_INVALID_STATE",
          "Task run is not active",
        );
      if (task.status !== status) assertTaskTransition(task.status, status);
      const now = this.#now();
      this.connection
        .prepare(
          `UPDATE task_runs SET status = ?, saga_phase = 'terminal', error_code = ?,
          error_message = ?, error_retryable = ?, revision = revision + 1,
          finished_at = ? WHERE id = ? AND revision = ?`,
        )
        .run(
          status,
          error?.code ?? null,
          error?.message ?? null,
          error ? (error.retryable ? 1 : 0) : null,
          now,
          runId,
          expectedRunRevision,
        );
      this.connection
        .prepare(
          `UPDATE tasks SET status = ?, active_run_id = NULL, revision = revision + 1,
          updated_at = ? WHERE id = ? AND revision = ?`,
        )
        .run(status, now, task.id, task.revision);
      return {
        task: mapTask(this.#requireTask(task.id)),
        run: mapRun(this.#requireRun(runId)),
      };
    });
  }

  retryRunDelivery(
    runId: string,
    expectedTaskRevision: number,
  ): { task: Task; run: TaskRun } {
    return this.#transaction(() => {
      const run = this.#requireRun(validateId(runId, "runId"));
      const task = this.#requireTask(run.task_id);
      if (task.revision !== expectedTaskRevision)
        throw new TaskRepositoryError(
          "TASK_CONFLICT",
          "Task revision does not match",
        );
      if (
        task.status !== "failed" ||
        task.active_run_id ||
        run.status !== "failed" ||
        !run.report_json
      )
        throw new TaskRepositoryError(
          "TASK_INVALID_STATE",
          "Task delivery cannot be retried",
        );
      const now = this.#now();
      this.connection
        .prepare(
          `UPDATE task_runs SET status = 'running', saga_phase = 'active',
          error_code = NULL, error_message = NULL, error_retryable = NULL,
          finished_at = NULL, revision = revision + 1 WHERE id = ? AND revision = ?`,
        )
        .run(runId, run.revision);
      this.connection
        .prepare(
          "DELETE FROM task_run_steps WHERE run_id = ? AND step IN ('failure','failure_stop')",
        )
        .run(runId);
      this.connection
        .prepare(
          `UPDATE tasks SET status = 'running', active_run_id = ?,
          revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?`,
        )
        .run(runId, now, task.id, expectedTaskRevision);
      return {
        task: mapTask(this.#requireTask(task.id)),
        run: mapRun(this.#requireRun(runId)),
      };
    });
  }

  cancelTask(taskId: string, expectedRevision: number): Task {
    return this.#transaction(() => {
      const task = this.#requireTask(validateId(taskId, "taskId"));
      if (task.revision !== expectedRevision)
        throw new TaskRepositoryError(
          "TASK_CONFLICT",
          "Task revision does not match",
        );
      if (task.active_run_id)
        throw new TaskRepositoryError(
          "TASK_INVALID_STATE",
          "Active tasks must cancel their run",
        );
      assertTaskTransition(task.status, "cancelled");
      const now = this.#now();
      this.connection
        .prepare(
          `UPDATE tasks SET status = 'cancelled', revision = revision + 1,
          updated_at = ? WHERE id = ? AND revision = ?`,
        )
        .run(now, taskId, expectedRevision);
      return mapTask(this.#requireTask(taskId));
    });
  }

  completeTask(taskId: string, expectedRevision: number): Task {
    return this.#transaction(() => {
      const task = this.#requireTask(validateId(taskId, "taskId"));
      if (task.revision !== expectedRevision)
        throw new TaskRepositoryError(
          "TASK_CONFLICT",
          "Task revision does not match",
        );
      assertTaskTransition(task.status, "completed");
      const now = this.#now();
      this.connection
        .prepare(
          `UPDATE tasks SET status = 'completed', revision = revision + 1,
          updated_at = ?, completed_at = ? WHERE id = ? AND revision = ?`,
        )
        .run(now, now, taskId, expectedRevision);
      return mapTask(this.#requireTask(taskId));
    });
  }

  reportRun(
    runId: string,
    expectedRunRevision: number,
    input: TaskRunReport,
  ): { task: Task; run: TaskRun } {
    return this.#transaction(() => {
      const runRow = this.#requireRun(validateId(runId, "runId"));
      const taskRow = this.#requireTask(runRow.task_id);
      const task = mapTask(taskRow);
      const report = validateTaskRunReport(input);
      const reportJson = JSON.stringify(report);
      if (runRow.report_json) {
        if (runRow.report_json === reportJson)
          return { task, run: mapRun(runRow) };
        throw new TaskRepositoryError(
          "TASK_RESULT_ALREADY_REPORTED",
          "Task run already has a different report",
        );
      }
      if (runRow.revision !== expectedRunRevision) {
        throw new TaskRepositoryError(
          "TASK_CONFLICT",
          "Task run revision does not match",
        );
      }
      if (runRow.status !== "running" && runRow.status !== "awaiting_report")
        throw new TaskRepositoryError(
          "TASK_INVALID_STATE",
          "Task run cannot accept a report in its current state",
        );
      if (taskRow.active_run_id !== runId)
        throw new TaskRepositoryError(
          "TASK_INVALID_STATE",
          "Task run is not active",
        );
      this.connection
        .prepare(
          `UPDATE task_runs SET report_json = ?, revision = revision + 1
          WHERE id = ? AND revision = ?`,
        )
        .run(reportJson, runId, expectedRunRevision);
      return {
        task: mapTask(this.#requireTask(taskRow.id)),
        run: mapRun(this.#requireRun(runId)),
      };
    });
  }

  replaceRunReport(
    runId: string,
    expectedRunRevision: number,
    input: TaskRunReport,
  ): TaskRun {
    return this.#transaction(() => {
      const run = this.#requireRun(validateId(runId, "runId"));
      if (run.revision !== expectedRunRevision)
        throw new TaskRepositoryError(
          "TASK_CONFLICT",
          "Task run revision does not match",
        );
      if (
        !run.report_json ||
        !["running", "awaiting_report"].includes(run.status)
      )
        throw new TaskRepositoryError(
          "TASK_INVALID_STATE",
          "Task run has no replaceable report",
        );
      const report = validateTaskRunReport(input);
      const result = this.connection
        .prepare(
          "UPDATE task_runs SET report_json = ?, revision = revision + 1 WHERE id = ? AND revision = ?",
        )
        .run(JSON.stringify(report), runId, expectedRunRevision);
      if (result.changes !== 1)
        throw new TaskRepositoryError(
          "TASK_CONFLICT",
          "Task run revision does not match",
        );
      return mapRun(this.#requireRun(runId));
    });
  }

  finalizeRunReport(
    runId: string,
    expectedRunRevision: number,
    settledAt = this.#now(),
  ): { task: Task; run: TaskRun } {
    return this.#transaction(() => {
      const runRow = this.#requireRun(validateId(runId, "runId"));
      const taskRow = this.#requireTask(runRow.task_id);
      if (runRow.status === "reported")
        return { task: mapTask(taskRow), run: mapRun(runRow) };
      if (runRow.revision !== expectedRunRevision)
        throw new TaskRepositoryError(
          "TASK_CONFLICT",
          "Task run revision does not match",
        );
      if (!runRow.report_json)
        throw new TaskRepositoryError(
          "TASK_INVALID_STATE",
          "Task run has no report to finalize",
        );
      assertRunTransition(runRow.status, "reported");
      assertTaskTransition(taskRow.status, "needs_review");
      if (taskRow.active_run_id !== runId)
        throw new TaskRepositoryError(
          "TASK_INVALID_STATE",
          "Task run is not active",
        );
      const now = this.#now();
      this.connection
        .prepare(
          `UPDATE task_runs SET status = 'reported', saga_phase = 'terminal',
          revision = revision + 1, settled_at = COALESCE(settled_at, ?),
          reported_at = ?, finished_at = ? WHERE id = ? AND revision = ?`,
        )
        .run(settledAt, now, now, runId, expectedRunRevision);
      this.connection
        .prepare(
          `UPDATE tasks SET status = 'needs_review', active_run_id = NULL,
          revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?`,
        )
        .run(now, taskRow.id, taskRow.revision);
      return {
        task: mapTask(this.#requireTask(taskRow.id)),
        run: mapRun(this.#requireRun(runId)),
      };
    });
  }

  beginWorkspaceCleanup(taskId: string, expectedRevision: number): Task {
    return this.#setWorkspaceCleanup(
      taskId,
      expectedRevision,
      "intent",
      null,
      null,
    );
  }

  finishWorkspaceCleanup(taskId: string, expectedRevision: number): Task {
    return this.#setWorkspaceCleanup(
      taskId,
      expectedRevision,
      "removed",
      this.#now(),
      null,
    );
  }

  blockWorkspaceCleanup(
    taskId: string,
    expectedRevision: number,
    errorCode: string,
  ): Task {
    if (!errorCode || errorCode.length > 100)
      throw new TaskRepositoryError(
        "TASK_RESULT_INVALID",
        "cleanup error code is invalid",
      );
    return this.#setWorkspaceCleanup(
      taskId,
      expectedRevision,
      "blocked",
      null,
      errorCode,
    );
  }

  #setWorkspaceCleanup(
    taskId: string,
    expectedRevision: number,
    status: Task["workspaceCleanupStatus"],
    cleanedAt: number | null,
    errorCode: string | null,
  ): Task {
    return this.#transaction(() => {
      const task = this.#requireTask(validateId(taskId, "taskId"));
      if (task.revision !== expectedRevision)
        throw new TaskRepositoryError(
          "TASK_CONFLICT",
          "Task revision does not match",
        );
      const result = this.connection
        .prepare(
          `UPDATE tasks SET workspace_cleanup_status = ?, workspace_cleaned_at = ?,
          workspace_cleanup_error_code = ?, revision = revision + 1, updated_at = ?
          WHERE id = ? AND revision = ?`,
        )
        .run(
          status,
          cleanedAt,
          errorCode,
          this.#now(),
          taskId,
          expectedRevision,
        );
      if (result.changes !== 1)
        throw new TaskRepositoryError(
          "TASK_CONFLICT",
          "Task revision does not match",
        );
      return mapTask(this.#requireTask(taskId));
    });
  }

  upsertRunStep(
    runId: string,
    step: string,
    state: RunStepState,
    details?: unknown,
  ): TaskRunStep {
    return this.#transaction(() => {
      validateId(runId, "runId");
      this.#requireRun(runId);
      if (!step || step.length > 100)
        throw new TaskRepositoryError("TASK_RESULT_INVALID", "step is invalid");
      const detailsJson = validateJsonPayload(details);
      const now = this.#now();
      this.connection
        .prepare(
          `INSERT INTO task_run_steps(run_id, step, state, details_json, updated_at)
          VALUES (?, ?, ?, ?, ?) ON CONFLICT(run_id, step) DO UPDATE SET
          state = excluded.state, details_json = excluded.details_json, updated_at = excluded.updated_at`,
        )
        .run(runId, step, state, detailsJson, now);
      return {
        runId,
        step,
        state,
        details: detailsJson ? JSON.parse(detailsJson) : null,
        updatedAt: now,
      };
    });
  }

  listRunSteps(runId: string): TaskRunStep[] {
    validateId(runId, "runId");
    const rows = this.connection
      .prepare("SELECT * FROM task_run_steps WHERE run_id = ? ORDER BY step")
      .all(runId) as Array<{
      run_id: string;
      step: string;
      state: RunStepState;
      details_json: string | null;
      updated_at: number;
    }>;
    return rows.map((row) => ({
      runId: row.run_id,
      step: row.step,
      state: row.state,
      details: row.details_json
        ? (JSON.parse(row.details_json) as unknown)
        : null,
      updatedAt: row.updated_at,
    }));
  }

  appendEvent(
    taskId: string,
    runId: string | null,
    type: string,
    payload?: unknown,
  ): TaskEvent {
    return this.#transaction(() => {
      validateId(taskId, "taskId");
      this.#requireTask(taskId);
      if (runId) {
        const run = this.#requireRun(validateId(runId, "runId"));
        if (run.task_id !== taskId)
          throw new TaskRepositoryError(
            "TASK_RESULT_INVALID",
            "Run does not belong to task",
          );
      }
      if (!type || type.length > 100)
        throw new TaskRepositoryError(
          "TASK_RESULT_INVALID",
          "event type is invalid",
        );
      const payloadJson = validateJsonPayload(payload);
      const now = this.#now();
      const result = this.connection
        .prepare(
          "INSERT INTO task_events(task_id, run_id, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run(taskId, runId, type, payloadJson, now);
      return {
        sequence: Number(result.lastInsertRowid),
        taskId,
        runId,
        type,
        payload: payloadJson ? JSON.parse(payloadJson) : null,
        createdAt: now,
      };
    });
  }

  listEvents(taskId: string, options: ListOptions): TaskEvent[] {
    validateId(taskId, "taskId");
    const limit = requireLimit(options.limit);
    const cursor = decodeCursor(options.cursor, 1);
    const sequence = cursor?.[0];
    if (sequence !== undefined && typeof sequence !== "number") {
      throw new TaskRepositoryError("TASK_RESULT_INVALID", "cursor is invalid");
    }
    const rows = this.connection
      .prepare(
        `SELECT * FROM task_events WHERE task_id = ? ${sequence === undefined ? "" : "AND sequence < ?"}
        ORDER BY sequence DESC LIMIT ?`,
      )
      .all(
        ...(sequence === undefined
          ? [taskId, limit]
          : [taskId, sequence, limit]),
      ) as Array<{
      sequence: number;
      task_id: string;
      run_id: string | null;
      type: string;
      payload_json: string | null;
      created_at: number;
    }>;
    return rows.map((row) => ({
      sequence: row.sequence,
      taskId: row.task_id,
      runId: row.run_id,
      type: row.type,
      payload: row.payload_json
        ? (JSON.parse(row.payload_json) as unknown)
        : null,
      createdAt: row.created_at,
    }));
  }

  createNotification(
    taskId: string,
    runId: string | null,
    kind: string,
  ): boolean {
    return this.#transaction(() => {
      validateId(taskId, "taskId");
      this.#requireTask(taskId);
      if (runId) this.#requireRun(validateId(runId, "runId"));
      if (!kind || kind.length > 100)
        throw new TaskRepositoryError(
          "TASK_RESULT_INVALID",
          "notification kind is invalid",
        );
      const result = this.connection
        .prepare(
          `INSERT OR IGNORE INTO task_notifications
          (task_id, run_id, kind, app_read_at, system_sent_at, created_at) VALUES (?, ?, ?, NULL, NULL, ?)`,
        )
        .run(taskId, runId ?? "", kind, this.#now());
      return result.changes === 1;
    });
  }

  listNotifications(options: ListOptions): Page<TaskNotification> {
    const limit = requireLimit(options.limit);
    const cursor = decodeCursor(options.cursor, 3);
    const parameters: Array<string | number> = [];
    let where = "";
    if (cursor) {
      const [createdAt, taskId, key] = cursor;
      if (
        typeof createdAt !== "number" ||
        typeof taskId !== "string" ||
        typeof key !== "string"
      ) {
        throw new TaskRepositoryError(
          "TASK_RESULT_INVALID",
          "cursor is invalid",
        );
      }
      where =
        "WHERE (created_at < ? OR (created_at = ? AND (task_id < ? OR (task_id = ? AND (ifnull(run_id, '') || ':' || kind) < ?))))";
      parameters.push(createdAt, createdAt, taskId, taskId, key);
    }
    const rows = this.connection
      .prepare(
        `SELECT * FROM task_notifications ${where}
        ORDER BY created_at DESC, task_id DESC, (ifnull(run_id, '') || ':' || kind) DESC LIMIT ?`,
      )
      .all(...parameters, limit + 1) as Array<{
      task_id: string;
      run_id: string;
      kind: string;
      app_read_at: number | null;
      system_sent_at: number | null;
      created_at: number;
    }>;
    const hasMore = rows.length > limit;
    const selected = rows.slice(0, limit);
    const items = selected.map((row) => ({
      taskId: row.task_id,
      runId: row.run_id || null,
      kind: row.kind,
      appReadAt: row.app_read_at,
      systemSentAt: row.system_sent_at,
      createdAt: row.created_at,
    }));
    const last = selected.at(-1);
    return {
      items,
      nextCursor:
        hasMore && last
          ? encodeCursor([
              last.created_at,
              last.task_id,
              `${last.run_id ?? ""}:${last.kind}`,
            ])
          : null,
    };
  }

  unreadNotificationCount(): number {
    return (
      this.connection
        .prepare(
          "SELECT COUNT(*) AS count FROM task_notifications WHERE app_read_at IS NULL",
        )
        .get() as { count: number }
    ).count;
  }

  markAllNotificationsRead(): void {
    this.connection
      .prepare(
        "UPDATE task_notifications SET app_read_at = ? WHERE app_read_at IS NULL",
      )
      .run(this.#now());
  }

  markNotificationSystemSent(
    taskId: string,
    runId: string | null,
    kind: string,
  ): void {
    this.connection
      .prepare(
        `UPDATE task_notifications SET system_sent_at = COALESCE(system_sent_at, ?)
         WHERE task_id = ? AND run_id = ? AND kind = ?`,
      )
      .run(this.#now(), taskId, runId ?? "", kind);
  }

  markNotificationRead(
    taskId: string,
    runId: string | null,
    kind: string,
  ): void {
    const result = this.connection
      .prepare(
        `UPDATE task_notifications SET app_read_at = COALESCE(app_read_at, ?)
        WHERE task_id = ? AND run_id = ? AND kind = ?`,
      )
      .run(this.#now(), taskId, runId ?? "", kind);
    if (result.changes !== 1)
      throw new TaskRepositoryError(
        "TASK_NOT_FOUND",
        "Notification was not found",
      );
  }
}
