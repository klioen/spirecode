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
import {
  taskDeliveryBranch,
  TaskDeliveryError,
  type ChangeRequest,
  type GitDeliveryResult,
  type GitDeliveryStart,
} from "./delivery.js";
import type {
  CreateRunInput,
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
  | "TASK_WORKSPACE_NOT_MANAGED"
  | "TASK_WORKSPACE_REFERENCED"
  | "TASK_PROMPT_FAILED"
  | "TASK_RESULT_INVALID"
  | `TASK_DELIVERY_${string}`
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
  missing?: boolean;
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
  inspectWorktreeForCleanup(
    worktreeId: string,
  ): Promise<TaskWorktreeBinding | null>;
  createWorktree(
    projectId: string,
    name: string,
    baseRef: string,
    taskId?: string,
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
  loadSession(
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
  isWorktreeBusy(worktreeId: string): Promise<boolean>;
  deleteWorktree(worktreeId: string): Promise<void>;
  inspectGitDelivery(
    worktreeId: string,
    input: {
      mode: "new_managed" | "existing";
      branch: string;
      baseRef: string | null;
      persistedTarget: string | null;
    },
  ): Promise<GitDeliveryStart>;
  activateGitDelivery(
    worktreeId: string,
    start: GitDeliveryStart,
  ): Promise<void>;
  deliverGitChanges(
    worktreeId: string,
    input: {
      start: GitDeliveryStart;
      title: string;
      summary: string;
      priorChangeRequest?: ChangeRequest;
    },
  ): Promise<GitDeliveryResult>;
  notify(request: TaskNotificationRequest): void | Promise<void>;
  onChanged?: (taskId: string, revision: number) => void;
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
  reuseWorktree?: TaskRun;
  reuseSession?: TaskRun;
}

/** Main-owned Task orchestration. All Git, workspace, and session effects are injected. */
export class TaskService {
  readonly #uuid: () => string;
  readonly #inFlight = new Map<string, Promise<TaskDetail>>();
  readonly #background = new Set<Promise<void>>();
  readonly #integrations = new Map<string, TaskSessionIntegration>();
  readonly #settling = new Map<string, Promise<TaskDetail>>();
  #startTail: Promise<void> = Promise.resolve();
  #scheduling = false;
  #wakeScheduled = false;
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

  markAllNotificationsRead(): void {
    this.repository.markAllNotificationsRead();
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

  async create(
    input: CreateTaskRequest,
    idempotencyId?: string,
  ): Promise<TaskDetail> {
    this.#assertAvailable();
    if (idempotencyId) {
      const existing = this.repository.getTask(idempotencyId);
      if (existing) {
        if (
          existing.projectId !== input.projectId ||
          existing.title !== input.title.trim() ||
          existing.description !== input.description.trim() ||
          JSON.stringify(existing.workspace) !==
            JSON.stringify(input.workspace) ||
          existing.automationEnabled !== input.automationEnabled
        )
          throw new TaskServiceError(
            "TASK_CONFLICT",
            "Idempotent Task input does not match the submitted Task",
          );
        return this.get(idempotencyId);
      }
    }
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

    const task = this.repository.createTask(
      {
        id: idempotencyId ?? this.#uuid(),
        title: input.title,
        description: input.description,
        projectId: input.projectId,
        workspace: input.workspace,
        automationEnabled: input.automationEnabled,
      },
      input.automationEnabled ? this.#buildRunInput(input, {}) : undefined,
    );
    this.repository.appendEvent(task.id, null, "task.created");
    this.#emitChanged(task.id);
    if (task.automationEnabled) this.#requestSchedule();
    return this.get(task.id);
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
      const latestRun = this.repository.listAllRuns(taskId)[0];
      const deliveryRetry =
        task.status === "failed" &&
        latestRun?.status === "failed" &&
        latestRun.report &&
        this.repository
          .listRunSteps(latestRun.id)
          .some((step) => step.step === "git_delivery");
      if (deliveryRetry) {
        const resumed = this.repository.retryRunDelivery(
          latestRun.id,
          expectedRevision,
        );
        this.repository.appendEvent(taskId, latestRun.id, "delivery.retried");
        this.#enqueue(async () => {
          try {
            await this.#settleRun(resumed.run.id);
          } catch (error) {
            await this.#recordFailure(resumed.run.id, error);
          } finally {
            this.#emitChanged(taskId);
          }
        });
        return this.get(taskId);
      }
      const reuseWorktree = task.resolvedWorktreeId
        ? this.repository
            .listAllRuns(taskId)
            .find((run) => run.worktreeId === task.resolvedWorktreeId)
        : undefined;
      this.#createRun(task, { reuseWorktree });
      this.#requestSchedule();
      return this.get(taskId);
    });
  }

  async cancel(taskId: string, expectedRevision: number): Promise<TaskDetail> {
    this.#assertAvailable();
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
    const runId = task.activeRunId;
    this.repository.upsertRunStep(runId, "cancel", "intent");
    const executing = this.#inFlight.get(taskId);
    if (executing) await executing.catch(() => undefined);
    return this.#singleFlight(taskId, async () => {
      const run = this.#requireRun(runId);
      if (run.status === "cancelled") return this.get(taskId);
      return this.#cancelActiveRun(run);
    });
  }

  #hasCancelIntent(runId: string): boolean {
    return this.repository
      .listRunSteps(runId)
      .some((step) => step.step === "cancel" && step.state === "intent");
  }

  async #cancelActiveRun(run: TaskRun): Promise<TaskDetail> {
    if (run.worktreeId && run.sessionId)
      await this.dependencies.abortSession(run.worktreeId, run.sessionId);
    const current = this.#requireRun(run.id);
    this.repository.cancelRun(current.id, current.revision);
    this.repository.upsertRunStep(current.id, "cancel", "done");
    this.repository.appendEvent(current.taskId, current.id, "run.cancelled");
    this.#requestSchedule();
    return this.get(current.taskId);
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

  cleanupWorkspace(
    taskId: string,
    expectedRevision: number,
  ): Promise<TaskDetail> {
    this.#assertAvailable();
    return this.#singleFlight(taskId, () =>
      this.#cleanupWorkspace(taskId, expectedRevision),
    );
  }

  async #cleanupWorkspace(
    taskId: string,
    expectedRevision: number,
  ): Promise<TaskDetail> {
    let task = this.#requireTask(taskId);
    if (task.revision !== expectedRevision)
      throw new TaskServiceError(
        "TASK_CONFLICT",
        "Task revision does not match",
      );
    if (
      task.status !== "completed" ||
      task.activeRunId ||
      !task.resolvedWorktreeId ||
      !task.ownsManagedWorktree ||
      task.workspaceCleanupStatus === "removed"
    )
      throw new TaskServiceError(
        "TASK_INVALID_STATE",
        "Task workspace cannot be cleaned up",
      );
    if (task.workspaceCleanupStatus !== "intent")
      task = this.repository.beginWorkspaceCleanup(task.id, task.revision);

    const block = (code: TaskServiceErrorCode, message: string) => {
      const current = this.#requireTask(taskId);
      this.repository.blockWorkspaceCleanup(taskId, current.revision, code);
      this.repository.appendEvent(taskId, null, "workspace.cleanup_blocked", {
        code,
        message,
      });
      return this.get(taskId);
    };

    const worktreeId = task.resolvedWorktreeId!;
    let worktree: TaskWorktreeBinding | null;
    try {
      worktree = await this.dependencies.inspectWorktreeForCleanup(worktreeId);
    } catch {
      return block(
        "TASK_WORKSPACE_NOT_MANAGED",
        "Managed workspace ownership could not be verified",
      );
    }
    if (!worktree) {
      const current = this.#requireTask(taskId);
      this.repository.finishWorkspaceCleanup(taskId, current.revision);
      this.repository.appendEvent(taskId, null, "workspace.cleaned");
      return this.get(taskId);
    }
    if (worktree.projectId !== task.projectId)
      return block(
        "TASK_WORKSPACE_NOT_MANAGED",
        "Workspace ownership does not match the Task",
      );
    const ownerRun = this.repository
      .listAllRuns(taskId)
      .find((run) => run.worktreeId === worktreeId && run.ownsManagedWorktree);
    if (!ownerRun?.worktreeName)
      return block(
        "TASK_WORKSPACE_NOT_MANAGED",
        "Managed workspace identity is missing",
      );
    if (!worktree.missing)
      try {
        await this.dependencies.validateManagedWorktree(
          worktreeId,
          ownerRun.worktreeName,
          ownerRun.baseRef,
        );
      } catch {
        return block(
          "TASK_WORKSPACE_NOT_MANAGED",
          "Managed workspace ownership could not be verified",
        );
      }
    const referenced = this.repository
      .listTasksByResolvedWorktreeId(worktreeId)
      .some(
        (candidate) =>
          candidate.id !== taskId &&
          candidate.workspaceCleanupStatus !== "removed",
      );
    if (referenced)
      return block(
        "TASK_WORKSPACE_REFERENCED",
        "Workspace is referenced by another Task",
      );
    if (worktree.dirty)
      return block(
        "TASK_WORKSPACE_DIRTY_CONFIRMATION_REQUIRED",
        "Dirty managed workspace was retained",
      );
    if (worktree.busy || (await this.dependencies.isWorktreeBusy(worktreeId)))
      return block(
        "TASK_WORKSPACE_BUSY",
        "Busy managed workspace was retained",
      );
    try {
      await this.dependencies.deleteWorktree(worktreeId);
    } catch (error) {
      const worktreeCode =
        typeof error === "object" && error !== null && "code" in error
          ? String(error.code)
          : "";
      const code: TaskServiceErrorCode =
        worktreeCode === "WORKTREE_DIRTY"
          ? "TASK_WORKSPACE_DIRTY_CONFIRMATION_REQUIRED"
          : worktreeCode === "WORKTREE_BUSY"
            ? "TASK_WORKSPACE_BUSY"
            : worktreeCode === "WORKTREE_CONFLICT"
              ? "TASK_WORKSPACE_NOT_MANAGED"
              : "TASK_FAILED";
      return block(code, "Workspace cleanup failed");
    }
    const current = this.#requireTask(taskId);
    this.repository.finishWorkspaceCleanup(taskId, current.revision);
    this.repository.appendEvent(taskId, null, "workspace.cleaned");
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
      const reuseWorktree = task.resolvedWorktreeId
        ? this.repository
            .listAllRuns(taskId)
            .find((run) => run.worktreeId === task.resolvedWorktreeId)
        : undefined;
      if (!previous?.sessionId || !reuseWorktree?.worktreeId)
        throw new TaskServiceError(
          "TASK_WORKSPACE_NOT_FOUND",
          "Previous workspace or session is missing",
        );
      const run = this.#createRun(task, {
        reuseWorktree,
        reuseSession: previous,
      });
      this.repository.upsertRunStep(run.id, "request_changes", "done", {
        note: normalized,
      });
      this.repository.appendEvent(taskId, run.id, "task.changes_requested");
      this.#requestSchedule();
      return this.get(taskId);
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
    for (const task of this.repository.listWorkspaceCleanupIntents()) {
      try {
        await this.#singleFlight(task.id, () =>
          this.#cleanupWorkspace(task.id, task.revision),
        );
      } catch {
        // The durable blocked state explains why a cleanup could not resume.
      }
    }
    for (const active of this.repository.listActiveRuns()) {
      if (active.status === "queued") continue;
      try {
        await this.#singleFlight(active.taskId, () =>
          this.#orchestrate(active.id),
        );
        this.repository.appendEvent(active.taskId, active.id, "run.recovered");
      } catch (error) {
        await this.#recordFailure(active.id, error);
      }
    }
    this.#requestSchedule();
  }

  async whenIdle(): Promise<void> {
    while (this.#background.size > 0) await Promise.all([...this.#background]);
  }

  async dispose(): Promise<void> {
    this.#disposed = true;
    await this.whenIdle();
  }

  #createRun(task: Task, options: StartRunOptions): TaskRun {
    return this.repository.createRun(
      task.id,
      task.revision,
      this.#buildRunInput(task, options),
    ).run;
  }

  #buildRunInput(
    task: Pick<Task, "title" | "projectId" | "workspace">,
    options: StartRunOptions,
  ): CreateRunInput {
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
    return {
      id,
      projectId: task.projectId,
      promptMarker: taskRunMarker(id),
      ownsManagedWorktree,
      worktreeName,
      baseRef:
        previous?.baseRef ??
        (task.workspace.mode === "new_managed" ? task.workspace.baseRef : null),
      worktreeId,
      sessionId: options.reuseSession?.sessionId,
      sessionPath: options.reuseSession?.sessionPath,
    };
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

  #requestSchedule(): void {
    if (this.#disposed || this.#wakeScheduled) return;
    this.#wakeScheduled = true;
    this.#enqueue(async () => {
      await new Promise<void>((resolve) => setImmediate(resolve));
      this.#wakeScheduled = false;
      if (!this.#disposed) await this.#scheduleQueued();
    });
  }

  #emitChanged(taskId: string): void {
    const task = this.repository.getTask(taskId);
    try {
      if (task) this.dependencies.onChanged?.(task.id, task.revision);
    } catch {
      return;
    }
  }

  async #scheduleQueued(): Promise<void> {
    if (this.#scheduling || this.#disposed) return;
    this.#scheduling = true;
    try {
      while (!this.#disposed) {
        const claimed = await this.#withStartLock(async () => {
          if (this.#disposed || !this.#hasExecutionSlot()) return null;
          const queued = this.repository
            .listActiveRuns()
            .find(
              (run) =>
                run.status === "queued" &&
                !this.#worktreeHasActiveRun(run.worktreeId, run.taskId),
            );
          if (!queued) return null;
          return this.repository.transitionRun(
            queued.id,
            queued.revision,
            "provisioning",
            {
              sagaPhase: "workspace_intent",
              taskStatus: "running",
            },
          ).run;
        });
        if (!claimed) break;
        this.#emitChanged(claimed.taskId);
        this.#enqueue(async () => {
          try {
            await this.#singleFlight(claimed.taskId, () =>
              this.#orchestrate(claimed.id),
            );
          } catch (error) {
            await this.#recordFailure(claimed.id, error);
          } finally {
            this.#emitChanged(claimed.taskId);
            this.#requestSchedule();
          }
        });
      }
    } finally {
      this.#scheduling = false;
    }
  }

  async #orchestrate(runId: string, changeNote?: string): Promise<TaskDetail> {
    let run = this.#requireRun(runId);
    if (["reported", "failed", "cancelled"].includes(run.status))
      return this.get(run.taskId);
    const task = this.#requireTask(run.taskId);
    const project = await this.#requireProject(task.projectId);
    const steps = this.repository.listRunSteps(run.id);
    const cancelStep = steps.find((step) => step.step === "cancel");
    if (cancelStep?.state === "intent") return this.#cancelActiveRun(run);
    const failureStop = steps.find((step) => step.step === "failure_stop");
    if (failureStop) {
      const details = failureStop.details;
      const code =
        typeof details === "object" &&
        details !== null &&
        "code" in details &&
        typeof details.code === "string"
          ? (details.code as TaskServiceErrorCode)
          : "TASK_FAILED";
      const message =
        typeof details === "object" &&
        details !== null &&
        "failureMessage" in details &&
        typeof details.failureMessage === "string"
          ? details.failureMessage
          : "Task orchestration failed";
      const retryable =
        typeof details === "object" &&
        details !== null &&
        "retryable" in details &&
        details.retryable === true;
      let sessionAlreadyStopped = failureStop.state === "done";
      if (!sessionAlreadyStopped && run.worktreeId && run.sessionId)
        try {
          await this.dependencies.loadSession(
            run.worktreeId,
            run.sessionId,
            this.#integration(run.id),
          );
        } catch (loadError) {
          if (
            typeof loadError === "object" &&
            loadError !== null &&
            "code" in loadError &&
            loadError.code === "CHAT_SESSION_NOT_FOUND"
          )
            sessionAlreadyStopped = true;
          else throw loadError;
        }
      await this.#stopAndFail(
        run,
        new TaskServiceError(code, message, retryable),
        sessionAlreadyStopped,
      );
      return this.get(task.id);
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

    if (run.status === "queued") {
      run = this.repository.transitionRun(
        run.id,
        run.revision,
        "provisioning",
        {
          sagaPhase: "workspace_intent",
          taskStatus: "running",
        },
      ).run;
      this.#emitChanged(task.id);
    }

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
            task.id,
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

    if (this.#hasCancelIntent(run.id))
      return this.#cancelActiveRun(this.#requireRun(run.id));

    if (run.ownsManagedWorktree)
      await this.dependencies.validateManagedWorktree(
        run.worktreeId!,
        run.worktreeName!,
        run.baseRef,
      );

    if (project.kind === "git") {
      const startStep = this.repository
        .listRunSteps(run.id)
        .find((step) => step.step === "git_start");
      let start = parseGitDeliveryStart(startStep?.details);
      if (!start) {
        const previous = this.#previousDelivery(run);
        start = await this.dependencies.inspectGitDelivery(run.worktreeId!, {
          mode: task.workspace.mode,
          branch: run.ownsManagedWorktree
            ? run.worktreeName!
            : taskDeliveryBranch(task.id),
          baseRef: run.baseRef,
          persistedTarget: previous?.start.target ?? null,
        });
        this.repository.upsertRunStep(run.id, "git_start", "intent", start);
      }
      await this.dependencies.activateGitDelivery(run.worktreeId!, start);
      this.repository.upsertRunStep(run.id, "git_start", "done", start);
    }

    if (this.#hasCancelIntent(run.id))
      return this.#cancelActiveRun(this.#requireRun(run.id));

    if (run.status === "provisioning") {
      run = this.repository.transitionRun(run.id, run.revision, "prompting", {
        sagaPhase: "session_intent",
      }).run;
      this.#emitChanged(task.id);
    }

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
      try {
        await this.dependencies.attachSession(
          run.worktreeId!,
          run.sessionId,
          integration,
        );
      } catch (error) {
        const promptStep = this.repository
          .listRunSteps(run.id)
          .find((step) => step.step === "prompt");
        if (
          run.status !== "prompting" ||
          promptStep?.state === "done" ||
          !hasErrorCode(error, "CHAT_SESSION_NOT_FOUND")
        )
          throw error;
        const session = await this.dependencies.createSession(
          run.worktreeId!,
          integration,
        );
        run = this.repository.bindRunSession(
          run.id,
          run.revision,
          session.sessionId,
          session.sessionPath,
        );
      }
      if (
        this.repository
          .listRunSteps(run.id)
          .find((step) => step.step === "session")?.state !== "done"
      )
        this.repository.upsertRunStep(run.id, "session", "done", {
          sessionId: run.sessionId,
        });
    }

    if (this.#hasCancelIntent(run.id))
      return this.#cancelActiveRun(this.#requireRun(run.id));

    if (
      (run.status === "running" ||
        (run.status === "awaiting_report" && run.report)) &&
      (await this.dependencies.sessionStatus(
        run.worktreeId!,
        run.sessionId!,
      )) === "idle"
    )
      return this.#settleRun(run.id);

    if (run.status === "prompting") {
      this.repository.upsertRunStep(run.id, "prompt", "intent", {
        marker: run.promptMarker,
      });
      const alreadySent = await this.dependencies.sessionHasPrompt(
        run.worktreeId!,
        run.sessionId!,
        run.promptMarker,
      );
      if (this.#hasCancelIntent(run.id))
        return this.#cancelActiveRun(this.#requireRun(run.id));
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
      run = this.#requireRun(run.id);
      if (this.#hasCancelIntent(run.id)) return this.#cancelActiveRun(run);
      await this.dependencies.renameSession(
        run.worktreeId!,
        run.sessionId!,
        taskSessionName(run.id),
      );
      this.repository.upsertRunStep(run.id, "prompt", "done", {
        marker: run.promptMarker,
      });
      run = this.#requireRun(run.id);
      if (this.#hasCancelIntent(run.id)) return this.#cancelActiveRun(run);
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
        };
        const run = this.#requireRun(runId);
        const result = this.repository.reportRun(runId, run.revision, report);
        this.repository.appendEvent(
          result.task.id,
          runId,
          "run.report_received",
        );
        this.#emitChanged(result.task.id);
        if (
          result.run.status === "awaiting_report" &&
          result.run.worktreeId &&
          result.run.sessionId
        ) {
          try {
            if (
              (await this.dependencies.sessionStatus(
                result.run.worktreeId,
                result.run.sessionId,
              )) === "idle"
            )
              return this.#settleRun(runId);
          } catch {
            // The report is durable; recovery will re-open and inspect the session.
          }
        }
        return this.get(result.task.id);
      },
      onEvent: (event) => {
        this.#enqueue(async () => {
          try {
            const run = this.repository.getRun(runId);
            if (!run || this.#hasCancelIntent(run.id)) return;
            if (event.type === "agent_settled" && run.status === "running") {
              await this.#settleRun(run.id);
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
          } catch (error) {
            await this.#recordFailure(runId, error);
          }
        });
      },
    };
    this.#integrations.set(runId, integration);
    return integration;
  }

  #settleRun(runId: string): Promise<TaskDetail> {
    const existing = this.#settling.get(runId);
    if (existing) return existing;
    const settling = this.#settleRunUnlocked(runId).finally(() => {
      if (this.#settling.get(runId) === settling) this.#settling.delete(runId);
    });
    this.#settling.set(runId, settling);
    return settling;
  }

  async #settleRunUnlocked(runId: string): Promise<TaskDetail> {
    let run = this.#requireRun(runId);
    if (this.#hasCancelIntent(run.id)) return this.get(run.taskId);
    if (
      run.status !== "running" &&
      !(run.status === "awaiting_report" && run.report)
    )
      return this.get(run.taskId);
    if (run.report) {
      run = await this.#deliverReport(run);
      const result = this.repository.finalizeRunReport(
        run.id,
        run.revision,
        Date.now(),
      );
      this.repository.appendEvent(result.task.id, run.id, "run.reported");
      await this.#notify(result.task.id, run.id, "needs_review");
      this.#requestSchedule();
      return this.get(result.task.id);
    }
    const result = this.repository.transitionRun(
      run.id,
      run.revision,
      "awaiting_report",
      { sagaPhase: "active", settledAt: Date.now() },
    );
    this.repository.appendEvent(result.task.id, run.id, "run.awaiting_report");
    await this.#notify(result.task.id, run.id, "awaiting_report");
    this.#requestSchedule();
    return this.get(result.task.id);
  }

  async #deliverReport(initialRun: TaskRun): Promise<TaskRun> {
    let run = initialRun;
    const task = this.#requireTask(run.taskId);
    const project = await this.#requireProject(task.projectId);
    if (project.kind === "directory") return run;
    const startStep = this.repository
      .listRunSteps(run.id)
      .find((step) => step.step === "git_start");
    const start = parseGitDeliveryStart(startStep?.details);
    if (!start || startStep?.state !== "done")
      throw new TaskServiceError(
        "TASK_DELIVERY_FAILED",
        "The persisted Git execution start is unavailable",
        false,
      );
    const deliveryStep = this.repository
      .listRunSteps(run.id)
      .find((step) => step.step === "git_delivery");
    const completed = parseGitDeliveryResult(deliveryStep?.details);
    if (deliveryStep?.state === "done" && completed) {
      if (completed.changeRequest)
        run = this.repository.applyVerifiedReview(
          run.id,
          run.revision,
          completed.changeRequest,
        );
      return run;
    }
    const previous = this.#previousDelivery(run);
    this.repository.upsertRunStep(run.id, "git_delivery", "intent", {
      branch: start.branch,
      target: start.target,
      priorChangeRequest: previous?.changeRequest ?? null,
    });
    const delivered = await this.dependencies.deliverGitChanges(
      run.worktreeId!,
      {
        start,
        title: task.title,
        summary: run.report!.summary,
        ...(previous?.changeRequest
          ? { priorChangeRequest: previous.changeRequest }
          : {}),
      },
    );
    if (delivered.changed && !delivered.changeRequest)
      throw new TaskServiceError(
        "TASK_DELIVERY_FAILED",
        "Coding changes require a verified Ready change request",
        false,
      );
    this.repository.upsertRunStep(run.id, "git_delivery", "done", delivered);
    if (delivered.changeRequest)
      run = this.repository.applyVerifiedReview(
        run.id,
        run.revision,
        delivered.changeRequest,
      );
    return run;
  }

  #previousDelivery(run: TaskRun): {
    start: GitDeliveryStart;
    changeRequest?: ChangeRequest;
  } | null {
    for (const previous of this.repository.listAllRuns(run.taskId)) {
      if (previous.id === run.id) continue;
      const start = parseGitDeliveryStart(
        this.repository
          .listRunSteps(previous.id)
          .find((step) => step.step === "git_start")?.details,
      );
      if (!start) continue;
      const changeRequest = previous.report?.changeRequest;
      return {
        start,
        ...(changeRequest && !changeRequest.draft ? { changeRequest } : {}),
      };
    }
    return null;
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
    if (this.#hasCancelIntent(run.id)) {
      try {
        await this.#cancelActiveRun(run);
      } catch {
        // Keep the cancellation intent active for explicit retry or startup recovery.
      }
      return;
    }
    if (
      this.repository
        .listRunSteps(run.id)
        .some((step) => step.step === "failure_stop")
    )
      return;
    await this.#stopAndFail(run, this.#serviceError(cause));
  }

  async #stopAndFail(
    initialRun: TaskRun,
    error: TaskServiceError,
    stopAlreadyDone = false,
  ): Promise<void> {
    let run = initialRun;
    const failureDetails = {
      code: error.code,
      failureMessage: error.message.slice(0, 1_000),
      retryable: error.retryable,
    };
    try {
      if (run.worktreeId && run.sessionId && stopAlreadyDone)
        this.repository.upsertRunStep(
          run.id,
          "failure_stop",
          "done",
          failureDetails,
        );
      if (run.worktreeId && run.sessionId && !stopAlreadyDone) {
        this.repository.upsertRunStep(
          run.id,
          "failure_stop",
          "intent",
          failureDetails,
        );
        try {
          const status = await this.dependencies.sessionStatus(
            run.worktreeId,
            run.sessionId,
          );
          if (status === "streaming")
            await this.dependencies.abortSession(run.worktreeId, run.sessionId);
          this.repository.upsertRunStep(
            run.id,
            "failure_stop",
            "done",
            failureDetails,
          );
          run = this.#requireRun(run.id);
        } catch (stopError) {
          this.repository.upsertRunStep(run.id, "failure_stop", "failed", {
            ...failureDetails,
            stopMessage:
              stopError instanceof Error
                ? stopError.message.slice(0, 1_000)
                : "Unable to stop Task session",
          });
          this.repository.appendEvent(run.taskId, run.id, "run.stop_failed");
          return;
        }
      }
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
      this.#requestSchedule();
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

  #worktreeHasActiveRun(worktreeId: string | null, taskId: string): boolean {
    return (
      worktreeId !== null &&
      this.repository
        .listActiveRuns()
        .some(
          (run) =>
            run.taskId !== taskId &&
            run.worktreeId === worktreeId &&
            run.status !== "queued",
        )
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
    if (error instanceof TaskDeliveryError)
      return new TaskServiceError(
        error.code.startsWith("TASK_DELIVERY_")
          ? (error.code as `TASK_DELIVERY_${string}`)
          : "TASK_DELIVERY_FAILED",
        error.message,
        error.retryable,
        { cause: error },
      );
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

function parseGitDeliveryStart(value: unknown): GitDeliveryStart | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return typeof record.baselineHead === "string" &&
    typeof record.initialDirty === "boolean" &&
    typeof record.branch === "string" &&
    typeof record.target === "string"
    ? {
        baselineHead: record.baselineHead,
        initialDirty: record.initialDirty,
        branch: record.branch,
        target: record.target,
      }
    : null;
}

function parseGitDeliveryResult(value: unknown): GitDeliveryResult | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.changed !== "boolean" || typeof record.head !== "string")
    return null;
  const changeRequest = record.changeRequest as ChangeRequest | undefined;
  return {
    changed: record.changed,
    head: record.head,
    ...(changeRequest ? { changeRequest } : {}),
  };
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
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
