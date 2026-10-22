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
  workspaceName?: string;
  supportsChanges?: boolean;
  executionStatus?: TaskRunStatus;
  queueReason?: "capacity" | "workspace_busy" | "dispatch";
  lastActivityAt?: number;
  workspace: TaskWorkspace;
  status: TaskStatus;
  activeRunId: string | null;
  resolvedWorktreeId: string | null;
  ownsManagedWorktree: boolean;
  workspaceCleanupStatus: "retained" | "intent" | "removed" | "blocked";
  workspaceCleanedAt: number | null;
  workspaceCleanupErrorCode: string | null;
  revision: number;
  createdAt: number;
  updatedAt: number;
  durationMs: number;
  tokenCount: number;
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
  archiveStatus?: "archived" | "empty" | "unavailable";
  archivedArtifacts?: Array<{ relativePath: string; size: number }>;
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
  archiveStatus?: "intent" | "ready" | "failed" | "pending";
  archiveError?: string | null;
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
  taskTitle?: string;
  projectName?: string;
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

export interface TaskArtifactSelection {
  runId: string;
  relativePath: string;
}
export interface TaskArchivePage {
  sessionId: string;
  archivedAt: number;
  entries: Array<{
    id: string;
    type: string;
    role?: string;
    text: string;
    truncated: boolean;
  }>;
  nextCursor: string | null;
  artifacts: Array<{ relativePath: string; size: number }>;
}

export interface TasksApi {
  archive(
    taskId: string,
    expectedRevision: number,
    artifacts?: TaskArtifactSelection[],
  ): Promise<TaskDetailValue>;
  archiveRead(input: {
    taskId: string;
    runId: string;
    limit: number;
    cursor?: string;
  }): Promise<TaskArchivePage>;
  archiveReveal(
    taskId: string,
    runId: string,
    relativePath?: string,
  ): Promise<void>;
  list(input: {
    cursor?: string;
    limit: number;
    statuses?: TaskStatus[];
    query?: string;
    projectId?: string;
    attentionOnly?: boolean;
  }): Promise<TaskListPage>;
  get(taskId: string): Promise<TaskDetailValue>;
  create(input: CreateTaskInput): Promise<TaskDetailValue>;
  update(
    taskId: string,
    expectedRevision: number,
    patch: UpdateTaskInput,
  ): Promise<TaskDetailValue>;
  notificationsList(input: { cursor?: string; limit: number }): Promise<{
    items: TaskNotificationValue[];
    nextCursor: string | null;
    unreadCount?: number;
  }>;
  notificationsMarkAllRead(): Promise<void>;
  notificationMarkRead(
    taskId: string,
    runId: string | null,
    kind: string,
  ): Promise<void>;
  run(taskId: string, expectedRevision: number): Promise<TaskDetailValue>;
  cancel(taskId: string, expectedRevision: number): Promise<TaskDetailValue>;
  complete(taskId: string, expectedRevision: number): Promise<TaskDetailValue>;
  cleanupWorkspace(
    taskId: string,
    expectedRevision: number,
  ): Promise<TaskDetailValue>;
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
  taskArchive(input: {
    taskId: string;
    expectedRevision: number;
    artifacts: TaskArtifactSelection[];
  }): Promise<TaskDetailValue>;
  taskArchiveRead: TasksApi["archiveRead"];
  taskArchiveReveal(input: {
    taskId: string;
    runId: string;
    relativePath?: string;
  }): Promise<void>;
  taskList: TasksApi["list"];
  taskGet(input: { taskId: string }): Promise<TaskDetailValue>;
  taskCreate: TasksApi["create"];
  taskUpdate(input: {
    taskId: string;
    expectedRevision: number;
    patch: UpdateTaskInput;
  }): Promise<TaskDetailValue>;
  taskNotificationsList: TasksApi["notificationsList"];
  taskNotificationsMarkAllRead(): Promise<void>;
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
  taskCleanupWorkspace(input: {
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
  archive: (taskId, expectedRevision, artifacts = []) =>
    host.taskArchive({ taskId, expectedRevision, artifacts }),
  archiveRead: (input) => host.taskArchiveRead(input),
  archiveReveal: (taskId, runId, relativePath) =>
    host.taskArchiveReveal({
      taskId,
      runId,
      ...(relativePath ? { relativePath } : {}),
    }),
  list: (input) => host.taskList(input),
  get: (taskId) => host.taskGet({ taskId }),
  create: (input) => host.taskCreate(input),
  update: (taskId, expectedRevision, patch) =>
    host.taskUpdate({ taskId, expectedRevision, patch }),
  notificationsList: (input) => host.taskNotificationsList(input),
  notificationsMarkAllRead: () => host.taskNotificationsMarkAllRead(),
  notificationMarkRead: (taskId, runId, kind) =>
    host.taskNotificationMarkRead({ taskId, runId, kind }),
  run: (taskId, expectedRevision) => host.taskRun({ taskId, expectedRevision }),
  cancel: (taskId, expectedRevision) =>
    host.taskCancel({ taskId, expectedRevision }),
  complete: (taskId, expectedRevision) =>
    host.taskComplete({ taskId, expectedRevision }),
  cleanupWorkspace: (taskId, expectedRevision) =>
    host.taskCleanupWorkspace({ taskId, expectedRevision }),
  requestChanges: (taskId, expectedRevision, note) =>
    host.taskRequestChanges({ taskId, expectedRevision, note }),
  continueForReport: (taskId, expectedRevision) =>
    host.taskContinueForReport({ taskId, expectedRevision }),
  rewriteStart: (input) => host.taskRewriteStart(input),
  rewriteAbort: (rewriteId) => host.taskRewriteAbort({ rewriteId }),
  subscribe: (listener) => host.subscribeTaskEvents(listener),
});

export const tasksApi: TasksApi = {
  archive: (taskId, expectedRevision, artifacts = []) =>
    commands.taskArchive(
      taskId,
      expectedRevision,
      artifacts,
    ) as Promise<TaskDetailValue>,
  archiveRead: (input) =>
    commands.taskArchiveRead(input) as Promise<TaskArchivePage>,
  archiveReveal: (taskId, runId, relativePath) =>
    commands.taskArchiveReveal(taskId, runId, relativePath),
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
      unreadCount?: number;
    }>,
  notificationsMarkAllRead: () => commands.taskNotificationsMarkAllRead(),
  notificationMarkRead: (taskId, runId, kind) =>
    commands.taskNotificationMarkRead(taskId, runId, kind),
  run: (taskId, expectedRevision) =>
    commands.taskRun(taskId, expectedRevision) as Promise<TaskDetailValue>,
  cancel: (taskId, expectedRevision) =>
    commands.taskCancel(taskId, expectedRevision) as Promise<TaskDetailValue>,
  complete: (taskId, expectedRevision) =>
    commands.taskComplete(taskId, expectedRevision) as Promise<TaskDetailValue>,
  cleanupWorkspace: (taskId, expectedRevision) =>
    commands.taskCleanupWorkspace(
      taskId,
      expectedRevision,
    ) as Promise<TaskDetailValue>,
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
