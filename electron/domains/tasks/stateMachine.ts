import type { TaskRunStatus, TaskStatus } from "./types.js";

export class TaskStateError extends Error {
  readonly code = "TASK_INVALID_STATE";

  constructor(message: string) {
    super(message);
    this.name = "TaskStateError";
  }
}

const TASK_TRANSITIONS: Readonly<Record<TaskStatus, ReadonlySet<TaskStatus>>> =
  {
    backlog: new Set(["queued", "cancelled"]),
    queued: new Set(["running", "failed", "cancelled"]),
    running: new Set(["needs_review", "failed", "cancelled"]),
    needs_review: new Set(["completed", "queued"]),
    completed: new Set(),
    failed: new Set(["queued", "cancelled"]),
    cancelled: new Set(["queued"]),
  };

const RUN_TRANSITIONS: Readonly<
  Record<TaskRunStatus, ReadonlySet<TaskRunStatus>>
> = {
  queued: new Set(["provisioning", "failed", "cancelled"]),
  provisioning: new Set(["prompting", "failed", "cancelled"]),
  prompting: new Set(["running", "failed", "cancelled"]),
  running: new Set(["awaiting_report", "reported", "failed", "cancelled"]),
  awaiting_report: new Set(["running", "reported", "failed", "cancelled"]),
  reported: new Set(),
  failed: new Set(),
  cancelled: new Set(),
};

export function assertTaskTransition(from: TaskStatus, to: TaskStatus): void {
  if (!TASK_TRANSITIONS[from].has(to)) {
    throw new TaskStateError(`Task cannot transition from ${from} to ${to}`);
  }
}

export function assertRunTransition(
  from: TaskRunStatus,
  to: TaskRunStatus,
): void {
  if (!RUN_TRANSITIONS[from].has(to)) {
    throw new TaskStateError(
      `Task run cannot transition from ${from} to ${to}`,
    );
  }
}

export type RunEvent =
  "agent_start" | "agent_end" | "agent_settled" | "report_received";

export function applyRunEvent(
  status: TaskRunStatus,
  event: RunEvent,
): TaskRunStatus {
  let next: TaskRunStatus;
  switch (event) {
    case "agent_start":
      if (status !== "prompting" && status !== "awaiting_report") {
        throw new TaskStateError(`agent_start does not apply to ${status}`);
      }
      next = "running";
      break;
    case "agent_end":
      if (status !== "running")
        throw new TaskStateError(`agent_end does not apply to ${status}`);
      return status;
    case "agent_settled":
      if (status !== "running")
        throw new TaskStateError(`agent_settled does not apply to ${status}`);
      next = "awaiting_report";
      break;
    case "report_received":
      if (status !== "running" && status !== "awaiting_report") {
        throw new TaskStateError(`report_received does not apply to ${status}`);
      }
      next = "reported";
      break;
  }
  assertRunTransition(status, next);
  return next;
}
