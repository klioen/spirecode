import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openTaskDatabase, type TaskDatabase } from "./database.js";
import { TaskRepository } from "./repository.js";
import {
  TaskService,
  type TaskServiceDependencies,
  type TaskSessionBinding,
  type TaskSessionIntegration,
} from "./service.js";

const ids = [
  "10000000-0000-4000-8000-000000000001",
  "20000000-0000-4000-8000-000000000001",
  "30000000-0000-4000-8000-000000000001",
  "40000000-0000-4000-8000-000000000001",
  "50000000-0000-4000-8000-000000000001",
  "60000000-0000-4000-8000-000000000001",
  "70000000-0000-4000-8000-000000000001",
];
const projectId = "90000000-0000-4000-8000-000000000001";
const existingWorktreeId = "90000000-0000-4000-8000-000000000002";
const managedWorktreeId = "90000000-0000-4000-8000-000000000003";
const directories: string[] = [];
let database: TaskDatabase;
let repository: TaskRepository;
let dependencies: TaskServiceDependencies;
let sessionBinding: TaskSessionBinding;
let service: TaskService;
let uuidIndex: number;
let eventListener: ((event: { type: string }) => void) | undefined;
let reportResult: TaskSessionIntegration["reportResult"] | undefined;

beforeEach(() => {
  const directory = mkdtempSync(join(tmpdir(), "spire-task-service-"));
  directories.push(directory);
  database = openTaskDatabase(join(directory, "tasks.sqlite3"), {
    now: () => 1_700_000_000_000,
  });
  repository = new TaskRepository(database.connection, {
    now: () => 1_700_000_000_000,
  });
  uuidIndex = 0;
  sessionBinding = {
    sessionId: "80000000-0000-4000-8000-000000000001",
    sessionPath: "/private/session.jsonl",
  };
  dependencies = {
    getProject: vi.fn(async () => ({ id: projectId, kind: "git" as const })),
    getWorktree: vi.fn(async (worktreeId: string) => ({
      id: worktreeId,
      projectId,
      dirty: false,
      busy: false,
    })),
    createWorktree: vi.fn(async () => ({
      id: managedWorktreeId,
      projectId,
      dirty: false,
      busy: false,
    })),
    findManagedWorktree: vi.fn(async () => null),
    validateManagedWorktree: vi.fn(async () => undefined),
    createSession: vi.fn(async (_worktreeId, integration) => {
      eventListener = integration.onEvent;
      reportResult = integration.reportResult;
      return sessionBinding;
    }),
    findSession: vi.fn(async () => null),
    renameSession: vi.fn(async () => undefined),
    attachSession: vi.fn(async (_worktreeId, _sessionId, integration) => {
      eventListener = integration.onEvent;
      reportResult = integration.reportResult;
    }),
    sessionStatus: vi.fn(async () => "streaming" as const),
    sessionHasPrompt: vi.fn(async () => false),
    sendPrompt: vi.fn(async () => ({ accepted: true })),
    abortSession: vi.fn(async () => undefined),
    notify: vi.fn(async () => undefined),
  };
  service = new TaskService(repository, dependencies, {
    randomUUID: () => {
      const index = uuidIndex++;
      return (
        ids[index] ??
        `a0000000-0000-4000-8000-${String(index).padStart(12, "0")}`
      );
    },
  });
});

