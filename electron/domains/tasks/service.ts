import { randomUUID as nodeRandomUUID } from "node:crypto";
import {
  buildContinueForReportPrompt,
  buildTaskPrompt,
  TASK_REPORT_TOOL_DESCRIPTION,
  taskRunMarker,
  taskSessionName,
  type TaskReportToolDescription,
} from "./prompt.js";
import {
  TaskRepository,
  TaskRepositoryError,
  type ListTasksOptions,
} from "./repository.js";
import type {
  Page,
  Task,
  TaskNotification,
  TaskRun,
  TaskRunReport,
  WorkspaceRequest,
} from "./types.js";

export type TaskServiceErrorCode =
  | "TASK_NOT_FOUND"
  | "TASK_CONFLICT"
  | "TASK_INVALID_STATE"
  | "TASK_PROJECT_NOT_FOUND"
  | "TASK_PROJECT_NOT_GIT"
  | "TASK_WORKSPACE_NOT_FOUND"
  | "TASK_WORKSPACE_DIRTY_CONFIRMATION_REQUIRED"
  | "TASK_WORKSPACE_BUSY"
  | "TASK_PROMPT_FAILED"
  | "TASK_RESULT_INVALID"
  | "TASK_FAILED";

export class TaskServiceError extends Error {
  constructor(
    readonly code: TaskServiceErrorCode,
    message: string,
    readonly retryable = false,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "TaskServiceError";
  }
}

export interface TaskProjectBinding {
  id: string;
  kind: "git" | "directory";
}

export interface TaskWorktreeBinding {
  id: string;
  projectId: string;
  dirty: boolean;
  busy: boolean;
}

export interface TaskSessionBinding {
  sessionId: string;
  sessionPath: string | null;
}

export interface TaskSessionIntegration {
  sessionId: string;
  reportTool: TaskReportToolDescription;
  reportResult(input: TaskRunReport & { runId: string }): Promise<TaskDetail>;
  onEvent(event: { type: string }): void;
}

export interface TaskNotificationRequest {
  taskId: string;
  runId: string;
  kind: "needs_review" | "awaiting_report" | "failed";
}

export interface TaskServiceDependencies {
  getProject(projectId: string): Promise<TaskProjectBinding | null>;
  getWorktree(worktreeId: string): Promise<TaskWorktreeBinding | null>;
  createWorktree(
    projectId: string,
    name: string,
    baseRef: string,
  ): Promise<TaskWorktreeBinding>;
  findManagedWorktree(
    projectId: string,
    name: string,
  ): Promise<TaskWorktreeBinding | null>;
  validateManagedWorktree(
    worktreeId: string,
    expectedName: string,
    expectedBaseRef: string | null,
  ): Promise<void>;
  createSession(
    worktreeId: string,
    integration: TaskSessionIntegration,
  ): Promise<TaskSessionBinding>;
  findSession(
    worktreeId: string,
    name: string,
    sessionId: string,
  ): Promise<TaskSessionBinding | null>;
  renameSession(
    worktreeId: string,
    sessionId: string,
    name: string,
  ): Promise<void>;
  attachSession(
    worktreeId: string,
    sessionId: string,
    integration: TaskSessionIntegration,
  ): Promise<void>;
  sessionStatus(
    worktreeId: string,
    sessionId: string,
  ): Promise<"idle" | "streaming" | "failed" | "auth-required">;
  sessionHasPrompt(
    worktreeId: string,
    sessionId: string,
    marker: string,
  ): Promise<boolean>;
  sendPrompt(
    worktreeId: string,
    sessionId: string,
    prompt: string,
  ): Promise<{ accepted: boolean }>;
  abortSession(worktreeId: string, sessionId: string): Promise<void>;
  notify(request: TaskNotificationRequest): void | Promise<void>;
}

export interface CreateTaskRequest {
  title: string;
  description: string;
  projectId: string;
  workspace: WorkspaceRequest;
  automationEnabled: boolean;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  workspace?: WorkspaceRequest;
  automationEnabled?: boolean;
}

export interface TaskDetail {
  task: Task;
  runs: TaskRun[];
}

export interface TaskServiceOptions {
  randomUUID?: () => string;
}

interface StartRunOptions {
  changeNote?: string;
  reuseWorktree?: TaskRun;
}

