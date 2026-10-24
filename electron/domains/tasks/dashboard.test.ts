// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { TaskDashboardService } from "./dashboard.js";
import type { TaskRepository } from "./repository.js";
import type { TaskDashboardCounts, TaskMetricRun, TaskRun } from "./types.js";

const emptyCounts: TaskDashboardCounts = {
  total: 0,
  active: 0,
  attention: 0,
  completed: 0,
  createdLast7Days: 0,
  completedLast7Days: 0,
  byStatus: {
    backlog: 0,
    queued: 0,
    running: 0,
    needs_review: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  },
};

function run(overrides: Partial<TaskRun> = {}): TaskRun {
  return {
    id: "40000000-0000-4000-8000-000000000001",
    taskId: "10000000-0000-4000-8000-000000000001",
    attempt: 1,
    status: "running",
    sagaPhase: "active",
    projectId: "20000000-0000-4000-8000-000000000001",
    worktreeId: null,
    ownsManagedWorktree: false,
    worktreeName: null,
    baseRef: null,
    sessionId: null,
    sessionPath: null,
    promptMarker: "spire-task-run:dashboard",
    report: null,
    error: null,
    revision: 1,
    createdAt: 1_000,
    startedAt: 1_000,
    settledAt: null,
    reportedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

function repositoryMock(pages: TaskRun[][]) {
  let pageIndex = 0;
  return {
    dashboardCounts: vi.fn(() => emptyCounts),
    listDashboardRuns: vi.fn(() => {
      const items = pages[pageIndex++] ?? [];
      return {
        items,
        nextCursor:
          pageIndex < pages.length
            ? { taskId: items.at(-1)!.taskId, attempt: items.at(-1)!.attempt }
            : null,
      };
    }),
  } as unknown as TaskRepository;
}

describe("TaskDashboardService", () => {
  it("aggregates duration and resilient token metrics in bounded batches", async () => {
    const repository = repositoryMock([
      [run()],
      [
        run({
          id: "40000000-0000-4000-8000-000000000002",
          taskId: "10000000-0000-4000-8000-000000000002",
          status: "reported",
          startedAt: 2_000,
          finishedAt: 4_000,
        }),
      ],
    ]);
    const tokenCount = vi
      .fn<(value: TaskMetricRun) => Promise<number>>()
      .mockResolvedValueOnce(120)
      .mockRejectedValueOnce(new Error("missing session"));
    const service = new TaskDashboardService(repository, {
      now: () => 5_000,
      batchSize: 1,
      tokenCount,
    });

    await expect(service.get()).resolves.toMatchObject({
      durationMs: 6_000,
      tokenCount: 120,
      measuredAt: 5_000,
      advancingRunCount: 1,
    });
    expect(repository.listDashboardRuns).toHaveBeenCalledTimes(2);
  });

  it("coalesces one generation and does not cache a result invalidated in flight", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const repository = repositoryMock([[run()]]);
    const tokenCount = vi.fn(async () => {
      await pending;
      return 1;
    });
    const service = new TaskDashboardService(repository, {
      now: () => 5_000,
      tokenCount,
    });

    const first = service.get();
    const duplicate = service.get();
    expect(first).toBe(duplicate);
    service.invalidate();
    const nextGeneration = service.get();
    expect(nextGeneration).not.toBe(first);
    release();
    await Promise.all([first, duplicate, nextGeneration]);
    expect(repository.dashboardCounts).toHaveBeenCalledTimes(2);
    await service.get();
    expect(repository.dashboardCounts).toHaveBeenCalledTimes(2);
  });
});
