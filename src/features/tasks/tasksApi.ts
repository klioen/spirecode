import { commands, subscribeTaskEvent } from "../../bindings";

export type TaskStatus =
  | "backlog"
  | "queued"
  | "running"
  | "needs_review"
  | "completed"
  | "failed"
  | "cancelled";

export type TaskRunStatus =
  | "queued"
  | "provisioning"
  | "prompting"
  | "running"
  | "awaiting_report"
  | "reported"
  | "failed"
  | "cancelled";

export type TaskWorkspace =
  | { mode: "new_managed"; baseRef: string }
  | { mode: "existing"; worktreeId: string; allowDirty: boolean };

export interface TaskSummary {
  id: string;
  title: string;
  projectId: string;
  projectName?: string;
  workspace: TaskWorkspace;
  status: TaskStatus;
  activeRunId: string | null;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface TaskRunReport {
  outcome: "success" | "blocked" | "failed";
  summary: string;
  tests: Array<{
    command: string;
    status: "passed" | "failed" | "not_run";
    summary: string;
  }>;
  changeRequest?: {
    kind: "github_pr" | "gitlab_mr" | "other";
    url: string;
    draft: true;
  };
}

export interface TaskRunSummary {
  id: string;
  attempt: number;
  status: TaskRunStatus;
  worktreeId: string | null;
  worktreeName: string | null;
  sessionId: string | null;
  error: { code: string; message: string; retryable: boolean } | null;
  report: TaskRunReport | null;
  createdAt: number;
  settledAt: number | null;
}

export interface TaskDetailValue extends TaskSummary {
  description: string;
  automationEnabled: boolean;
  completedAt: number | null;
  runs: TaskRunSummary[];
}

export interface TaskListPage {
  items: TaskSummary[];
  nextCursor: string | null;
  incompleteCount?: number;
  activeCount?: number;
}

export interface CreateTaskInput {
  title: string;
  description: string;
  projectId: string;
  workspace: TaskWorkspace;
  automationEnabled: boolean;
}

export type UpdateTaskInput = Partial<
  Pick<
    CreateTaskInput,
    "title" | "description" | "workspace" | "automationEnabled"
  >
>;

export interface TaskNotificationValue {
  taskId: string;
  runId: string | null;
  kind: string;
  appReadAt: number | null;
  systemSentAt: number | null;
  createdAt: number;
}

export interface TaskRewriteInput {
  title: string;
  description: string;
}

export type TaskEvent =
  | {
      kind: "changed" | "notification";
      taskId?: string;
      runId?: string;
      revision?: number;
      payload?: { navigate?: boolean };
    }
  | {
      kind: "rewrite_result";
      rewriteId: string;
      payload: TaskRewriteInput;
    }
  | {
      kind: "rewrite_failed";
      rewriteId: string;
      payload?: { message?: string };
    };

export interface TasksApi {
  list(input: {
    cursor?: string;
    limit: number;
    statuses?: TaskStatus[];
  }): Promise<TaskListPage>;
  get(taskId: string): Promise<TaskDetailValue>;
  create(input: CreateTaskInput): Promise<TaskDetailValue>;
  update(
    taskId: string,
    expectedRevision: number,
    patch: UpdateTaskInput,
  ): Promise<TaskDetailValue>;
  notificationsList(input: {
    cursor?: string;
    limit: number;
  }): Promise<{ items: TaskNotificationValue[]; nextCursor: string | null }>;
  notificationMarkRead(
    taskId: string,
    runId: string | null,
    kind: string,
  ): Promise<void>;
  run(taskId: string, expectedRevision: number): Promise<TaskDetailValue>;
  cancel(taskId: string, expectedRevision: number): Promise<TaskDetailValue>;
  complete(taskId: string, expectedRevision: number): Promise<TaskDetailValue>;
  requestChanges(
    taskId: string,
    expectedRevision: number,
    note: string,
  ): Promise<TaskDetailValue>;
  continueForReport(
    taskId: string,
    expectedRevision: number,
  ): Promise<TaskDetailValue>;
  rewriteStart(
    input: TaskRewriteInput,
    rewriteId?: string,
  ): Promise<{ rewriteId: string }>;
  rewriteAbort(rewriteId: string): Promise<void>;
  subscribe(listener: (event: TaskEvent) => void): () => void;
}

/** Shape expected from the future allowlisted bindings extension. */
export interface TaskHostBindings {
  taskList: TasksApi["list"];
  taskGet(input: { taskId: string }): Promise<TaskDetailValue>;
  taskCreate: TasksApi["create"];
  taskUpdate(input: {
    taskId: string;
    expectedRevision: number;
    patch: UpdateTaskInput;
  }): Promise<TaskDetailValue>;
  taskNotificationsList: TasksApi["notificationsList"];
  taskNotificationMarkRead(input: {
    taskId: string;
    runId: string | null;
    kind: string;
  }): Promise<void>;
  taskRun(input: {
    taskId: string;
    expectedRevision: number;
  }): Promise<TaskDetailValue>;
  taskCancel(input: {
    taskId: string;
    expectedRevision: number;
  }): Promise<TaskDetailValue>;
  taskComplete(input: {
    taskId: string;
    expectedRevision: number;
  }): Promise<TaskDetailValue>;
  taskRequestChanges(input: {
    taskId: string;
    expectedRevision: number;
    note: string;
  }): Promise<TaskDetailValue>;
  taskContinueForReport(input: {
    taskId: string;
    expectedRevision: number;
  }): Promise<TaskDetailValue>;
  taskRewriteStart: TasksApi["rewriteStart"];
  taskRewriteAbort(input: { rewriteId: string }): Promise<void>;
  subscribeTaskEvents(listener: (event: TaskEvent) => void): () => void;
}

export const createHostTasksApi = (host: TaskHostBindings): TasksApi => ({
  list: (input) => host.taskList(input),
  get: (taskId) => host.taskGet({ taskId }),
  create: (input) => host.taskCreate(input),
  update: (taskId, expectedRevision, patch) =>
    host.taskUpdate({ taskId, expectedRevision, patch }),
  notificationsList: (input) => host.taskNotificationsList(input),
  notificationMarkRead: (taskId, runId, kind) =>
    host.taskNotificationMarkRead({ taskId, runId, kind }),
  run: (taskId, expectedRevision) => host.taskRun({ taskId, expectedRevision }),
  cancel: (taskId, expectedRevision) =>
    host.taskCancel({ taskId, expectedRevision }),
  complete: (taskId, expectedRevision) =>
    host.taskComplete({ taskId, expectedRevision }),
  requestChanges: (taskId, expectedRevision, note) =>
    host.taskRequestChanges({ taskId, expectedRevision, note }),
  continueForReport: (taskId, expectedRevision) =>
    host.taskContinueForReport({ taskId, expectedRevision }),
  rewriteStart: (input) => host.taskRewriteStart(input),
  rewriteAbort: (rewriteId) => host.taskRewriteAbort({ rewriteId }),
  subscribe: (listener) => host.subscribeTaskEvents(listener),
});

export const tasksApi: TasksApi = {
  list: (input) => commands.taskList(input) as Promise<TaskListPage>,
  get: (taskId) => commands.taskGet(taskId) as Promise<TaskDetailValue>,
  create: (input) =>
    commands.taskCreate(
      input as unknown as Record<string, unknown>,
    ) as Promise<TaskDetailValue>,
  update: (taskId, expectedRevision, patch) =>
    commands.taskUpdate(
      taskId,
      expectedRevision,
      patch as Record<string, unknown>,
    ) as Promise<TaskDetailValue>,
  notificationsList: (input) =>
    commands.taskNotificationsList(input) as Promise<{
      items: TaskNotificationValue[];
      nextCursor: string | null;
    }>,
  notificationMarkRead: (taskId, runId, kind) =>
    commands.taskNotificationMarkRead(taskId, runId, kind),
  run: (taskId, expectedRevision) =>
    commands.taskRun(taskId, expectedRevision) as Promise<TaskDetailValue>,
  cancel: (taskId, expectedRevision) =>
    commands.taskCancel(taskId, expectedRevision) as Promise<TaskDetailValue>,
  complete: (taskId, expectedRevision) =>
    commands.taskComplete(taskId, expectedRevision) as Promise<TaskDetailValue>,
  requestChanges: (taskId, expectedRevision, note) =>
    commands.taskRequestChanges(
      taskId,
      expectedRevision,
      note,
    ) as Promise<TaskDetailValue>,
  continueForReport: (taskId, expectedRevision) =>
    commands.taskContinueForReport(
      taskId,
      expectedRevision,
    ) as Promise<TaskDetailValue>,
  async rewriteStart(input, requestedRewriteId) {
    const rewriteId = requestedRewriteId ?? crypto.randomUUID();
    await commands.taskRewriteStart(
      rewriteId,
      input as unknown as Record<string, unknown>,
    );
    return { rewriteId };
  },
  rewriteAbort: (rewriteId) => commands.taskRewriteAbort(rewriteId),
  subscribe: (listener) => subscribeTaskEvent(listener),
};