/** Main-owned Task orchestration. All Git, workspace, and session effects are injected. */
export class TaskService {
  readonly #uuid: () => string;
  readonly #inFlight = new Map<string, Promise<TaskDetail>>();
  readonly #background = new Set<Promise<void>>();
  readonly #integrations = new Map<string, TaskSessionIntegration>();
  #startTail: Promise<void> = Promise.resolve();
  #scheduling = false;
  #disposed = false;

  constructor(
    readonly repository: TaskRepository,
    readonly dependencies: TaskServiceDependencies,
    options: TaskServiceOptions = {},
  ) {
    this.#uuid = options.randomUUID ?? nodeRandomUUID;
  }

  list(options: ListTasksOptions): Promise<Page<Task>> {
    return Promise.resolve(this.repository.listTasks(options));
  }

  listNotifications(options: {
    limit: number;
    cursor?: string | null;
  }): Page<TaskNotification> {
    return this.repository.listNotifications(options);
  }

  markNotificationRead(
    taskId: string,
    runId: string | null,
    kind: string,
  ): void {
    this.repository.markNotificationRead(taskId, runId, kind);
  }

  counts(): { incompleteCount: number; activeCount: number } {
    return this.repository.taskCounts();
  }

  async get(taskId: string): Promise<TaskDetail> {
    const task = this.repository.getTask(taskId);
    if (!task)
      throw new TaskServiceError("TASK_NOT_FOUND", "Task was not found");
    return {
      task,
      runs: this.repository.listRuns(taskId, { limit: 100 }).items,
    };
  }

  async create(input: CreateTaskRequest): Promise<TaskDetail> {
    this.#assertAvailable();
    const project = await this.#requireProject(input.projectId);
    if (project.kind === "directory" && input.workspace.mode !== "existing")
      throw new TaskServiceError(
        "TASK_PROJECT_NOT_GIT",
        "Directory projects must use their existing workspace",
      );
    if (input.workspace.mode === "existing")
      await this.#requireOwnedWorktree(
        input.projectId,
        input.workspace.worktreeId,
        input.workspace.allowDirty,
      );

