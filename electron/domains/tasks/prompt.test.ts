import { describe, expect, it } from "vitest";
import type { Task, TaskRun } from "./types.js";
import { buildContinueForReportPrompt, buildTaskPrompt } from "./prompt.js";

const task = {
  id: "10000000-0000-4000-8000-000000000001",
  title: "Fix navigation",
  description: "Open a project session from the Task page.",
  projectId: "20000000-0000-4000-8000-000000000001",
  workspace: { mode: "new_managed", baseRef: "origin/main" },
  automationEnabled: true,
  metadata: {},
  status: "running",
  activeRunId: "30000000-0000-4000-8000-000000000001",
  resolvedWorktreeId: "40000000-0000-4000-8000-000000000001",
  ownsManagedWorktree: true,
  workspaceCleanupStatus: "retained",
  workspaceCleanedAt: null,
  workspaceCleanupErrorCode: null,
  revision: 1,
  createdAt: 1,
  updatedAt: 1,
  completedAt: null,
} satisfies Task;

const run = {
  id: "30000000-0000-4000-8000-000000000001",
  taskId: task.id,
  attempt: 1,
  status: "running",
  sagaPhase: "active",
  projectId: task.projectId,
  worktreeId: "40000000-0000-4000-8000-000000000001",
  ownsManagedWorktree: true,
  worktreeName: "task-navigation",
  baseRef: "origin/main",
  sessionId: "50000000-0000-4000-8000-000000000001",
  sessionPath: null,
  promptMarker: "spire-task-run:30000000-0000-4000-8000-000000000001",
  report: null,
  error: null,
  revision: 1,
  createdAt: 1,
  startedAt: 1,
  settledAt: null,
  reportedAt: null,
  finishedAt: null,
} satisfies TaskRun;

describe("Task prompt", () => {
  it("uses the description without an acceptance criteria protocol", () => {
    const prompt = buildTaskPrompt(task, run);

    expect(prompt).toContain(task.description);
    expect(prompt).not.toContain("acceptanceCriteria");
    expect(prompt).not.toContain("acceptance criteria");
  });

  it("asks a settled agent for tests in its structured report", () => {
    const prompt = buildContinueForReportPrompt(run);

    expect(prompt).toContain("Include the tests you ran");
    expect(prompt).not.toContain("acceptanceCriteria");
  });
});
