import type { Task, TaskRun } from "./types.js";

export const TASK_REPORT_TOOL_NAME = "task_report_result";

export interface TaskReportToolDescription {
  name: typeof TASK_REPORT_TOOL_NAME;
  description: string;
}

export function taskRunMarker(runId: string): string {
  return `spire-task-run:${runId}`;
}

export function taskSessionName(runId: string): string {
  return `SpireCode Task ${runId}`;
}

export function buildTaskPrompt(
  task: Task,
  run: TaskRun,
  changeNote?: string,
): string {
  return [
    run.promptMarker,
    "You are executing a SpireCode Task in its assigned workspace.",
    `Title: ${task.title}`,
    "Description:",
    task.description || "(none)",
    ...(changeNote ? ["Requested changes:", changeNote] : []),
    "Run reasonable verification. When finished, blocked, or failed, you must call task_report_result exactly once with this runId and include the tests you ran.",
    `runId: ${run.id}`,
    "If you create a GitHub PR or GitLab MR it must remain Draft. Never mark it ready, approve it, or merge it.",
    "agent_settled is not completion; only task_report_result submits the result.",
    run.promptMarker,
  ].join("\n");
}

export function buildContinueForReportPrompt(run: TaskRun): string {
  return [
    run.promptMarker,
    "Continue this task only as needed to produce the final structured report.",
    `Call ${TASK_REPORT_TOOL_NAME} exactly once for runId ${run.id}.`,
    "Include the tests you ran. Draft change requests must remain Draft.",
    run.promptMarker,
  ].join("\n");
}

export const TASK_REPORT_TOOL_DESCRIPTION: TaskReportToolDescription = {
  name: TASK_REPORT_TOOL_NAME,
  description:
    "Submit the bound TaskRun result. The host validates run identity, tests, and Draft-only change requests.",
};