    const task = this.repository.createTask({
      id: this.#uuid(),
      title: input.title,
      description: input.description,
      projectId: input.projectId,
      workspace: input.workspace,
      automationEnabled: input.automationEnabled,
    });
    this.repository.appendEvent(task.id, null, "task.created");
    if (!task.automationEnabled) return this.get(task.id);
    try {
      return await this.run(task.id, task.revision);
    } catch {
      return this.get(task.id);
    }
  }

  update(
    taskId: string,
    expectedRevision: number,
    patch: UpdateTaskRequest,
  ): Promise<TaskDetail> {
    this.#assertAvailable();
    return this.#singleFlight(taskId, async () => {
      const task = this.#requireTask(taskId);
      const project = await this.#requireProject(task.projectId);
      const workspace = patch.workspace ?? task.workspace;
      if (project.kind === "directory" && workspace.mode !== "existing")
        throw new TaskServiceError(
          "TASK_PROJECT_NOT_GIT",
          "Directory projects must use their existing workspace",
        );
      if (workspace.mode === "existing")
        await this.#requireOwnedWorktree(
          task.projectId,
          workspace.worktreeId,
          workspace.allowDirty,
        );
      const updated = this.repository.updateTask(taskId, expectedRevision, {
        title: patch.title ?? task.title,
        description: patch.description ?? task.description,
        workspace,
        automationEnabled: patch.automationEnabled ?? task.automationEnabled,
      });
      this.repository.appendEvent(taskId, null, "task.updated");
      return this.get(updated.id);
    });
  }

  run(taskId: string, expectedRevision: number): Promise<TaskDetail> {
    this.#assertAvailable();
    return this.#singleFlight(taskId, async () => {
      const task = this.#requireTask(taskId);
      if (task.revision !== expectedRevision)
        throw new TaskServiceError(
          "TASK_CONFLICT",
          "Task revision does not match",
        );
      if (
        task.status !== "backlog" &&
        task.status !== "failed" &&
        task.status !== "cancelled"
      )
        throw new TaskServiceError(
          "TASK_INVALID_STATE",
          "Task cannot be run from its current state",
        );
      await this.#requireProject(task.projectId);
      const reuseWorktree = this.repository
        .listRuns(taskId, { limit: 1 })
        .items.find((run) => run.worktreeId !== null);
      this.#assertWorktreeAvailable(
        reuseWorktree?.worktreeId ??
          (task.workspace.mode === "existing"
            ? task.workspace.worktreeId
            : null),
        taskId,
      );
      const run = this.#createRun(task, { reuseWorktree });
      try {
        return await this.#startQueuedRun(run.id);
      } catch (error) {
        await this.#recordFailure(run.id, error);
        throw this.#serviceError(error);
      }
    });
  }

  cancel(taskId: string, expectedRevision: number): Promise<TaskDetail> {
    this.#assertAvailable();
    return this.#singleFlight(taskId, async () => {
      const task = this.#requireTask(taskId);
      if (task.revision !== expectedRevision)
        throw new TaskServiceError(
          "TASK_CONFLICT",
          "Task revision does not match",
        );
      if (!task.activeRunId) {
        this.repository.cancelTask(taskId, expectedRevision);
        this.repository.appendEvent(taskId, null, "task.cancelled");
        return this.get(taskId);
      }
      let run = this.#requireRun(task.activeRunId);
      this.repository.upsertRunStep(run.id, "cancel", "intent");
      if (run.worktreeId && run.sessionId)
        await this.dependencies.abortSession(run.worktreeId, run.sessionId);
      run = this.#requireRun(run.id);
      this.repository.cancelRun(run.id, run.revision);
      this.repository.upsertRunStep(run.id, "cancel", "done");
      this.repository.appendEvent(taskId, run.id, "run.cancelled");
      await this.#scheduleQueued();
      return this.get(taskId);
    });
  }

  async complete(
    taskId: string,
    expectedRevision: number,
  ): Promise<TaskDetail> {
    this.#assertAvailable();
    this.repository.completeTask(taskId, expectedRevision);
    this.repository.appendEvent(taskId, null, "task.completed");
    return this.get(taskId);
  }

  requestChanges(
    taskId: string,
    expectedRevision: number,
    note: string,
  ): Promise<TaskDetail> {
    this.#assertAvailable();
    return this.#singleFlight(taskId, async () => {
      const task = this.#requireTask(taskId);
      if (task.revision !== expectedRevision)
        throw new TaskServiceError(
          "TASK_CONFLICT",
          "Task revision does not match",
        );
      if (task.status !== "needs_review")
        throw new TaskServiceError(
          "TASK_INVALID_STATE",
          "Task is not awaiting review",
        );
      const normalized = note.trim();
      if (!normalized || Buffer.byteLength(normalized, "utf8") > 64 * 1024)
        throw new TaskServiceError(
          "TASK_RESULT_INVALID",
          "Change note is invalid",
        );
      const previous = this.repository.listRuns(taskId, { limit: 1 }).items[0];
      if (!previous?.worktreeId)
        throw new TaskServiceError(
          "TASK_WORKSPACE_NOT_FOUND",
          "Previous workspace is missing",
        );
      this.#assertWorktreeAvailable(previous.worktreeId, taskId);
      const run = this.#createRun(task, {
        changeNote: normalized,
        reuseWorktree: previous,
      });
      this.repository.upsertRunStep(run.id, "request_changes", "done", {
        note: normalized,
      });
      this.repository.appendEvent(taskId, run.id, "task.changes_requested");
      try {
        return await this.#startQueuedRun(run.id, normalized);
      } catch (error) {
        await this.#recordFailure(run.id, error);
        throw this.#serviceError(error);
      }
    });
  }

  continueForReport(
    taskId: string,
    expectedRevision: number,
  ): Promise<TaskDetail> {
    this.#assertAvailable();
    return this.#singleFlight(taskId, async () => {
      const task = this.#requireTask(taskId);
      if (task.revision !== expectedRevision)
        throw new TaskServiceError(
          "TASK_CONFLICT",
          "Task revision does not match",
        );
      if (!task.activeRunId)
        throw new TaskServiceError(
          "TASK_INVALID_STATE",
          "Task has no active run",
        );
      let run = this.#requireRun(task.activeRunId);
      if (run.status !== "awaiting_report" || !run.worktreeId || !run.sessionId)
        throw new TaskServiceError(
          "TASK_INVALID_STATE",
          "Task is not awaiting a report",
        );
      return this.#withStartLock(async () => {
        if (!this.#hasExecutionSlot())
          throw new TaskServiceError(
            "TASK_WORKSPACE_BUSY",
            "All automated Task execution slots are in use",
            true,
          );
        const integration = this.#integration(run.id);
        await this.dependencies.attachSession(
          run.worktreeId!,
          run.sessionId!,
          integration,
        );
        const accepted = await this.dependencies.sendPrompt(
          run.worktreeId!,
          run.sessionId!,
          buildContinueForReportPrompt(run),
        );
        if (!accepted.accepted)
          throw new TaskServiceError(
            "TASK_PROMPT_FAILED",
            "Continuation prompt was not accepted",
            true,
          );
        run = this.repository.transitionRun(run.id, run.revision, "running", {
          sagaPhase: "active",
        }).run;
        this.repository.appendEvent(taskId, run.id, "run.continued_for_report");
        return this.get(taskId);
      });
    });
  }

  async recover(): Promise<void> {
    this.#assertAvailable();
    for (const active of this.repository.listActiveRuns()) {
      try {
        await this.#singleFlight(active.taskId, () =>
          active.status === "queued"
            ? this.#startQueuedRun(active.id)
            : this.#orchestrate(active.id),
        );
        this.repository.appendEvent(active.taskId, active.id, "run.recovered");
      } catch (error) {
        await this.#recordFailure(active.id, error);
      }
    }
    await this.#scheduleQueued();
  }

  async whenIdle(): Promise<void> {
    while (this.#background.size > 0) await Promise.all([...this.#background]);
  }

  async dispose(): Promise<void> {
    this.#disposed = true;
    await this.whenIdle();
  }

  #createRun(task: Task, options: StartRunOptions): TaskRun {
    const id = this.#uuid();
    const previous = options.reuseWorktree;
    const ownsManagedWorktree = previous
      ? previous.ownsManagedWorktree
      : task.workspace.mode === "new_managed";
    const worktreeName =
      previous?.worktreeName ??
      (task.workspace.mode === "new_managed"
        ? managedWorktreeName(id, task.title)
        : null);
    const worktreeId =
      previous?.worktreeId ??
      (task.workspace.mode === "existing" ? task.workspace.worktreeId : null);
    return this.repository.createRun(task.id, task.revision, {
      id,
      projectId: task.projectId,
      promptMarker: taskRunMarker(id),
      ownsManagedWorktree,
      worktreeName,
      baseRef:
        previous?.baseRef ??
        (task.workspace.mode === "new_managed" ? task.workspace.baseRef : null),
      worktreeId,
    }).run;
  }

  async #startQueuedRun(
    runId: string,
    changeNote?: string,
  ): Promise<TaskDetail> {
    return this.#withStartLock(async () => {
      if (!this.#hasExecutionSlot()) {
        const run = this.#requireRun(runId);
        this.repository.appendEvent(run.taskId, run.id, "run.queued");
        return this.get(run.taskId);
      }
      return this.#orchestrate(runId, changeNote);
    });
  }

  async #withStartLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.#startTail;
    let release!: () => void;
    this.#startTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  #hasExecutionSlot(): boolean {
    return (
      this.repository
        .listActiveRuns()
        .filter((run) =>
          ["provisioning", "prompting", "running"].includes(run.status),
        ).length < 3
    );
  }

  async #scheduleQueued(): Promise<void> {
    if (this.#scheduling || this.#disposed) return;
    this.#scheduling = true;
    try {
      while (this.#hasExecutionSlot()) {
        const queued = this.repository
          .listActiveRuns()
          .find((run) => run.status === "queued");
        if (!queued) break;
        try {
          await this.#singleFlight(queued.taskId, () =>
            this.#startQueuedRun(queued.id),
          );
        } catch (error) {
          await this.#recordFailure(queued.id, error);
        }
      }
    } finally {
      this.#scheduling = false;
    }
  }

  async #orchestrate(runId: string, changeNote?: string): Promise<TaskDetail> {
    let run = this.#requireRun(runId);
    const task = this.#requireTask(run.taskId);
    await this.#requireProject(task.projectId);
    const steps = this.repository.listRunSteps(run.id);
    const cancelStep = steps.find((step) => step.step === "cancel");
    if (cancelStep?.state === "intent") {
      if (run.worktreeId && run.sessionId)
        await this.dependencies.abortSession(run.worktreeId, run.sessionId);
      const cancelled = this.repository.cancelRun(run.id, run.revision);
      this.repository.upsertRunStep(run.id, "cancel", "done");
      this.repository.appendEvent(task.id, run.id, "run.cancelled_recovered");
      return this.get(cancelled.task.id);
    }
    if (!changeNote) {
      const requestStep = steps.find((step) => step.step === "request_changes");
      const details = requestStep?.details;
      if (
        typeof details === "object" &&
        details !== null &&
        "note" in details &&
        typeof details.note === "string"
      )
        changeNote = details.note;
    }

    if (run.status === "queued")
      run = this.repository.transitionRun(
        run.id,
        run.revision,
        "provisioning",
        {
          sagaPhase: "workspace_intent",
          taskStatus: "running",
        },
      ).run;

    if (!run.worktreeId) {
      this.repository.upsertRunStep(run.id, "workspace", "intent", {
        mode: task.workspace.mode,
        name: run.worktreeName,
      });
      let worktree: TaskWorktreeBinding | null;
      if (task.workspace.mode === "existing") {
        worktree = await this.#requireOwnedWorktree(
          task.projectId,
          task.workspace.worktreeId,
          task.workspace.allowDirty,
        );
      } else {
        worktree = await this.dependencies.findManagedWorktree(
          task.projectId,
          run.worktreeName!,
        );
        if (!worktree)
          worktree = await this.dependencies.createWorktree(
            task.projectId,
            run.worktreeName!,
            run.baseRef!,
          );
        this.#assertWorktreeOwner(worktree, task.projectId);
      }
      run = this.repository.bindRunWorkspace(run.id, run.revision, worktree.id);
      this.repository.upsertRunStep(run.id, "workspace", "done", {
        worktreeId: worktree.id,
      });
    } else {
      await this.#requireOwnedWorktree(
        task.projectId,
        run.worktreeId,
        task.workspace.mode === "existing" ? task.workspace.allowDirty : true,
      );
      if (
        this.repository
          .listRunSteps(run.id)
          .find((step) => step.step === "workspace")?.state !== "done"
      )
        this.repository.upsertRunStep(run.id, "workspace", "done", {
          worktreeId: run.worktreeId,
        });
    }

    if (run.ownsManagedWorktree)
      await this.dependencies.validateManagedWorktree(
        run.worktreeId!,
        run.worktreeName!,
        run.baseRef,
      );

    if (run.status === "provisioning")
      run = this.repository.transitionRun(run.id, run.revision, "prompting", {
        sagaPhase: "session_intent",
      }).run;

    const integration = this.#integration(run.id);
    if (!run.sessionId) {
      this.repository.upsertRunStep(run.id, "session", "intent", {
        name: taskSessionName(run.id),
      });
      let session = await this.dependencies.findSession(
        run.worktreeId!,
        taskSessionName(run.id),
        run.id,
      );
      if (!session) {
        session = await this.dependencies.createSession(
          run.worktreeId!,
          integration,
        );
        run = this.repository.bindRunSession(
          run.id,
          run.revision,
          session.sessionId,
          session.sessionPath,
        );
      } else {
        await this.dependencies.attachSession(
          run.worktreeId!,
          session.sessionId,
          integration,
        );
        run = this.repository.bindRunSession(
          run.id,
          run.revision,
          session.sessionId,
          session.sessionPath,
        );
      }
      this.repository.upsertRunStep(run.id, "session", "done", {
        sessionId: session.sessionId,
      });
    } else {
      await this.dependencies.attachSession(
        run.worktreeId!,
        run.sessionId,
        integration,
      );
      if (
        this.repository
          .listRunSteps(run.id)
          .find((step) => step.step === "session")?.state !== "done"
      )
        this.repository.upsertRunStep(run.id, "session", "done", {
          sessionId: run.sessionId,
        });
    }

    if (
      run.status === "running" &&
      (await this.dependencies.sessionStatus(
        run.worktreeId!,
        run.sessionId!,
      )) === "idle"
    ) {
      const settled = this.repository.transitionRun(
        run.id,
        run.revision,
        "awaiting_report",
        { sagaPhase: "active", settledAt: Date.now() },
      );
      this.repository.appendEvent(task.id, run.id, "run.awaiting_report");
      await this.#notify(task.id, run.id, "awaiting_report");
      await this.#scheduleQueued();
      return this.get(settled.task.id);
    }

    if (run.status === "prompting") {
      this.repository.upsertRunStep(run.id, "prompt", "intent", {
        marker: run.promptMarker,
      });
      const alreadySent = await this.dependencies.sessionHasPrompt(
        run.worktreeId!,
        run.sessionId!,
        run.promptMarker,
      );
      if (!alreadySent) {
        const accepted = await this.dependencies.sendPrompt(
          run.worktreeId!,
          run.sessionId!,
          buildTaskPrompt(task, run, changeNote),
        );
        if (!accepted.accepted)
          throw new TaskServiceError(
            "TASK_PROMPT_FAILED",
            "Task prompt was not accepted",
            true,
          );
      }
      await this.dependencies.renameSession(
        run.worktreeId!,
        run.sessionId!,
        taskSessionName(run.id),
      );
      this.repository.upsertRunStep(run.id, "prompt", "done", {
        marker: run.promptMarker,
      });
      run = this.repository.transitionRun(run.id, run.revision, "running", {
        sagaPhase: "active",
      }).run;
      this.repository.appendEvent(task.id, run.id, "run.started");
    }
    return this.get(task.id);
  }

  #integration(runId: string): TaskSessionIntegration {
    const existing = this.#integrations.get(runId);
    if (existing) return existing;
    const integration: TaskSessionIntegration = {
      sessionId: runId,
      reportTool: TASK_REPORT_TOOL_DESCRIPTION,
      reportResult: async (input) => {
        if (input.runId !== runId)
          throw new TaskServiceError(
            "TASK_RESULT_INVALID",
            "Report runId does not match the bound run",
          );
        const allowedKeys = new Set([
          "runId",
          "outcome",
          "summary",
          "tests",
          ...(input.changeRequest ? ["changeRequest"] : []),
        ]);
        if (Object.keys(input).some((key) => !allowedKeys.has(key)))
          throw new TaskServiceError(
            "TASK_RESULT_INVALID",
            "Report contains unsupported fields",
          );
        const report: TaskRunReport = {
          outcome: input.outcome,
          summary: input.summary,
          tests: input.tests,
          ...(input.changeRequest
            ? { changeRequest: input.changeRequest }
            : {}),
        };
        const run = this.#requireRun(runId);
        const result = this.repository.reportRun(runId, run.revision, report);
        this.repository.appendEvent(result.task.id, runId, "run.reported");
        await this.#notify(result.task.id, runId, "needs_review");
        await this.#scheduleQueued();
        return this.get(result.task.id);
      },
      onEvent: (event) => {
        this.#enqueue(async () => {
          const run = this.repository.getRun(runId);
          if (!run) return;
          if (event.type === "agent_settled" && run.status === "running") {
            const result = this.repository.transitionRun(
              run.id,
              run.revision,
              "awaiting_report",
              {
                sagaPhase: "active",
                settledAt: Date.now(),
              },
            );
            this.repository.appendEvent(
              result.task.id,
              run.id,
              "run.awaiting_report",
            );
            await this.#notify(result.task.id, run.id, "awaiting_report");
            await this.#scheduleQueued();
          } else if (
            event.type === "agent_start" &&
            run.status === "awaiting_report"
          ) {
            await this.#withStartLock(async () => {
              const current = this.repository.getRun(run.id);
              if (!current || current.status !== "awaiting_report") return;
              if (!this.#hasExecutionSlot()) {
                if (current.worktreeId && current.sessionId)
                  await this.dependencies.abortSession(
                    current.worktreeId,
                    current.sessionId,
                  );
                return;
              }
              this.repository.transitionRun(
                current.id,
                current.revision,
                "running",
                { sagaPhase: "active" },
              );
            });
          }
        });
      },
    };
    this.#integrations.set(runId, integration);
    return integration;
  }

  async #notify(
    taskId: string,
    runId: string,
    kind: TaskNotificationRequest["kind"],
  ): Promise<void> {
    if (!this.repository.createNotification(taskId, runId, kind)) return;
    try {
      await this.dependencies.notify({ taskId, runId, kind });
    } catch {
      // Notifications are best effort and never change the durable Task state.
    }
  }

  async #recordFailure(runId: string, cause: unknown): Promise<void> {
    const run = this.repository.getRun(runId);
    if (!run || ["reported", "failed", "cancelled"].includes(run.status))
      return;
    const error = this.#serviceError(cause);
    try {
      const result = this.repository.failRun(run.id, run.revision, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
      this.repository.upsertRunStep(run.id, "failure", "failed", {
        code: error.code,
      });
      this.repository.appendEvent(result.task.id, run.id, "run.failed", {
        code: error.code,
      });
      await this.#notify(result.task.id, run.id, "failed");
      await this.#scheduleQueued();
    } catch (failure) {
      if (!(
        failure instanceof TaskRepositoryError &&
        failure.code === "TASK_CONFLICT"
      ))
        throw failure;
    }
  }

  async #requireProject(projectId: string): Promise<TaskProjectBinding> {
    const project = await this.dependencies.getProject(projectId);
    if (!project || project.id !== projectId)
      throw new TaskServiceError(
        "TASK_PROJECT_NOT_FOUND",
        "Project was not found",
      );
    return project;
  }

  async #requireOwnedWorktree(
    projectId: string,
    worktreeId: string,
    allowDirty: boolean,
  ): Promise<TaskWorktreeBinding> {
    const worktree = await this.dependencies.getWorktree(worktreeId);
    if (!worktree)
      throw new TaskServiceError(
        "TASK_WORKSPACE_NOT_FOUND",
        "Workspace was not found",
      );
    this.#assertWorktreeOwner(worktree, projectId);
    if (worktree.busy)
      throw new TaskServiceError(
        "TASK_WORKSPACE_BUSY",
        "Workspace already has an active task",
      );
    if (worktree.dirty && !allowDirty)
      throw new TaskServiceError(
        "TASK_WORKSPACE_DIRTY_CONFIRMATION_REQUIRED",
        "Dirty workspace requires explicit confirmation",
      );
    return worktree;
  }

  #assertWorktreeAvailable(worktreeId: string | null, taskId: string): void {
    if (!worktreeId) return;
    if (
      this.repository
        .listActiveRuns()
        .some((run) => run.taskId !== taskId && run.worktreeId === worktreeId)
    )
      throw new TaskServiceError(
        "TASK_WORKSPACE_BUSY",
        "Workspace already has an active task",
      );
  }

  #assertWorktreeOwner(worktree: TaskWorktreeBinding, projectId: string): void {
    if (worktree.projectId !== projectId)
      throw new TaskServiceError(
        "TASK_WORKSPACE_NOT_FOUND",
        "Workspace does not belong to the project",
      );
  }

  #requireTask(taskId: string): Task {
    const task = this.repository.getTask(taskId);
    if (!task)
      throw new TaskServiceError("TASK_NOT_FOUND", "Task was not found");
    return task;
  }

  #requireRun(runId: string): TaskRun {
    const run = this.repository.getRun(runId);
    if (!run)
      throw new TaskServiceError("TASK_NOT_FOUND", "Task run was not found");
    return run;
  }

  #singleFlight(
    taskId: string,
    operation: () => Promise<TaskDetail>,
  ): Promise<TaskDetail> {
    const current = this.#inFlight.get(taskId);
    if (current) return current;
    const promise = operation().finally(() => {
      if (this.#inFlight.get(taskId) === promise) this.#inFlight.delete(taskId);
    });
    this.#inFlight.set(taskId, promise);
    return promise;
  }

  #enqueue(operation: () => Promise<void>): void {
    const pending = operation()
      .catch(() => undefined)
      .finally(() => this.#background.delete(pending));
    this.#background.add(pending);
  }

  #serviceError(error: unknown): TaskServiceError {
    if (error instanceof TaskServiceError) return error;
    if (error instanceof TaskRepositoryError) {
      const code =
        error.code === "TASK_RUN_NOT_FOUND" ||
        error.code === "TASK_ACTIVE_RUN_EXISTS"
          ? "TASK_INVALID_STATE"
          : error.code;
      return new TaskServiceError(
        code as TaskServiceErrorCode,
        error.message,
        false,
        { cause: error },
      );
    }
    return new TaskServiceError(
      "TASK_FAILED",
      "Task orchestration failed",
      true,
      { cause: error },
    );
  }

  #assertAvailable(): void {
    if (this.#disposed)
      throw new TaskServiceError("TASK_FAILED", "Task service is disposed");
  }
}

function managedWorktreeName(runId: string, title: string): string {
  const slug =
    title
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 33) || "task";
  return `task-${runId.slice(0, 8)}-${slug}`;
}