afterEach(async () => {
  await service.dispose();
  database.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function createInput(automationEnabled = true) {
  return {
    title: "Implement task service",
    description: "Orchestrate the backend",
    projectId,
    workspace: {
      mode: "new_managed" as const,
      baseRef: "origin/main",
    },
    automationEnabled,
  };
}

describe("TaskService", () => {
  it("generates task UUIDs in Main and leaves manual tasks in backlog", async () => {
    const detail = await service.create(createInput(false));

    expect(detail.task.id).toBe(ids[0]);
    expect(detail.task.status).toBe("backlog");
    expect(dependencies.createWorktree).not.toHaveBeenCalled();
    await expect(service.list({ limit: 10 })).resolves.toMatchObject({
      items: [{ id: ids[0] }],
    });
  });

  it("rejects non-Git projects and worktrees owned by another project", async () => {
    vi.mocked(dependencies.getProject).mockResolvedValueOnce({
      id: projectId,
      kind: "directory",
    });
    await expect(service.create(createInput(false))).rejects.toMatchObject({
      code: "TASK_PROJECT_NOT_GIT",
    });

    vi.mocked(dependencies.getWorktree).mockResolvedValueOnce({
      id: existingWorktreeId,
      projectId: "90000000-0000-4000-8000-000000000099",
      dirty: false,
      busy: false,
    });
    await expect(
      service.create({
        ...createInput(false),
        workspace: {
          mode: "existing",
          worktreeId: existingWorktreeId,
          allowDirty: false,
        },
      }),
    ).rejects.toMatchObject({ code: "TASK_WORKSPACE_NOT_FOUND" });
  });

  it("allows Directory projects only with their existing workspace", async () => {
    vi.mocked(dependencies.getProject).mockResolvedValue({
      id: projectId,
      kind: "directory",
    });
    const detail = await service.create({
      ...createInput(false),
      workspace: {
        mode: "existing",
        worktreeId: existingWorktreeId,
        allowDirty: false,
      },
    });

    expect(detail.task.status).toBe("backlog");
    expect(detail.task.workspace).toEqual({
      mode: "existing",
      worktreeId: existingWorktreeId,
      allowDirty: false,
    });
  });

  it("provisions a managed worktree, persistent session, deterministic prompt and report tool", async () => {
    const detail = await service.create(createInput(true));
    const run = detail.runs[0]!;

    expect(dependencies.createWorktree).toHaveBeenCalledWith(
      projectId,
      expect.stringMatching(/^task-20000000-implement-task-service$/),
      "origin/main",
    );
    expect(dependencies.createSession).toHaveBeenCalledWith(
      managedWorktreeId,
      expect.objectContaining({ sessionId: run.id }),
    );
    expect(dependencies.renameSession).toHaveBeenCalledWith(
      managedWorktreeId,
      sessionBinding.sessionId,
      `SpireCode Task ${run.id}`,
    );
    expect(dependencies.sendPrompt).toHaveBeenCalledWith(
      managedWorktreeId,
      sessionBinding.sessionId,
      expect.stringMatching(
        new RegExp(`^spire-task-run:${run.id}[\\s\\S]*Draft`),
      ),
    );
    expect(
      vi.mocked(dependencies.sendPrompt).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(dependencies.renameSession).mock.invocationCallOrder[0]!,
    );
    expect(run).toMatchObject({
      status: "running",
      sagaPhase: "active",
      worktreeId: managedWorktreeId,
      sessionId: sessionBinding.sessionId,
    });

    const reported = await reportResult!({
      runId: run.id,
      outcome: "success",
      summary: "Implemented",
      tests: [{ command: "pnpm test", status: "passed", summary: "green" }],
    });
    expect(reported.task.status).toBe("needs_review");
    expect(dependencies.notify).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "needs_review", runId: run.id }),
    );
  });

  it("binds an existing clean workspace without creating one and enforces dirty confirmation", async () => {
    const manual = await service.create({
      ...createInput(false),
      workspace: {
        mode: "existing",
        worktreeId: existingWorktreeId,
        allowDirty: false,
      },
    });
    vi.mocked(dependencies.getWorktree).mockResolvedValue({
      id: existingWorktreeId,
      projectId,
      dirty: true,
      busy: false,
    });
    await expect(
      service.run(manual.task.id, manual.task.revision),
    ).rejects.toMatchObject({
      code: "TASK_WORKSPACE_DIRTY_CONFIRMATION_REQUIRED",
    });
    expect(dependencies.createWorktree).not.toHaveBeenCalled();
    expect((await service.get(manual.task.id)).task.status).toBe("failed");
  });

  it("honors explicit dirty-worktree consent when creating a task", async () => {
    vi.mocked(dependencies.getWorktree).mockResolvedValue({
      id: existingWorktreeId,
      projectId,
      dirty: true,
      busy: false,
    });

    const detail = await service.create({
      ...createInput(false),
      workspace: {
        mode: "existing",
        worktreeId: existingWorktreeId,
        allowDirty: true,
      },
    });

    expect(detail.task.workspace).toMatchObject({ allowDirty: true });
  });

  it("durably queues a fourth automated run until an execution slot is free", async () => {
    vi.mocked(dependencies.getWorktree).mockImplementation(
      async (worktreeId) => ({
        id: worktreeId,
        projectId,
        dirty: false,
        busy: false,
      }),
    );
    const details = [];
    for (let index = 0; index < 4; index += 1) {
      const worktreeId = `b0000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
      const task = await service.create({
        ...createInput(true),
        title: `Task ${index}`,
        workspace: { mode: "existing", worktreeId, allowDirty: false },
      });
      details.push(task);
    }

    expect(details.slice(0, 3).map(({ runs }) => runs[0]?.status)).toEqual([
      "running",
      "running",
      "running",
    ]);
    expect(details[3]?.runs[0]?.status).toBe("queued");
    expect(details[3]?.task.status).toBe("queued");

    const third = details[2]!;
    await reportResult!({
      runId: third.runs[0]!.id,
      outcome: "success",
      summary: "Done",
      tests: [],
    });

    expect((await service.get(details[3]!.task.id)).runs[0]?.status).toBe(
      "running",
    );

    const firstRun = repository.getRun(details[0]!.runs[0]!.id)!;
    repository.transitionRun(
      firstRun.id,
      firstRun.revision,
      "awaiting_report",
      {
        sagaPhase: "active",
        settledAt: Date.now(),
      },
    );
    const fifth = await service.create({
      ...createInput(true),
      title: "Task 5",
      workspace: {
        mode: "existing",
        worktreeId: "b0000000-0000-4000-8000-000000000005",
        allowDirty: false,
      },
    });
    expect(fifth.runs[0]?.status).toBe("running");
    const awaiting = await service.get(details[0]!.task.id);
    await expect(
      service.continueForReport(awaiting.task.id, awaiting.task.revision),
    ).rejects.toMatchObject({ code: "TASK_WORKSPACE_BUSY" });
    expect((await service.get(awaiting.task.id)).runs[0]?.status).toBe(
      "awaiting_report",
    );
  });

  it("moves settled agents only to awaiting_report and can continue for a report", async () => {
    const created = await service.create(createInput(true));
    eventListener?.({ type: "agent_settled" });
    await service.whenIdle();

    const awaiting = await service.get(created.task.id);
    expect(awaiting.task.status).toBe("running");
    expect(awaiting.runs[0]?.status).toBe("awaiting_report");
    expect(dependencies.notify).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "awaiting_report" }),
    );

    const continued = await service.continueForReport(
      awaiting.task.id,
      awaiting.task.revision,
    );
    expect(continued.runs[0]?.status).toBe("running");
    expect(dependencies.sendPrompt).toHaveBeenLastCalledWith(
      managedWorktreeId,
      sessionBinding.sessionId,
      expect.stringContaining("task_report_result"),
    );
  });

  it("cancels an active session, manually completes review, and creates a new attempt for changes", async () => {
    const first = await service.create(createInput(true));
    const cancelled = await service.cancel(first.task.id, first.task.revision);
    expect(dependencies.abortSession).toHaveBeenCalled();
    expect(cancelled.task.status).toBe("cancelled");

    const retry = await service.run(cancelled.task.id, cancelled.task.revision);
    const run = retry.runs[0]!;
    await reportResult!({
      runId: run.id,
      outcome: "blocked",
      summary: "Needs input",
      tests: [],
    });
    const review = await service.get(retry.task.id);
    const changes = await service.requestChanges(
      review.task.id,
      review.task.revision,
      "Address review feedback",
    );
    expect(changes.runs[0]?.attempt).toBe(3);

    await reportResult!({
      runId: changes.runs[0]!.id,
      outcome: "success",
      summary: "Done",
      tests: [],
    });
    const secondReview = await service.get(changes.task.id);
    const completed = await service.complete(
      secondReview.task.id,
      secondReview.task.revision,
    );
    expect(completed.task.status).toBe("completed");
    expect(completed.task.completedAt).not.toBeNull();
  });

  it("does not duplicate the same in-memory run", async () => {
    const manual = await service.create(createInput(false));
    const [a, b] = await Promise.all([
      service.run(manual.task.id, manual.task.revision),
      service.run(manual.task.id, manual.task.revision),
    ]);
    expect(a.task.id).toBe(b.task.id);
    expect(dependencies.createWorktree).toHaveBeenCalledTimes(1);
    expect(dependencies.createSession).toHaveBeenCalledTimes(1);
    expect(dependencies.sendPrompt).toHaveBeenCalledTimes(1);
  });

  it("converges a recovered idle running session to awaiting_report", async () => {
    const created = await service.create(createInput(true));
    vi.mocked(dependencies.sessionStatus).mockResolvedValue("idle");

    await service.recover();

    const recovered = await service.get(created.task.id);
    expect(recovered.runs[0]?.status).toBe("awaiting_report");
    expect(dependencies.notify).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "awaiting_report" }),
    );
  });

  it("recovers a durable cancel intent by aborting once and completing cancellation", async () => {
    const created = await service.create(createInput(true));
    const run = created.runs[0]!;
    repository.upsertRunStep(run.id, "cancel", "intent");

    await service.recover();

    expect(dependencies.abortSession).toHaveBeenCalledWith(
      run.worktreeId,
      run.sessionId,
    );
    expect((await service.get(created.task.id)).runs[0]?.status).toBe(
      "cancelled",
    );
  });

  it("adopts worktree, deterministic session, and accepted prompt after crashes before each done marker", async () => {
    const task = repository.createTask({
      id: ids[0],
      title: "Recover task",
      description: "",
      projectId,
      workspace: { mode: "new_managed", baseRef: "origin/main" },
      automationEnabled: true,
    });
    const created = repository.createRun(task.id, task.revision, {
      id: ids[2],
      projectId,
      promptMarker: `spire-task-run:${ids[2]}`,
      ownsManagedWorktree: true,
      worktreeName: "task-30000000-recover-task",
      baseRef: "origin/main",
    });
    repository.transitionRun(
      created.run.id,
      created.run.revision,
      "provisioning",
      {
        sagaPhase: "workspace_intent",
        taskStatus: "running",
      },
    );
    repository.upsertRunStep(created.run.id, "workspace", "intent", {
      name: created.run.worktreeName,
    });
    vi.mocked(dependencies.findManagedWorktree).mockResolvedValue({
      id: managedWorktreeId,
      projectId,
      dirty: false,
      busy: false,
    });
    vi.mocked(dependencies.findSession).mockResolvedValue(sessionBinding);
    vi.mocked(dependencies.sessionHasPrompt).mockResolvedValue(true);

    await service.recover();

    expect(dependencies.findManagedWorktree).toHaveBeenCalledWith(
      projectId,
      created.run.worktreeName,
    );
    expect(dependencies.findSession).toHaveBeenCalledWith(
      managedWorktreeId,
      `SpireCode Task ${created.run.id}`,
      created.run.id,
    );
    expect(dependencies.sessionHasPrompt).toHaveBeenCalledWith(
      managedWorktreeId,
      sessionBinding.sessionId,
      created.run.promptMarker,
    );
    expect(dependencies.createWorktree).not.toHaveBeenCalled();
    expect(dependencies.createSession).not.toHaveBeenCalled();
    expect(dependencies.sendPrompt).not.toHaveBeenCalled();
    expect((await service.get(task.id)).runs[0]).toMatchObject({
      status: "running",
      worktreeId: managedWorktreeId,
      sessionId: sessionBinding.sessionId,
    });
    expect(repository.listRunSteps(created.run.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ step: "workspace", state: "done" }),
        expect.objectContaining({ step: "session", state: "done" }),
        expect.objectContaining({ step: "prompt", state: "done" }),
      ]),
    );
  });
});
