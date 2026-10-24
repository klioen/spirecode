// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppState, applyMemoryConfig, createTaskSession } from "./appState.js";

const originalModel = process.env.PI_MEMORY_EXTRACT_MODEL;
const originalPhase2Model = process.env.PI_MEMORY_PHASE2_MODEL;
const originalThinking = process.env.PI_MEMORY_EXTRACT_THINKING;
const originalPhase2Thinking = process.env.PI_MEMORY_PHASE2_THINKING;

afterEach(() => {
  if (originalModel === undefined) delete process.env.PI_MEMORY_EXTRACT_MODEL;
  else process.env.PI_MEMORY_EXTRACT_MODEL = originalModel;
  if (originalPhase2Model === undefined)
    delete process.env.PI_MEMORY_PHASE2_MODEL;
  else process.env.PI_MEMORY_PHASE2_MODEL = originalPhase2Model;
  if (originalThinking === undefined)
    delete process.env.PI_MEMORY_EXTRACT_THINKING;
  else process.env.PI_MEMORY_EXTRACT_THINKING = originalThinking;
  if (originalPhase2Thinking === undefined)
    delete process.env.PI_MEMORY_PHASE2_THINKING;
  else process.env.PI_MEMORY_PHASE2_THINKING = originalPhase2Thinking;
});

describe("Task background shutdown", () => {
  it("drains Task orchestration before disposing Chat, watchers and the database", async () => {
    let release!: () => void;
    const draining = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chatDispose = vi.fn(async () => undefined);
    const watchersDispose = vi.fn(async () => undefined);
    const databaseClose = vi.fn();
    const state = Object.assign(Object.create(AppState.prototype), {
      terminals: { dispose: vi.fn() },
      tasks: { dispose: vi.fn(() => draining) },
      watchers: { dispose: watchersDispose },
      chat: { disposeAll: chatDispose },
      taskDatabase: { close: databaseClose },
    }) as AppState;

    const disposing = state.dispose();
    try {
      expect(chatDispose).not.toHaveBeenCalled();
      expect(watchersDispose).not.toHaveBeenCalled();
      expect(databaseClose).not.toHaveBeenCalled();
    } finally {
      release();
    }
    await disposing;

    expect(chatDispose).toHaveBeenCalledTimes(1);
    expect(watchersDispose).toHaveBeenCalledTimes(1);
    expect(databaseClose).toHaveBeenCalledTimes(1);
  });
});

describe("createTaskSession", () => {
  it("binds an empty Pi session without resolving a path before prompt persistence", async () => {
    const create = vi.fn(async () => ({ sessionId: "run-1" }));
    const nameLoadedSession = vi.fn(async () => undefined);
    const onEvent = vi.fn();

    await expect(
      createTaskSession(
        { create, nameLoadedSession } as unknown as Parameters<
          typeof createTaskSession
        >[0],
        "worktree-1",
        {
          sessionId: "run-1",
          reportTool: {
            name: "task_report_result",
            description: "Report the result",
          },
          reportResult: vi.fn(),
          onEvent,
        } as unknown as Parameters<typeof createTaskSession>[2],
      ),
    ).resolves.toEqual({ sessionId: "run-1", sessionPath: null });

    expect(create).toHaveBeenCalledWith(
      "worktree-1",
      expect.objectContaining({ sessionId: "run-1" }),
    );
    expect(nameLoadedSession).toHaveBeenCalledWith(
      "worktree-1",
      "run-1",
      "SpireCode Task run-1",
    );
  });
});

describe("applyMemoryConfig", () => {
  it("clears Memory overrides for an unconfigured clean install", () => {
    process.env.PI_MEMORY_EXTRACT_MODEL = "old/model";
    process.env.PI_MEMORY_PHASE2_MODEL = "old/model";
    process.env.PI_MEMORY_EXTRACT_THINKING = "high";
    process.env.PI_MEMORY_PHASE2_THINKING = "high";

    applyMemoryConfig(null);

    expect(process.env.PI_MEMORY_EXTRACT_MODEL).toBeUndefined();
    expect(process.env.PI_MEMORY_PHASE2_MODEL).toBeUndefined();
    expect(process.env.PI_MEMORY_EXTRACT_THINKING).toBeUndefined();
    expect(process.env.PI_MEMORY_PHASE2_THINKING).toBeUndefined();
  });

  it("sets the Phase 1 model and reasoning before extensions load", () => {
    applyMemoryConfig({
      phase1Provider: "openai",
      phase1ModelId: "gpt-5.6",
      phase1ReasoningEffort: "high",
      phase2Provider: "traex",
      phase2ModelId: "DeepSeek-V4-Flash",
      phase2ReasoningEffort: "max",
    });

    expect(process.env.PI_MEMORY_EXTRACT_MODEL).toBe("openai/gpt-5.6");
    expect(process.env.PI_MEMORY_PHASE2_MODEL).toBe("traex/DeepSeek-V4-Flash");
    expect(process.env.PI_MEMORY_EXTRACT_THINKING).toBe("high");
    expect(process.env.PI_MEMORY_PHASE2_THINKING).toBe("max");
  });
});

