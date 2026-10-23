export const TASK_STATUSES = [
  "backlog",
  "queued",
  "running",
  "needs_review",
  "completed",
  "failed",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_RUN_STATUSES = [
  "queued",
  "provisioning",
  "prompting",
  "running",
  "awaiting_report",
  "reported",
  "failed",
  "cancelled",
] as const;
export type TaskRunStatus = (typeof TASK_RUN_STATUSES)[number];

export const SAGA_PHASES = [
  "created",
  "workspace_intent",
  "workspace_ready",
  "session_intent",
  "session_ready",
  "prompt_intent",
  "prompt_accepted",
  "active",
  "terminal",
] as const;
export type SagaPhase = (typeof SAGA_PHASES)[number];

export type WorkspaceRequest =
  | { mode: "new_managed"; baseRef: string }
  | { mode: "existing"; worktreeId: string; allowDirty: boolean };

export type WorkspaceCleanupStatus =
  "retained" | "intent" | "removed" | "blocked";

export interface Task {
  id: string;
  title: string;
  description: string;
  projectId: string;
  workspace: WorkspaceRequest;
  automationEnabled: boolean;
  status: TaskStatus;
  activeRunId: string | null;
  resolvedWorktreeId: string | null;
  ownsManagedWorktree: boolean;
  workspaceCleanupStatus: WorkspaceCleanupStatus;
  workspaceCleanedAt: number | null;
  workspaceCleanupErrorCode: string | null;
  revision: number;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export interface CreateTaskInput {
  id: string;
  title: string;
  description: string;
  projectId: string;
  workspace: WorkspaceRequest;
  automationEnabled: boolean;
}

export interface TaskRunError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface ReportedTest {
  command: string;
  status: "passed" | "failed" | "not_run";
  summary: string;
}

export interface TaskRunReport {
  outcome: "success" | "blocked" | "failed";
  summary: string;
  tests: ReportedTest[];
  changeRequest?: {
    kind: "github_pr" | "gitlab_mr" | "other";
    url: string;
    draft: boolean;
  };
}

export interface TaskRun {
  id: string;
  taskId: string;
  attempt: number;
  status: TaskRunStatus;
  sagaPhase: SagaPhase;
  projectId: string;
  worktreeId: string | null;
  ownsManagedWorktree: boolean;
  worktreeName: string | null;
  baseRef: string | null;
  sessionId: string | null;
  sessionPath: string | null;
  promptMarker: string;
  report: TaskRunReport | null;
  error: TaskRunError | null;
  revision: number;
  createdAt: number;
  startedAt: number | null;
  settledAt: number | null;
  reportedAt: number | null;
  finishedAt: number | null;
}

export interface CreateRunInput {
  id: string;
  projectId: string;
  promptMarker: string;
  ownsManagedWorktree: boolean;
  worktreeName?: string | null;
  baseRef?: string | null;
  worktreeId?: string | null;
  sessionId?: string | null;
  sessionPath?: string | null;
}

export type RunStepState = "intent" | "done" | "failed";

export interface TaskRunStep {
  runId: string;
  step: string;
  state: RunStepState;
  details: unknown | null;
  updatedAt: number;
}

export interface TaskEvent {
  sequence: number;
  taskId: string;
  runId: string | null;
  type: string;
  payload: unknown | null;
  createdAt: number;
}

export interface TaskNotification {
  taskId: string;
  runId: string | null;
  kind: string;
  appReadAt: number | null;
  systemSentAt: number | null;
  createdAt: number;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
