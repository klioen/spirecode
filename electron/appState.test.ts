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
      taskRewrite: Promise.resolve({ dispose: vi.fn(async () => undefined) }),
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
  it("reads frozen statistics without resolving a removed workspace or session", async () => {
    const value = state();
    Object.assign(value, {
      taskArchives: {
        metadata: {
          retention: vi.fn(() => ({
            token_count: 321,
            duration_ms: 123,
            archive_kind: "archived",
          })),
          state: vi.fn(() => ({ status: "ready", error_code: null })),
          artifacts: vi.fn(() => []),
        },
      },
      chat: {
        sessionPath: vi.fn(async () => {
          throw new Error("removed");
        }),
      },
    });
    expect(await value.taskGet(task.id)).toMatchObject({
      tokenCount: 321,
      durationMs: 123,
      archiveStatus: "ready",
      runs: [{ archiveStatus: "archived" }],
    });
    expect(value.chat.sessionPath).not.toHaveBeenCalled();
  });
  it("enriches notifications without losing the global unread total", async () => {
    expect(await state().taskNotificationsList({ limit: 50 })).toMatchObject({
      unreadCount: 7,
      items: [{ taskTitle: "Fix login", projectName: "SpireCode" }],
    });
  });
});

describe("Task retained session deletion", () => {
  it("refuses to delete an original session referenced by unarchived terminal Task history", async () => {
    const deleteSession = vi.fn();
    const state = Object.assign(Object.create(AppState.prototype), {
      taskRepository: {
        listRunsBySessionId: vi.fn(() => [
          { id: "run-1", taskId: "task-1", status: "reported" },
        ]),
      },
      taskArchives: { metadata: { retention: vi.fn(() => undefined) } },
      chat: { delete: deleteSession },
    }) as AppState;
    await expect(state.deleteChatSession("w1", "s1")).rejects.toMatchObject({
      code: "TASK_SESSION_RETAINED",
    });
    expect(deleteSession).not.toHaveBeenCalled();
  });
  it("checks every Task reference's verified archive before deleting the original", async () => {
    const verify = vi.fn(async () => "archive.jsonl");
    const deleteSession = vi.fn(async () => undefined);
    const state = Object.assign(Object.create(AppState.prototype), {
      taskRepository: {
        listRunsBySessionId: vi.fn(() => [
          { id: "run-1", taskId: "task-1", status: "reported" },
          { id: "run-2", taskId: "task-2", status: "failed" },
        ]),
      },
      taskArchives: {
        metadata: { retention: vi.fn(() => ({ archive_kind: "archived" })) },
        revealPath: verify,
      },
      chat: { delete: deleteSession },
    }) as AppState;
    await state.deleteChatSession("w1", "s1");
    expect(verify).toHaveBeenCalledWith("task-1", "run-1");
    expect(verify).toHaveBeenCalledWith("task-2", "run-2");
    expect(deleteSession).toHaveBeenCalledWith("w1", "s1");
    verify.mockRejectedValueOnce(new Error("Integrity failed"));
    await expect(state.deleteChatSession("w1", "s1")).rejects.toThrow(
      "Integrity failed",
    );
    expect(deleteSession).toHaveBeenCalledTimes(1);
  });
});

describe("background worktree catalog invalidation", () => {
  it("publishes creation only after the workspace watcher is ready", async () => {
    const worktree = {
      id: "new-worktree",
      path: "/workspace",
      projectId: "p1",
    };
    const watcher = vi.fn(async () => undefined);
    const send = vi.fn();
    const state = Object.assign(Object.create(AppState.prototype), {
      worktrees: {
        create: vi.fn(async () => worktree),
        rollbackCreated: vi.fn(),
      },
      ensureWatcher: watcher,
      window: { isDestroyed: () => false, webContents: { send } },
    }) as AppState;
    await state.createWorktree("p1", "task", "main");
    expect(send).toHaveBeenCalledWith("spire:event:projects://changed", {});
    expect(watcher.mock.invocationCallOrder[0]).toBeLessThan(
      send.mock.invocationCallOrder[0],
    );
  });
  it("does not expose a failed creation that was rolled back", async () => {
    const rollbackCreated = vi.fn(async () => undefined);
    const send = vi.fn();
    const state = Object.assign(Object.create(AppState.prototype), {
      worktrees: {
        create: vi.fn(async () => ({ id: "new-worktree", path: "/workspace" })),
        rollbackCreated,
      },
      ensureWatcher: vi.fn(async () => {
        throw new Error("watcher failed");
      }),
      window: { isDestroyed: () => false, webContents: { send } },
    }) as AppState;
    await expect(state.createWorktree("p1", "task", "main")).rejects.toThrow(
      "watcher failed",
    );
    expect(rollbackCreated).toHaveBeenCalledWith("new-worktree");
    expect(send).not.toHaveBeenCalled();
  });
});

describe("generic worktree deletion preserves Task history", () => {
  function state() {
    return Object.assign(Object.create(AppState.prototype), {
      taskRepository: {
        listActiveRuns: vi.fn(() => []),
        listTasksByResolvedWorktreeId: vi.fn(() => [
          { id: "task-1", revision: 7 },
        ]),
      },
      tasks: { archive: vi.fn(async () => undefined) },
      worktrees: {
        inspectDelete: vi.fn(async () => ({ dirty: false, terminalCount: 0 })),
        delete: vi.fn(async () => ({ ok: true })),
      },
      chat: {
        worktreeBusy: vi.fn(() => false),
        closeWorktree: vi.fn(async () => undefined),
      },
      terminals: { closeWorktree: vi.fn() },
      window: { isDestroyed: () => false, webContents: { send: vi.fn() } },
      git: { closeWorktree: vi.fn() },
      watchers: { close: vi.fn(async () => undefined) },
    }) as AppState;
  }
  it("archives first even when the caller requested force deletion", async () => {
    const value = state();
    await value.deleteWorktree("w1", true);
    expect(value.tasks?.archive).toHaveBeenCalledWith("task-1", 7);
    expect(
      vi.mocked(value.tasks!.archive).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(value.worktrees.delete).mock.invocationCallOrder[0],
    );
  });
  it("invalidates Projects only after a successful Task cleanup deletion", async () => {
    const value = state();
    await value.deleteWorktree("w1", false, true);
    expect(value.window.webContents.send).toHaveBeenCalledWith(
      "spire:event:projects://changed",
      {},
    );
    expect(
      vi.mocked(value.worktrees.delete).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(value.window.webContents.send).mock.invocationCallOrder[0],
    );
  });
  it("does not invalidate Projects on a failed deletion", async () => {
    const value = state();
    vi.mocked(value.worktrees.delete).mockRejectedValueOnce(
      new Error("blocked"),
    );
    await expect(value.deleteWorktree("w1", false, true)).rejects.toThrow(
      "blocked",
    );
    expect(value.window.webContents.send).not.toHaveBeenCalled();
  });
  it("never closes or removes the workspace when its history cannot be retained", async () => {
    const value = state();
    vi.mocked(value.tasks!.archive).mockRejectedValueOnce(
      new Error("archive failed"),
    );
    await expect(value.deleteWorktree("w1", true)).rejects.toThrow(
      "archive failed",
    );
    expect(value.worktrees.delete).not.toHaveBeenCalled();
    expect(value.chat.closeWorktree).not.toHaveBeenCalled();
  });
});
