import type { TranslationKey, AppLanguage } from "../../i18n";
import type { TaskSummary, TaskRunStatus, TaskStatus } from "./tasksApi";

export const taskStatusKeys: Record<
  TaskStatus | TaskRunStatus,
  TranslationKey
> = {
  backlog: "tasks.status.backlog",
  queued: "tasks.status.queued",
  provisioning: "tasks.status.provisioning",
  prompting: "tasks.status.prompting",
  running: "tasks.status.running",
  awaiting_report: "tasks.status.awaitingReport",
  reported: "tasks.status.reported",
  needs_review: "tasks.status.needsReview",
  completed: "tasks.status.completed",
  failed: "tasks.status.failed",
  cancelled: "tasks.status.cancelled",
};

export function taskDisplayStatus(
  task: TaskSummary,
): TaskStatus | TaskRunStatus {
  return task.status === "running"
    ? (task.executionStatus ?? "running")
    : task.status;
}

export function relativeTaskTime(
  timestamp: number,
  language: AppLanguage,
  now = Date.now(),
): string {
  const seconds = Math.round((timestamp - now) / 1000);
  const format = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
  if (Math.abs(seconds) < 60)
    return format.format(Math.abs(seconds) < 15 ? 0 : seconds, "second");
  if (Math.abs(seconds) < 3600)
    return format.format(Math.round(seconds / 60), "minute");
  if (Math.abs(seconds) < 86400)
    return format.format(Math.round(seconds / 3600), "hour");
  return format.format(Math.round(seconds / 86400), "day");
}

export function boundedTaskQuery(value: string): string {
  const encoder = new TextEncoder();
  let bytes = 0;
  let query = "";
  for (const character of value) {
    bytes += encoder.encode(character).length;
    if (bytes > 256) break;
    query += character;
  }
  return query;
}
export function taskErrorMessage(error: unknown, fallback: string): string {
  return error !== null &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
    ? error.message
    : fallback;
}