describe("Task workbench read model", () => {
  const worktreeId = "90000000-0000-4000-8000-000000000002";
  const task = {
    id: "10000000-0000-4000-8000-000000000001",
    title: "Fix login",
    description: "Work",
    projectId: "90000000-0000-4000-8000-000000000001",
    workspace: { mode: "existing" as const, worktreeId, allowDirty: false },
    automationEnabled: true,
    metadata: {
      review: {
        kind: "github_pr" as const,
        url: "https://github.com/acme/widgets/pull/12",
        draft: false,
      },
    },
    status: "queued" as const,
    activeRunId: "20000000-0000-4000-8000-000000000001",
    resolvedWorktreeId: worktreeId,
    ownsManagedWorktree: false,
    workspaceCleanupStatus: "retained" as const,
    workspaceCleanedAt: null,
    workspaceCleanupErrorCode: null,
    revision: 2,
    createdAt: 1,
    updatedAt: 2,
    completedAt: null,
  };
  const run: import("./domains/tasks/types.js").TaskRun = {
    id: task.activeRunId,
    taskId: task.id,
    attempt: 1,
    status: "queued",
    sagaPhase: "created",
    projectId: task.projectId,
    worktreeId,
    ownsManagedWorktree: false,
    worktreeName: null,
    baseRef: null,
    sessionId: null,
    sessionPath: null,
    promptMarker: "marker",
    report: null,
    error: null,
    revision: 1,
    createdAt: 1,
    startedAt: null,
    settledAt: null,
    reportedAt: null,
    finishedAt: null,
  };
  function state(
    activeRuns: import("./domains/tasks/types.js").TaskRun[] = [],
  ) {
    return Object.assign(Object.create(AppState.prototype), {
      projects: {
        project: vi.fn(async () => ({
          name: "SpireCode",
          kind: "git",
          worktrees: [{ id: worktreeId, name: "feature-login" }],
        })),
      },
      tasks: {
        get: vi.fn(async () => ({ task, runs: [run] })),
        list: vi.fn(async () => ({ items: [task], nextCursor: null })),
        counts: vi.fn(() => ({ incompleteCount: 1, activeCount: 1 })),
        listNotifications: vi.fn(() => ({
          items: [
            {
              taskId: task.id,
              runId: run.id,
              kind: "needs_review",
              appReadAt: null,
              systemSentAt: null,
              createdAt: 1,
            },
          ],
          nextCursor: null,
        })),
      },
      taskDashboardAggregator: {
        get: vi.fn(async () => ({
          total: 1,
          active: 1,
          attention: 0,
          completed: 0,
          createdLast7Days: 1,
          completedLast7Days: 0,
          durationMs: 2_000,
          tokenCount: 42,
          measuredAt: 3_000,
          advancingRunCount: 1,
          byStatus: {
            backlog: 0,
            queued: 1,
            running: 0,
            needs_review: 0,
            completed: 0,
            failed: 0,
            cancelled: 0,
          },
        })),
      },
      taskRepository: {
        listAllRuns: vi.fn(() => [run]),
        listActiveRuns: vi.fn(() => activeRuns),
        executionQueueSnapshot: vi.fn(() => ({
          occupiedSlots: activeRuns.filter(
            (item) => !["queued", "awaiting_report"].includes(item.status),
          ).length,
          busyWorktreeIds: new Set(
            activeRuns
              .filter((item) => item.status !== "queued")
              .flatMap((item) => (item.worktreeId ? [item.worktreeId] : [])),
          ),
        })),
        getTask: vi.fn(() => task),
        unreadNotificationCount: vi.fn(() => 7),
      },
    }) as AppState;
  }
  it("returns readable workspace/stage and distinguishes dispatch, capacity and workspace waiting", async () => {
    expect(await state().taskGet(task.id)).toMatchObject({
      workspaceName: "feature-login",
      executionStatus: "queued",
      queueReason: "dispatch",
      supportsChanges: true,
      metadata: task.metadata,
    });
    expect(await state().taskList({ limit: 10 })).toMatchObject({
      items: [{ metadata: task.metadata }],
    });
    expect(await state().taskDashboard()).toMatchObject({
      total: 1,
      durationMs: 2_000,
      tokenCount: 42,
      byStatus: { queued: 1, cancelled: 0 },
    });
    expect(
      await state([
        { ...run, taskId: "another-task", status: "running" },
      ]).taskGet(task.id),
    ).toMatchObject({ queueReason: "workspace_busy" });
    expect(
      await state(
        Array.from({ length: 3 }, (_, index) => ({
          ...run,
          taskId: `other-${index}`,
          worktreeId: null,
          status: "running" as const,
        })),
      ).taskGet(task.id),
    ).toMatchObject({ queueReason: "capacity" });
  });
  it("enriches notifications without losing the global unread total", async () => {
    expect(await state().taskNotificationsList({ limit: 50 })).toMatchObject({
      unreadCount: 7,
      items: [{ taskTitle: "Fix login", projectName: "SpireCode" }],
    });
  });
});

describe("Task database diagnostics", () => {
  it("preserves the specific newer-schema failure for IPC instead of a misleading open error", async () => {
    const state = Object.assign(Object.create(AppState.prototype), {
      tasks: null,
      taskUnavailableCode: "TASK_SCHEMA_TOO_NEW",
      taskUnavailableReason:
        "Task database schema 7 is newer than supported schema 6",
    }) as AppState;
    await expect(state.taskGet("task")).rejects.toMatchObject({
      code: "TASK_SCHEMA_TOO_NEW",
      message: "Task database schema 7 is newer than supported schema 6",
    });
  });
  it("does not expose a raw database open failure or filesystem path", async () => {
    const state = Object.assign(Object.create(AppState.prototype), {
      tasks: null,
      taskUnavailableCode: "TASK_DATABASE_UNAVAILABLE",
      taskUnavailableReason: "/private/user-path",
    }) as AppState;
    await expect(state.taskGet("task")).rejects.toMatchObject({
      code: "TASK_DATABASE_UNAVAILABLE",
      message:
        "Tasks are unavailable because the task database could not be opened.",
    });
  });
});
