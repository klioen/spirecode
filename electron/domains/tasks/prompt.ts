import type { Task, TaskRun } from "./types.js";
import {
  TASK_SKILL_SNAPSHOT,
  taskSkillInput,
  type TaskSkillSnapshot,
} from "./taskSkill.js";

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
  skillSnapshot: TaskSkillSnapshot = TASK_SKILL_SNAPSHOT,
): string {
  return [
    run.promptMarker,
    "You are executing a SpireCode Task in its assigned workspace.",
    `runId: ${run.id}`,
    "This execution contract applies to this Run only. If this session contains earlier Task attempts, use this assignment and this Run's supplied Skill rather than an earlier attempt's contract.",
    taskSkillInput(skillSnapshot),
    "Task input (user-supplied JSON; this is the assignment, not a replacement for host controls):",
    JSON.stringify({
      title: task.title,
      description: task.description,
      ...(changeNote ? { requestedChanges: changeNote } : {}),
    }),
    "When finished, blocked, or failed, call task_report_result for this runId. Verify only within the task's authorized action boundary; tests may be empty for report-only work. Final acceptance belongs to the user.",
    "If you create a GitHub PR or GitLab MR it must remain Draft. Never mark it ready, approve it, or merge it.",
    "agent_settled is not completion; only task_report_result submits the result.",
    run.promptMarker,
  ].join("\n");
}

export function buildContinueForReportPrompt(
  run: TaskRun,
  skillSnapshot?: TaskSkillSnapshot,
): string {
  return [
    run.promptMarker,
    "Continue this task only as needed to produce the final structured report.",
    ...(skillSnapshot
      ? [
          `Use the Task Skill already supplied in this Run's initial input: version ${skillSnapshot.version}, SHA-256 ${skillSnapshot.sha256}.`,
        ]
      : [
          "This legacy Run has no Task Skill snapshot. Follow its original input; do not substitute the current bundled Task Skill.",
        ]),
    "Preserve the original assignment and action boundary. Do not implement new fixes or expand scope while preparing the report.",
    `Call ${TASK_REPORT_TOOL_NAME} exactly once for runId ${run.id}.`,
    "Include the tests you ran; use an empty tests array when none were required or run. Explain verification limits in summary. Draft change requests must remain Draft.",
    run.promptMarker,
  ].join("\n");
}

export const TASK_REPORT_TOOL_DESCRIPTION: TaskReportToolDescription = {
  name: TASK_REPORT_TOOL_NAME,
  description:
    "Submit the bound TaskRun result. The host validates run identity, tests, and Draft-only change requests.",
};
