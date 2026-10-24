import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openTaskDatabase, type TaskDatabase } from "./database.js";
import { TaskRepository } from "./repository.js";
import { TaskDeliveryError } from "./delivery.js";
import {
  TaskService,
  type TaskServiceDependencies,
  type TaskSessionBinding,
  type TaskSessionIntegration,
  type TaskVerificationSessionIntegration,
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
let verificationReportResult:
  TaskVerificationSessionIntegration["reportVerification"] | undefined;

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
  verificationReportResult = undefined;
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
    inspectWorktreeForCleanup: vi.fn(async (worktreeId: string) => ({
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
    createVerificationSession: vi.fn(async (_worktreeId, integration) => {
      verificationReportResult = integration.reportVerification;
      return { sessionId: integration.sessionId, sessionPath: null };
    }),
    findSession: vi.fn(async () => null),
    renameSession: vi.fn(async () => undefined),
    attachSession: vi.fn(async (_worktreeId, _sessionId, integration) => {
      eventListener = integration.onEvent;
      reportResult = integration.reportResult;
    }),
    loadSession: vi.fn(async (_worktreeId, _sessionId, integration) => {
      eventListener = integration.onEvent;
      reportResult = integration.reportResult;
    }),
    sessionStatus: vi.fn(async () => "streaming" as const),
    sessionHasPrompt: vi.fn(async () => false),
    sendPrompt: vi.fn(async () => ({ accepted: true })),
    abortSession: vi.fn(async () => undefined),
    isWorktreeBusy: vi.fn(async () => false),
    deleteWorktree: vi.fn(async () => undefined),
    inspectGitDelivery: vi.fn(async (_worktreeId, input) => ({
      baselineHead: "a".repeat(40),
      initialDirty: false,
      branch: input.branch,
      target: input.persistedTarget ?? "main",
    })),
    activateGitDelivery: vi.fn(async () => undefined),
    prepareGitChanges: vi.fn(async () => ({
      changed: false,
      head: "a".repeat(40),
    })),
    validatePreparedGitChanges: vi.fn(async () => undefined),
    deliverGitChanges: vi.fn(async () => ({
      changed: false,
      head: "a".repeat(40),
    })),
    notify: vi.fn(async () => undefined),
    onChanged: vi.fn(),
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

async function settleAgent(): Promise<void> {
  eventListener?.({ type: "agent_settled" });
  await service.whenIdle();
}

async function settleWithVerification(
  verdict: "pass" | "fail" | "inconclusive",
): Promise<void> {
  eventListener?.({ type: "agent_settled" });
  for (let attempt = 0; attempt < 20 && !verificationReportResult; attempt += 1)
    await new Promise<void>((resolve) => setImmediate(resolve));
  expect(verificationReportResult).toBeDefined();
  const verification = repository.latestVerification(
    repository.listTasks({ limit: 1 }).items[0]!.id,
  )!;
  await verificationReportResult!({
    verificationId: verification.id,
    verdict,
    summary: `Verifier returned ${verdict}`,
    evidence: {
      acceptanceCriteria: [
        {
          criterion: "Original requirement",
          status: verdict,
          evidence: ["checked"],
        },
      ],
      commands: [{ command: "pnpm test", status: "passed", summary: "green" }],
      issues:
        verdict === "pass"
          ? []
          : [
              {
                severity: "major",
                summary: "Not proven",
                evidence: "missing behavior",
              },
            ],
    },
  });
  await service.whenIdle();
}

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
    verificationEnabled: false,
  };
}

async function createRunningTask(input: Parameters<TaskService["create"]>[0]) {
  const queued = await service.create(input);
  await service.whenIdle();
  return service.get(queued.task.id);
}

async function runTask(detail: Awaited<ReturnType<TaskService["get"]>>) {
  await service.run(detail.task.id, detail.task.revision);
  await service.whenIdle();
  return service.get(detail.task.id);
}

describe("TaskService", () => {
  it("uses a durable intake identity to return the same Task and initial Run on retry", async () => {
    const input = createInput(true);
    const idempotencyId = "b0000000-0000-4000-8000-000000000001";
    const first = await service.create(input, idempotencyId);
    const second = await service.create(input, idempotencyId);
    expect(first.task.id).toBe(idempotencyId);
    expect(second.task.id).toBe(idempotencyId);
    expect(second.runs).toHaveLength(1);
    await expect(
      service.create({ ...input, description: "different" }, idempotencyId),
    ).rejects.toMatchObject({ code: "TASK_CONFLICT" });
    await service.whenIdle();
    expect(dependencies.createWorktree).toHaveBeenCalledWith(
      projectId,
      expect.any(String),
      "origin/main",
      idempotencyId,
    );
    expect(dependencies.createSession).toHaveBeenCalledTimes(1);
  });

  it("returns a durable queued task before provisioning and dispatches it in the background", async () => {
    const detail = await service.create(createInput(true));

    expect(detail.task.status).toBe("queued");
    expect(detail.runs[0]?.status).toBe("queued");
    expect(repository.getTask(detail.task.id)?.activeRunId).toBe(
      detail.runs[0]?.id,
    );
    expect(dependencies.createWorktree).not.toHaveBeenCalled();
    expect(dependencies.createSession).not.toHaveBeenCalled();
    expect(dependencies.sendPrompt).not.toHaveBeenCalled();

    await service.whenIdle();

    expect((await service.get(detail.task.id)).task.status).toBe("running");
    expect(dependencies.sendPrompt).toHaveBeenCalledTimes(1);
  });

  it("records background provisioning failures without failing task creation", async () => {
    vi.mocked(dependencies.createWorktree).mockRejectedValueOnce(
      new Error("unavailable"),
    );
    const detail = await service.create(createInput(true));

    expect(detail.task.status).toBe("queued");
    await service.whenIdle();

    expect((await service.get(detail.task.id)).task.status).toBe("failed");
    expect(dependencies.notify).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "failed" }),
    );
  });

  it("claims at most three execution slots when tasks are created concurrently", async () => {
    const queued = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        service.create({
          ...createInput(true),
          workspace: {
            mode: "existing",
            worktreeId: `b0000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
            allowDirty: false,
          },
        }),
      ),
    );
    expect(queued.every((detail) => detail.task.status === "queued")).toBe(
      true,
    );
    expect(dependencies.sendPrompt).not.toHaveBeenCalled();

    await service.whenIdle();
    const runs = repository.listActiveRuns();
    expect(runs.filter((run) => run.status === "running")).toHaveLength(3);
    expect(runs.filter((run) => run.status === "queued")).toHaveLength(3);
    expect(dependencies.sendPrompt).toHaveBeenCalledTimes(3);
  });

  it("creates another task while background provisioning is still blocked", async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(dependencies.createWorktree).mockImplementationOnce(async () => {
      await blocked;
      return { id: managedWorktreeId, projectId, dirty: false, busy: false };
    });
    const first = await service.create(createInput(true));
    await vi.waitFor(() =>
      expect(dependencies.createWorktree).toHaveBeenCalledTimes(1),
    );
    try {
      const second = await service.create(createInput(true));
      expect(second.task.status).toBe("queued");
      expect(second.task.id).not.toBe(first.task.id);
      expect(dependencies.createSession).not.toHaveBeenCalled();
      await vi.waitFor(() =>
        expect(dependencies.sendPrompt).toHaveBeenCalledTimes(1),
      );
      expect((await service.get(first.task.id)).runs[0]?.status).toBe(
        "provisioning",
      );
      expect((await service.get(second.task.id)).runs[0]?.status).toBe(
        "running",
      );
    } finally {
      release();
    }
    await service.whenIdle();
  });

  it("persists cancellation while provisioning is blocked and never submits the prompt", async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(dependencies.createWorktree).mockImplementationOnce(async () => {
      await blocked;
      return { id: managedWorktreeId, projectId, dirty: false, busy: false };
    });
    const queued = await service.create(createInput(true));
    await vi.waitFor(() =>
      expect(dependencies.createWorktree).toHaveBeenCalledTimes(1),
    );
    const provisioning = await service.get(queued.task.id);
    const cancelling = service.cancel(
      provisioning.task.id,
      provisioning.task.revision,
    );
    try {
      expect(repository.listRunSteps(provisioning.runs[0]!.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ step: "cancel", state: "intent" }),
        ]),
      );
    } finally {
      release();
    }
    const cancelled = await cancelling;
    await service.whenIdle();

    expect(cancelled.task.status).toBe("cancelled");
    expect(cancelled.task.resolvedWorktreeId).toBe(managedWorktreeId);
    expect(dependencies.createSession).not.toHaveBeenCalled();
    expect(dependencies.sendPrompt).not.toHaveBeenCalled();
  });

  it("honors cancellation while checking the durable prompt marker", async () => {
    let release!: (value: boolean) => void;
    const blocked = new Promise<boolean>((resolve) => {
      release = resolve;
    });
    vi.mocked(dependencies.sessionHasPrompt).mockReturnValueOnce(blocked);
    const queued = await service.create(createInput(true));
    await vi.waitFor(() =>
      expect(dependencies.sessionHasPrompt).toHaveBeenCalledTimes(1),
    );
    const prompting = await service.get(queued.task.id);
    const cancelling = service.cancel(
      prompting.task.id,
      prompting.task.revision,
    );
    release(false);
    const cancelled = await cancelling;
    await service.whenIdle();

    expect(cancelled.task.status).toBe("cancelled");
    expect(dependencies.sendPrompt).not.toHaveBeenCalled();
    expect(dependencies.abortSession).toHaveBeenCalledTimes(1);
  });

  it("cancels queued work before the dispatcher can create any resources", async () => {
    const queued = await service.create(createInput(true));
    const cancelled = await service.cancel(
      queued.task.id,
      queued.task.revision,
    );
    await service.whenIdle();

    expect(cancelled.task.status).toBe("cancelled");
    expect(dependencies.createWorktree).not.toHaveBeenCalled();
    expect(dependencies.createSession).not.toHaveBeenCalled();
    expect(dependencies.sendPrompt).not.toHaveBeenCalled();
    expect(dependencies.abortSession).not.toHaveBeenCalled();
  });

  it("recovers committed queued work after shutdown before the first dispatch", async () => {
    const queued = await service.create(createInput(true));
    await service.dispose();
    expect(dependencies.createWorktree).not.toHaveBeenCalled();
    service = new TaskService(repository, dependencies);

    await service.recover();
    expect(dependencies.createWorktree).not.toHaveBeenCalled();
    await service.whenIdle();

    expect((await service.get(queued.task.id)).task.status).toBe("running");
    expect(dependencies.createSession).toHaveBeenCalledTimes(1);
    expect(dependencies.sendPrompt).toHaveBeenCalledTimes(1);
    expect(dependencies.onChanged).toHaveBeenCalledWith(
      queued.task.id,
      expect.any(Number),
    );
  });

  it("serializes queued tasks sharing a workspace and skips them to dispatch independent work", async () => {
    const input = {
      ...createInput(true),
      workspace: {
        mode: "existing" as const,
        worktreeId: existingWorktreeId,
        allowDirty: false,
      },
    };
    const first = await createRunningTask(input);
    const second = await service.create(input);
    const third = await service.create({
      ...input,
      workspace: { ...input.workspace, worktreeId: managedWorktreeId },
    });
    await service.whenIdle();

    expect((await service.get(second.task.id)).task.status).toBe("queued");
    expect((await service.get(third.task.id)).task.status).toBe("running");
    expect(dependencies.sendPrompt).toHaveBeenCalledTimes(2);

    const integration = vi.mocked(dependencies.createSession).mock.calls[0]![1];
    await integration.reportResult({
      runId: first.runs[0]!.id,
      outcome: "success",
      summary: "Done",
      tests: [],
    });
    integration.onEvent({ type: "agent_settled" });
    await service.whenIdle();

    expect((await service.get(second.task.id)).task.status).toBe("running");
    expect(dependencies.sendPrompt).toHaveBeenCalledTimes(3);
  });

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
    const detail = await createRunningTask(createInput(true));
    const run = detail.runs[0]!;

    expect(dependencies.createWorktree).toHaveBeenCalledWith(
      projectId,
      expect.stringMatching(/^task-20000000-implement-task-service$/),
      "origin/main",
      detail.task.id,
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
        new RegExp(`^spire-task-run:${run.id}[\\s\\S]*host will inspect Git`),
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

    const recorded = await reportResult!({
      runId: run.id,
      outcome: "success",
      summary: "Implemented",
      tests: [{ command: "pnpm test", status: "passed", summary: "green" }],
    });
    expect(recorded.task.status).toBe("running");
    expect(dependencies.onChanged).toHaveBeenLastCalledWith(
      recorded.task.id,
      recorded.task.revision,
    );
    await settleAgent();
    const reported = await service.get(recorded.task.id);
    expect(reported.task.status).toBe("needs_review");
    expect(dependencies.notify).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "needs_review", runId: run.id }),
    );
  });

  async function startVerification(timeoutMs = 1000) {
    service = new TaskService(repository, dependencies, {
      randomUUID: () => ids[uuidIndex++]!,
      verificationTimeoutMs: timeoutMs,
    });
    const detail = await createRunningTask({
      ...createInput(true),
      verificationEnabled: true,
    });
    await reportResult!({
      runId: detail.runs[0]!.id,
      outcome: "success",
      summary: "Implemented",
      tests: [],
    });
    eventListener?.({ type: "agent_settled" });
    for (let i = 0; i < 30 && !verificationReportResult; i++)
      await new Promise<void>((resolve) => setImmediate(resolve));
    expect(verificationReportResult).toBeDefined();
    return detail;
  }

  const passEvidence = {
    acceptanceCriteria: [
      {
        criterion: "Works",
        status: "pass" as const,
        evidence: ["public command passed"],
      },
    ],
    commands: [],
    issues: [],
  };

  it("cancels a timed-out verifier, rejects late reports, and retries only verification with preserved history", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    try {
      const detail = await startVerification();
      const oldReport = verificationReportResult!;
      const original = repository.latestVerification(detail.task.id)!;
      await vi.advanceTimersByTimeAsync(1001);
      await service.whenIdle();
      const timedOut = await service.get(detail.task.id);
      expect(timedOut.task.status).toBe("needs_review");
      expect(timedOut.verification?.verdict).toBe("inconclusive");
      expect(timedOut.verification?.summary).toContain("timed out");
      expect(dependencies.abortSession).toHaveBeenCalledWith(
        managedWorktreeId,
        original.sessionId,
      );
      await expect(
        oldReport({
          verificationId: original.id,
          verdict: "pass",
          summary: "Late",
          evidence: passEvidence,
        }),
      ).rejects.toMatchObject({ code: "TASK_RESULT_INVALID" });
      expect(dependencies.deliverGitChanges).not.toHaveBeenCalled();
      verificationReportResult = undefined;
      await service.resumeVerification(
        detail.task.id,
        timedOut.task.revision,
        false,
      );
      for (let i = 0; i < 30 && !verificationReportResult; i++)
        await new Promise<void>((resolve) => setImmediate(resolve));
      const retry = repository.latestVerification(detail.task.id)!;
      expect(retry).toMatchObject({
        codingRunId: original.codingRunId,
        commitSha: original.commitSha,
        attempt: 2,
        verdict: null,
      });
      await verificationReportResult!({
        verificationId: retry.id,
        verdict: "pass",
        summary: "Reverified",
        evidence: passEvidence,
      });
      await service.whenIdle();
      expect((await service.get(detail.task.id)).runs).toHaveLength(1);
      expect(
        repository.listVerifications(detail.task.id).map((v) => v.verdict),
      ).toEqual(["pass", "inconclusive"]);
      expect(dependencies.createSession).toHaveBeenCalledTimes(1);
      expect(dependencies.prepareGitChanges).toHaveBeenCalledTimes(1);
      expect(dependencies.deliverGitChanges).toHaveBeenCalledTimes(1);
      await expect(
        service.resumeVerification(
          detail.task.id,
          (await service.get(detail.task.id)).task.revision,
          false,
        ),
      ).rejects.toMatchObject({ code: "TASK_INVALID_STATE" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets a valid report claimed before the deadline finish its bounded commit validation", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    try {
      const detail = await startVerification();
      let release!: () => void;
      vi.mocked(dependencies.validatePreparedGitChanges).mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );
      const verification = repository.latestVerification(detail.task.id)!;
      const reporting = verificationReportResult!({
        verificationId: verification.id,
        verdict: "pass",
        summary: "Good",
        evidence: passEvidence,
      });
      await vi.advanceTimersByTimeAsync(1001);
      expect(repository.getVerification(verification.id)?.verdict).toBeNull();
      expect(dependencies.abortSession).not.toHaveBeenCalled();
      release();
      await reporting;
      await service.whenIdle();
      expect((await service.get(detail.task.id)).verification?.verdict).toBe(
        "pass",
      );
      expect(dependencies.deliverGitChanges).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fences cancellation while a pass is being validated and stops the verification session", async () => {
    const detail = await startVerification(60000);
    let release!: () => void;
    vi.mocked(dependencies.validatePreparedGitChanges).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const verification = repository.latestVerification(detail.task.id)!;
    const reporting = verificationReportResult!({
      verificationId: verification.id,
      verdict: "pass",
      summary: "Good",
      evidence: passEvidence,
    });
    const assertion = expect(reporting).rejects.toMatchObject({
      code: "TASK_RESULT_INVALID",
    });
    const cancelled = await service.cancel(
      detail.task.id,
      (await service.get(detail.task.id)).task.revision,
    );
    release();
    await assertion;
    await service.whenIdle();
    expect(cancelled.task.status).toBe("cancelled");
    expect(dependencies.abortSession).toHaveBeenCalledWith(
      managedWorktreeId,
      verification.sessionId,
    );
    expect(dependencies.deliverGitChanges).not.toHaveBeenCalled();
  });

  it("recovers a legacy late pass into an audited new attempt and delivers once without any new agent", async () => {
    const detail = await createRunningTask({
      ...createInput(true),
      verificationEnabled: true,
    });
    await reportResult!({
      runId: detail.runs[0]!.id,
      outcome: "success",
      summary: "Implemented",
      tests: [],
    });
    await settleWithVerification("inconclusive");
    const original = repository.latestVerification(detail.task.id)!;
    database.connection
      .prepare("UPDATE task_verifications SET summary = ? WHERE id = ?")
      .run(
        "Verifier session timed out before submitting a verdict.",
        original.id,
      );
    const legacy = await service.get(detail.task.id);
    dependencies.readVerificationReport = vi.fn(async () => ({
      verificationId: original.id,
      verdict: "pass" as const,
      summary: "Independent evidence",
      evidence: passEvidence,
    }));
    const recovered = await service.resumeVerification(
      detail.task.id,
      legacy.task.revision,
      true,
    );
    expect(recovered.verification?.attempt).toBe(2);
    await service.whenIdle();
    expect((await service.get(detail.task.id)).runs).toHaveLength(1);
    expect(repository.getVerification(original.id)?.verdict).toBe(
      "inconclusive",
    );
    expect(dependencies.createVerificationSession).toHaveBeenCalledTimes(1);
    expect(dependencies.deliverGitChanges).toHaveBeenCalledTimes(1);
    expect(
      repository.listEvents(detail.task.id, { limit: 100 }),
    ).toContainEqual(
      expect.objectContaining({ type: "verification.recovered" }),
    );
  });

  it.each(["busy", "changed", "missing_report"])(
    "does not recover unsafe legacy evidence: %s",
    async (reason) => {
      const detail = await createRunningTask({
        ...createInput(true),
        verificationEnabled: true,
      });
      await reportResult!({
        runId: detail.runs[0]!.id,
        outcome: "success",
        summary: "Implemented",
        tests: [],
      });
      await settleWithVerification("inconclusive");
      const original = repository.latestVerification(detail.task.id)!;
      database.connection
        .prepare("UPDATE task_verifications SET summary = ? WHERE id = ?")
        .run(
          "Verifier session timed out before submitting a verdict.",
          original.id,
        );
      dependencies.readVerificationReport = vi.fn(async () => null);
      if (reason === "busy")
        vi.mocked(dependencies.isWorktreeBusy).mockResolvedValue(true);
      if (reason === "changed")
        vi.mocked(dependencies.validatePreparedGitChanges).mockRejectedValue(
          new Error("HEAD changed"),
        );
      await expect(
        service.resumeVerification(
          detail.task.id,
          (await service.get(detail.task.id)).task.revision,
          true,
        ),
      ).rejects.toBeDefined();
      expect(repository.listVerifications(detail.task.id)).toHaveLength(1);
      expect(dependencies.deliverGitChanges).not.toHaveBeenCalled();
    },
  );

  it("replays an unfinished verifier's durable structured report on restart without reopening its coding agent", async () => {
    const detail = await createRunningTask({
      ...createInput(true),
      verificationEnabled: true,
    });
    const run = detail.runs[0]!;
    await reportResult!({
      runId: run.id,
      outcome: "success",
      summary: "Implemented",
      tests: [],
    });
    repository.upsertRunStep(run.id, "git_preparation", "done", {
      changed: false,
      head: "a".repeat(40),
    });
    const verification = repository.createVerification({
      id: ids[uuidIndex++]!,
      taskId: detail.task.id,
      codingRunId: run.id,
      worktreeId: managedWorktreeId,
      commitSha: "a".repeat(40),
      deadlineAt: Date.now() + 60000,
    });
    repository.bindVerificationSession(verification.id, verification.id);
    dependencies.loadVerificationSession = vi.fn(async () => undefined);
    dependencies.readVerificationReport = vi.fn(async () => ({
      verificationId: verification.id,
      verdict: "pass" as const,
      summary: "Durable evidence",
      evidence: passEvidence,
    }));
    vi.mocked(dependencies.loadSession).mockClear();
    await service.recover();
    await service.whenIdle();
    expect((await service.get(detail.task.id)).verification?.verdict).toBe(
      "pass",
    );
    expect(dependencies.loadSession).not.toHaveBeenCalled();
    expect(dependencies.createVerificationSession).not.toHaveBeenCalled();
    expect(dependencies.deliverGitChanges).toHaveBeenCalledTimes(1);
  });

  it("shutdown cancels pending verification and drains without waiting for its deadline", async () => {
    const detail = await startVerification(60000);
    const verification = repository.latestVerification(detail.task.id)!;
    await service.dispose();
    expect(repository.getVerification(verification.id)?.verdict).toBe(
      "inconclusive",
    );
    expect(dependencies.abortSession).toHaveBeenCalledWith(
      managedWorktreeId,
      verification.sessionId,
    );
    expect(dependencies.deliverGitChanges).not.toHaveBeenCalled();
  });

  it("runs an independent verifier at the prepared commit before delivery", async () => {
    const input = { ...createInput(true), verificationEnabled: true };
    input.description = "Acceptance: the public command works";
    const detail = await createRunningTask(input);
    const run = detail.runs[0]!;
    await reportResult!({
      runId: run.id,
      outcome: "success",
      summary: "SECRET CODING SUMMARY",
      tests: [],
    });

    await settleWithVerification("pass");

    const final = await service.get(detail.task.id);
    expect(final.task.status).toBe("needs_review");
    expect(final.verification).toMatchObject({
      codingRunId: run.id,
      commitSha: "a".repeat(40),
      verdict: "pass",
    });
    const verificationPrompt = vi
      .mocked(dependencies.sendPrompt)
      .mock.calls.find(([, , prompt]) =>
        prompt.includes("spire-task-verification"),
      )?.[2];
    expect(verificationPrompt).toContain(input.title);
    expect(verificationPrompt).toContain(input.description);
    expect(verificationPrompt).not.toContain("SECRET CODING SUMMARY");
    expect(dependencies.createVerificationSession).toHaveBeenCalledWith(
      managedWorktreeId,
      expect.objectContaining({ sessionId: final.verification!.id }),
    );
    expect(final.verification?.sessionId).not.toBe(run.sessionId);
    expect(dependencies.deliverGitChanges).toHaveBeenCalledTimes(1);
    await expect(
      verificationReportResult!({
        verificationId: final.verification!.id,
        verdict: "pass",
        summary: "duplicate",
        evidence: { acceptanceCriteria: [], commands: [], issues: [] },
      }),
    ).rejects.toMatchObject({ code: "TASK_RESULT_INVALID" });
  });

  it("records verifier infrastructure failures as inconclusive without delivery", async () => {
    const detail = await createRunningTask({
      ...createInput(true),
      verificationEnabled: true,
    });
    vi.mocked(dependencies.createVerificationSession).mockRejectedValueOnce(
      new Error("model unavailable"),
    );
    await reportResult!({
      runId: detail.runs[0]!.id,
      outcome: "success",
      summary: "Implemented",
      tests: [],
    });

    await settleAgent();

    const final = await service.get(detail.task.id);
    expect(final.task.status).toBe("needs_review");
    expect(final.verification).toMatchObject({
      verdict: "inconclusive",
      summary: "Verifier infrastructure failed before a conclusive verdict.",
    });
    expect(final.verification?.evidence?.issues[0]?.summary).toBe(
      "model unavailable",
    );
    expect(dependencies.deliverGitChanges).not.toHaveBeenCalled();
  });

  it.each(["fail", "inconclusive"] as const)(
    "blocks delivery for a %s verification verdict",
    async (verdict) => {
      const detail = await createRunningTask({
        ...createInput(true),
        verificationEnabled: true,
      });
      await reportResult!({
        runId: detail.runs[0]!.id,
        outcome: "success",
        summary: "Implemented",
        tests: [],
      });

      await settleWithVerification(verdict);

      const final = await service.get(detail.task.id);
      expect(final.task.status).toBe("needs_review");
      expect(final.verification?.verdict).toBe(verdict);
      expect(dependencies.deliverGitChanges).not.toHaveBeenCalled();
    },
  );

  it("replaces an Agent-reported link with a Main-verified Ready change request", async () => {
    const detail = await createRunningTask(createInput(true));
    const run = detail.runs[0]!;
    vi.mocked(dependencies.deliverGitChanges).mockResolvedValueOnce({
      changed: true,
      head: "b".repeat(40),
      changeRequest: {
        kind: "github_pr",
        url: "https://github.com/acme/widgets/pull/12",
        draft: false,
      },
    });

    await reportResult!({
      runId: run.id,
      outcome: "success",
      summary: "Implemented",
      tests: [],
      changeRequest: {
        kind: "other",
        url: "https://untrusted.example/change/1",
        draft: true,
      },
    });
    await settleAgent();

    const reported = await service.get(detail.task.id);
    expect(reported.task.status).toBe("needs_review");
    expect(reported.runs[0]?.report?.changeRequest).toEqual({
      kind: "github_pr",
      url: "https://github.com/acme/widgets/pull/12",
      draft: false,
    });
    expect(reported.task.metadata.review).toEqual(
      reported.runs[0]?.report?.changeRequest,
    );
  });

  it("preserves a safe host delivery error rather than flattening it to TASK_FAILED", async () => {
    const detail = await createRunningTask(createInput(true));
    dependencies.onFailure = vi.fn();
    vi.mocked(dependencies.deliverGitChanges).mockRejectedValueOnce(
      Object.assign(new Error("token=do-not-persist /private/user"), {
        code: "GIT_TIMED_OUT",
      }),
    );
    await reportResult!({
      runId: detail.runs[0]!.id,
      outcome: "success",
      summary: "Code succeeded",
      tests: [],
    });
    await settleAgent();
    const failed = await service.get(detail.task.id);
    expect(failed.runs[0]?.error).toMatchObject({
      code: "TASK_DELIVERY_GIT_TIMED_OUT",
      retryable: true,
    });
    expect(failed.runs[0]?.error?.message).not.toContain("do-not-persist");
    expect(failed.runs[0]?.report?.summary).toBe("Code succeeded");
    expect(dependencies.onFailure).toHaveBeenCalledWith({
      code: "TASK_DELIVERY_GIT_TIMED_OUT",
      errorType: "TaskDeliveryError",
    });
  });

  it("reconciles an exact merged receipt on startup without rerunning code, verification, or publication", async () => {
    const detail = await createRunningTask(createInput(true));
    vi.mocked(dependencies.deliverGitChanges).mockRejectedValueOnce(
      new TaskDeliveryError("TASK_DELIVERY_CLI_MISSING", "CLI missing", true),
    );
    await reportResult!({
      runId: detail.runs[0]!.id,
      outcome: "success",
      summary: "Implemented",
      tests: [],
    });
    await settleAgent();
    const failed = await service.get(detail.task.id);
    const deliveryCalls = vi.mocked(dependencies.deliverGitChanges).mock.calls
      .length;
    const promptCalls = vi.mocked(dependencies.sendPrompt).mock.calls.length;
    const review = {
      kind: "github_pr" as const,
      url: "https://github.com/acme/widgets/pull/20",
      draft: false,
    };
    dependencies.findMergedGitDelivery = vi.fn(async () => ({
      changed: true,
      head: "a".repeat(40),
      changeRequest: review,
    }));
    await service.recover();
    await service.whenIdle();
    const recovered = await service.get(detail.task.id);
    expect(recovered.task.status).toBe("needs_review");
    expect(recovered.task.metadata.review).toEqual(review);
    expect(recovered.runs).toHaveLength(1);
    expect(recovered.runs[0]?.id).toBe(failed.runs[0]?.id);
    expect(recovered.runs[0]?.report?.changeRequest).toEqual(review);
    expect(recovered.runs[0]?.error).toBeNull();
    expect(dependencies.deliverGitChanges).toHaveBeenCalledTimes(deliveryCalls);
    expect(dependencies.sendPrompt).toHaveBeenCalledTimes(promptCalls);
    expect(dependencies.createVerificationSession).not.toHaveBeenCalled();
    expect(repository.listRunSteps(recovered.runs[0]!.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ step: "git_delivery", state: "done" }),
      ]),
    );
    expect(
      repository
        .listEvents(detail.task.id, { limit: 50 })
        .some((event) => event.type === "delivery.reconciled"),
    ).toBe(true);
    await service.recover();
    await service.whenIdle();
    expect(dependencies.findMergedGitDelivery).toHaveBeenCalledTimes(1);
  });

  it("leaves failed tasks unchanged on startup without an exact receipt or when the CLI is unavailable", async () => {
    const detail = await createRunningTask(createInput(true));
    vi.mocked(dependencies.deliverGitChanges).mockRejectedValueOnce(
      new TaskDeliveryError("TASK_DELIVERY_CLI_MISSING", "CLI missing", true),
    );
    await reportResult!({
      runId: detail.runs[0]!.id,
      outcome: "success",
      summary: "Implemented",
      tests: [],
    });
    await settleAgent();
    const failed = await service.get(detail.task.id);
    dependencies.findMergedGitDelivery = vi.fn(async () => null);
    await service.recover();
    await service.whenIdle();
    expect((await service.get(detail.task.id)).task).toEqual(failed.task);
    dependencies.findMergedGitDelivery = vi.fn(async () => {
      throw new Error("network down");
    });
    await service.recover();
    await service.whenIdle();
    expect((await service.get(detail.task.id)).task).toEqual(failed.task);
    expect(dependencies.sendPrompt).toHaveBeenCalledTimes(1);
    expect(dependencies.deliverGitChanges).toHaveBeenCalledTimes(1);
  });

  it("does not overwrite a concurrently edited Task during receipt lookup", async () => {
    const detail = await createRunningTask(createInput(true));
    vi.mocked(dependencies.deliverGitChanges).mockRejectedValueOnce(
      new TaskDeliveryError("TASK_DELIVERY_CLI_MISSING", "CLI missing", true),
    );
    await reportResult!({
      runId: detail.runs[0]!.id,
      outcome: "success",
      summary: "Implemented",
      tests: [],
    });
    await settleAgent();
    const failed = await service.get(detail.task.id);
    dependencies.findMergedGitDelivery = vi.fn(async () => {
      repository.updateTask(failed.task.id, failed.task.revision, {
        title: "Edited concurrently",
        description: failed.task.description,
        workspace: failed.task.workspace,
        automationEnabled: failed.task.automationEnabled,
        verificationEnabled: failed.task.verificationEnabled,
      });
      return {
        changed: true,
        head: "a".repeat(40),
        changeRequest: {
          kind: "github_pr" as const,
          url: "https://github.com/acme/widgets/pull/20",
          draft: false,
        },
      };
    });
    await service.recover();
    await service.whenIdle();
    const current = await service.get(detail.task.id);
    expect(current.task.title).toBe("Edited concurrently");
    expect(current.task.status).toBe("failed");
    expect(current.task.metadata).toEqual({});
    expect(current.runs[0]?.error).toEqual(failed.runs[0]?.error);
  });

  it("skips receipt reconciliation for a dirty or busy workspace", async () => {
    const detail = await createRunningTask(createInput(true));
    vi.mocked(dependencies.deliverGitChanges).mockRejectedValueOnce(
      new TaskDeliveryError("TASK_DELIVERY_CLI_MISSING", "CLI missing", true),
    );
    await reportResult!({
      runId: detail.runs[0]!.id,
      outcome: "success",
      summary: "Implemented",
      tests: [],
    });
    await settleAgent();
    dependencies.findMergedGitDelivery = vi.fn(async () => null);
    vi.mocked(dependencies.getWorktree).mockResolvedValue({
      id: managedWorktreeId,
      projectId,
      dirty: true,
      busy: false,
    });
    await service.recover();
    await service.whenIdle();
    expect(dependencies.findMergedGitDelivery).not.toHaveBeenCalled();
    expect((await service.get(detail.task.id)).task.status).toBe("failed");
  });

  it("recovers a merged PR from an explicit retry without creating another run", async () => {
    const detail = await createRunningTask(createInput(true));
    vi.mocked(dependencies.deliverGitChanges).mockRejectedValueOnce(
      new TaskDeliveryError("TASK_DELIVERY_CLI_MISSING", "CLI missing", true),
    );
    await reportResult!({
      runId: detail.runs[0]!.id,
      outcome: "success",
      summary: "Implemented",
      tests: [],
    });
    await settleAgent();
    const failed = await service.get(detail.task.id);
    dependencies.findMergedGitDelivery = vi.fn(async () => ({
      changed: true,
      head: "a".repeat(40),
      changeRequest: {
        kind: "github_pr" as const,
        url: "https://github.com/acme/widgets/pull/20",
        draft: false,
      },
    }));
    const recovered = await service.run(failed.task.id, failed.task.revision);
    expect(recovered.task.status).toBe("needs_review");
    expect(recovered.runs).toHaveLength(1);
    expect(dependencies.deliverGitChanges).toHaveBeenCalledTimes(1);
    expect(dependencies.createSession).toHaveBeenCalledTimes(1);
  });

  it("fails instead of entering review when required Git delivery fails", async () => {
    const detail = await createRunningTask(createInput(true));
    const run = detail.runs[0]!;
    vi.mocked(dependencies.deliverGitChanges).mockRejectedValueOnce(
      new TaskDeliveryError(
        "TASK_DELIVERY_PUSH_FAILED",
        "The task branch could not be pushed to origin",
        true,
      ),
    );
    await reportResult!({
      runId: run.id,
      outcome: "success",
      summary: "Implemented",
      tests: [],
    });

    await settleAgent();

    const failed = await service.get(detail.task.id);
    expect(failed.task.status).toBe("failed");
    expect(failed.task.metadata).toEqual({});
    expect(failed.runs[0]?.error).toMatchObject({
      code: "TASK_DELIVERY_PUSH_FAILED",
      retryable: true,
    });

    vi.mocked(dependencies.deliverGitChanges).mockResolvedValueOnce({
      changed: true,
      head: "b".repeat(40),
      changeRequest: {
        kind: "github_pr",
        url: "https://github.com/acme/widgets/pull/13",
        draft: false,
      },
    });
    const promptCalls = vi.mocked(dependencies.sendPrompt).mock.calls.length;
    const retrying = await service.run(failed.task.id, failed.task.revision);
    expect(retrying.runs).toHaveLength(1);
    await service.whenIdle();
    const recovered = await service.get(failed.task.id);
    expect(recovered.task.status).toBe("needs_review");
    expect(recovered.runs[0]?.attempt).toBe(run.attempt);
    expect(recovered.task.metadata.review).toEqual(
      recovered.runs[0]?.report?.changeRequest,
    );
    expect(dependencies.sendPrompt).toHaveBeenCalledTimes(promptCalls);
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
    const queued = await service.run(manual.task.id, manual.task.revision);
    expect(queued.task.status).toBe("queued");
    await service.whenIdle();
    expect((await service.get(manual.task.id)).runs[0]?.error).toMatchObject({
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
      const task = await createRunningTask({
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
    expect((await service.get(third.task.id)).task.status).toBe("running");
    expect((await service.get(details[3]!.task.id)).runs[0]?.status).toBe(
      "queued",
    );
    await settleAgent();

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
    const fifth = await createRunningTask({
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
    const created = await createRunningTask(createInput(true));
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
    const first = await createRunningTask(createInput(true));
    const cancelled = await service.cancel(first.task.id, first.task.revision);
    expect(dependencies.abortSession).toHaveBeenCalled();
    expect(cancelled.task.status).toBe("cancelled");

    const retry = await runTask(cancelled);
    const run = retry.runs[0]!;
    await reportResult!({
      runId: run.id,
      outcome: "blocked",
      summary: "Needs input",
      tests: [],
    });
    await settleAgent();
    const review = await service.get(retry.task.id);
    const sessionCreatesBeforeChanges = vi.mocked(dependencies.createSession)
      .mock.calls.length;
    const queuedChanges = await service.requestChanges(
      review.task.id,
      review.task.revision,
      "Address review feedback",
    );
    expect(queuedChanges.task.status).toBe("queued");
    await service.whenIdle();
    const changes = await service.get(review.task.id);
    expect(changes.runs[0]?.attempt).toBe(3);
    expect(changes.runs[0]?.sessionId).toBe(run.sessionId);
    expect(dependencies.createSession).toHaveBeenCalledTimes(
      sessionCreatesBeforeChanges,
    );
    expect(dependencies.attachSession).toHaveBeenCalledWith(
      managedWorktreeId,
      run.sessionId,
      expect.any(Object),
    );

    await reportResult!({
      runId: changes.runs[0]!.id,
      outcome: "success",
      summary: "Done",
      tests: [],
    });
    await settleAgent();
    const secondReview = await service.get(changes.task.id);
    const completed = await service.complete(
      secondReview.task.id,
      secondReview.task.revision,
    );
    expect(completed.task.status).toBe("completed");
    expect(completed.task.completedAt).not.toBeNull();
  });

  it("carries the same verified change request into a no-change Request changes report", async () => {
    const changeRequest = {
      kind: "github_pr" as const,
      url: "https://github.com/acme/widgets/pull/21",
      draft: false,
    };
    vi.mocked(dependencies.deliverGitChanges)
      .mockResolvedValueOnce({
        changed: true,
        head: "b".repeat(40),
        changeRequest,
      })
      .mockImplementationOnce(async (_worktreeId, input) => {
        expect(input.priorChangeRequest).toEqual(changeRequest);
        return {
          changed: false,
          head: "b".repeat(40),
          changeRequest,
        };
      });
    const first = await createRunningTask(createInput(true));
    await reportResult!({
      runId: first.runs[0]!.id,
      outcome: "success",
      summary: "First delivery",
      tests: [],
    });
    await settleAgent();
    const review = await service.get(first.task.id);
    await service.requestChanges(
      review.task.id,
      review.task.revision,
      "No code change needed",
    );
    await service.whenIdle();
    const followUp = await service.get(first.task.id);
    await reportResult!({
      runId: followUp.runs[0]!.id,
      outcome: "success",
      summary: "Confirmed",
      tests: [],
    });
    await settleAgent();

    const final = await service.get(first.task.id);
    expect(final.runs[0]?.report?.changeRequest).toEqual(changeRequest);
    expect(final.runs[1]?.report?.changeRequest).toEqual(changeRequest);
    expect(final.task.metadata.review).toEqual(changeRequest);
  });

  it("retains Task review metadata when a later Run has no new verified review", async () => {
    const changeRequest = {
      kind: "gitlab_mr" as const,
      url: "https://gitlab.com/acme/widgets/-/merge_requests/22",
      draft: true,
    };
    vi.mocked(dependencies.deliverGitChanges)
      .mockResolvedValueOnce({
        changed: true,
        head: "b".repeat(40),
        changeRequest,
      })
      .mockResolvedValueOnce({
        changed: false,
        head: "b".repeat(40),
      });
    const first = await createRunningTask(createInput(true));
    await reportResult!({
      runId: first.runs[0]!.id,
      outcome: "success",
      summary: "First delivery",
      tests: [],
    });
    await settleAgent();
    const review = await service.get(first.task.id);
    await service.requestChanges(
      review.task.id,
      review.task.revision,
      "No follow-up delivery needed",
    );
    await service.whenIdle();
    const followUp = await service.get(first.task.id);
    await reportResult!({
      runId: followUp.runs[0]!.id,
      outcome: "success",
      summary: "No code changes",
      tests: [],
    });
    await settleAgent();

    const final = await service.get(first.task.id);
    expect(final.runs[0]?.report?.changeRequest).toBeUndefined();
    expect(final.task.metadata.review).toEqual(changeRequest);
  });

  it("reuses the Task-level resolved workspace when the latest failed run never bound one", async () => {
    const first = await createRunningTask(createInput(true));
    const cancelled = await service.cancel(first.task.id, first.task.revision);
    const unbound = repository.createRun(
      cancelled.task.id,
      cancelled.task.revision,
      {
        id: "d0000000-0000-4000-8000-000000000001",
        projectId,
        promptMarker: "unbound-run-marker",
        ownsManagedWorktree: true,
        worktreeName: "must-not-be-created",
        baseRef: "origin/main",
      },
    );
    const failed = repository.failRun(unbound.run.id, unbound.run.revision, {
      code: "TASK_PROJECT_NOT_FOUND",
      message: "Failed before workspace binding",
      retryable: true,
    });

    const retried = await runTask({
      task: failed.task,
      runs: [],
      verification: null,
    });

    expect(retried.runs[0]).toMatchObject({
      status: "running",
      worktreeId: managedWorktreeId,
      worktreeName: first.runs[0]?.worktreeName,
    });
    expect(dependencies.createWorktree).toHaveBeenCalledTimes(1);
  });

  it("persists clean-only managed workspace cleanup and safely retries a blocked cleanup", async () => {
    const started = await createRunningTask(createInput(true));
    const run = started.runs[0]!;
    await reportResult!({
      runId: run.id,
      outcome: "success",
      summary: "Done",
      tests: [],
    });
    await settleAgent();
    let detail = await service.get(started.task.id);
    detail = await service.complete(detail.task.id, detail.task.revision);

    vi.mocked(dependencies.inspectWorktreeForCleanup).mockResolvedValue({
      id: managedWorktreeId,
      projectId,
      dirty: true,
      busy: false,
    });
    detail = await service.cleanupWorkspace(
      detail.task.id,
      detail.task.revision,
    );
    expect(detail.task).toMatchObject({
      workspaceCleanupStatus: "blocked",
      workspaceCleanupErrorCode: "TASK_WORKSPACE_DIRTY_CONFIRMATION_REQUIRED",
    });
    expect(dependencies.deleteWorktree).not.toHaveBeenCalled();

    vi.mocked(dependencies.inspectWorktreeForCleanup).mockResolvedValue({
      id: managedWorktreeId,
      projectId,
      dirty: false,
      busy: false,
    });
    const cleaned = await service.cleanupWorkspace(
      detail.task.id,
      detail.task.revision,
    );
    expect(dependencies.deleteWorktree).toHaveBeenCalledWith(managedWorktreeId);
    expect(cleaned.task).toMatchObject({
      workspaceCleanupStatus: "removed",
      workspaceCleanedAt: 1_700_000_000_000,
    });
  });

  it("retains an owned workspace referenced by another Task's history", async () => {
    const started = await createRunningTask(createInput(true));
    await reportResult!({
      runId: started.runs[0]!.id,
      outcome: "success",
      summary: "Done",
      tests: [],
    });
    await settleAgent();
    let owner = await service.get(started.task.id);
    owner = await service.complete(owner.task.id, owner.task.revision);

    const other = repository.createTask({
      id: "e0000000-0000-4000-8000-000000000001",
      title: "Historical consumer",
      description: "Used the same checkout",
      projectId,
      workspace: {
        mode: "existing",
        worktreeId: managedWorktreeId,
        allowDirty: false,
      },
      automationEnabled: false,
    });
    const otherRun = repository.createRun(other.id, other.revision, {
      id: "e0000000-0000-4000-8000-000000000002",
      projectId,
      promptMarker: "historical-consumer-marker",
      ownsManagedWorktree: false,
      worktreeId: managedWorktreeId,
    });
    repository.failRun(otherRun.run.id, otherRun.run.revision, {
      code: "TASK_FAILED",
      message: "Historical attempt ended",
      retryable: false,
    });

    const retained = await service.cleanupWorkspace(
      owner.task.id,
      owner.task.revision,
    );

    expect(retained.task).toMatchObject({
      workspaceCleanupStatus: "blocked",
      workspaceCleanupErrorCode: "TASK_WORKSPACE_REFERENCED",
    });
    expect(dependencies.deleteWorktree).not.toHaveBeenCalled();
  });

  it("converges a durable cleanup intent when the checkout is already absent", async () => {
    const started = await createRunningTask(createInput(true));
    await reportResult!({
      runId: started.runs[0]!.id,
      outcome: "success",
      summary: "Done",
      tests: [],
    });
    await settleAgent();
    let detail = await service.get(started.task.id);
    detail = await service.complete(detail.task.id, detail.task.revision);
    repository.beginWorkspaceCleanup(detail.task.id, detail.task.revision);
    vi.mocked(dependencies.inspectWorktreeForCleanup).mockResolvedValue(null);

    await service.recover();

    expect(
      (await service.get(detail.task.id)).task.workspaceCleanupStatus,
    ).toBe("removed");
    expect(dependencies.deleteWorktree).not.toHaveBeenCalled();
  });

  it("does not duplicate the same in-memory run", async () => {
    const manual = await service.create(createInput(false));
    const [a, b] = await Promise.all([
      service.run(manual.task.id, manual.task.revision),
      service.run(manual.task.id, manual.task.revision),
    ]);
    expect(a.task.id).toBe(b.task.id);
    expect(a.runs[0]?.id).toBe(b.runs[0]?.id);
    expect(a.task.status).toBe("queued");
    await service.whenIdle();
    expect(dependencies.createWorktree).toHaveBeenCalledTimes(1);
    expect(dependencies.createSession).toHaveBeenCalledTimes(1);
    expect(dependencies.sendPrompt).toHaveBeenCalledTimes(1);
  });

  it("recreates a bound empty session when restart happens before prompt persistence", async () => {
    const manual = await service.create(createInput(false));
    const sessionId = "80000000-0000-4000-8000-000000000001";
    const created = repository.createRun(manual.task.id, manual.task.revision, {
      id: "70000000-0000-4000-8000-000000000001",
      projectId,
      promptMarker: "restart-before-prompt",
      ownsManagedWorktree: true,
      worktreeName: "task-restart-before-prompt",
      baseRef: "origin/main",
      worktreeId: managedWorktreeId,
      sessionId,
      sessionPath: null,
    });
    const provisioning = repository.transitionRun(
      created.run.id,
      created.run.revision,
      "provisioning",
      { sagaPhase: "workspace_ready" },
    ).run;
    repository.transitionRun(
      provisioning.id,
      provisioning.revision,
      "prompting",
      { sagaPhase: "session_ready" },
    );
    sessionBinding = { sessionId, sessionPath: null };
    vi.mocked(dependencies.attachSession).mockRejectedValueOnce(
      Object.assign(new Error("missing"), {
        code: "CHAT_SESSION_NOT_FOUND",
      }),
    );

    await service.recover();
    await service.whenIdle();

    expect(dependencies.createSession).toHaveBeenCalledTimes(1);
    expect(dependencies.sendPrompt).toHaveBeenCalledTimes(1);
    expect((await service.get(manual.task.id)).runs[0]).toMatchObject({
      id: created.run.id,
      status: "running",
      sessionId,
    });
  });

  it("keeps a bound run active and recoverable when abort-before-failure cannot stop its session", async () => {
    vi.mocked(dependencies.sendPrompt).mockRejectedValueOnce(
      new Error("prompt transport failed"),
    );
    vi.mocked(dependencies.abortSession).mockRejectedValueOnce(
      new Error("abort transport failed"),
    );

    const created = await createRunningTask(createInput(true));

    expect(created.runs[0]?.status).toBe("prompting");
    expect(repository.listRunSteps(created.runs[0]!.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ step: "failure_stop", state: "failed" }),
      ]),
    );
    expect(created.task.activeRunId).toBe(created.runs[0]?.id);

    await service.recover();
    expect(dependencies.loadSession).toHaveBeenCalledWith(
      created.runs[0]?.worktreeId,
      created.runs[0]?.sessionId,
      expect.any(Object),
    );
    expect((await service.get(created.task.id)).runs[0]).toMatchObject({
      status: "failed",
      error: { message: "Task orchestration failed" },
    });
  });

  it("preserves the original failure while a transient session reload error defers recovery", async () => {
    vi.mocked(dependencies.sendPrompt).mockResolvedValueOnce({
      accepted: false,
    });
    vi.mocked(dependencies.abortSession).mockRejectedValueOnce(
      new Error("abort transport failed"),
    );
    const created = await createRunningTask(createInput(true));
    vi.mocked(dependencies.loadSession).mockRejectedValueOnce(
      new Error("temporary reload failure"),
    );

    await service.recover();

    expect(repository.listRunSteps(created.runs[0]!.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          step: "failure_stop",
          state: "failed",
          details: expect.objectContaining({
            code: "TASK_PROMPT_FAILED",
            failureMessage: "Task prompt was not accepted",
          }),
        }),
      ]),
    );
    expect((await service.get(created.task.id)).runs[0]?.status).toBe(
      "prompting",
    );

    await service.recover();
    expect((await service.get(created.task.id)).runs[0]?.error).toMatchObject({
      code: "TASK_PROMPT_FAILED",
      message: "Task prompt was not accepted",
    });
  });

  it("finalizes failure when restart recovery proves the persisted session is missing", async () => {
    vi.mocked(dependencies.sendPrompt).mockRejectedValueOnce(
      new Error("prompt transport failed"),
    );
    vi.mocked(dependencies.abortSession).mockRejectedValueOnce(
      new Error("abort transport failed"),
    );
    const created = await createRunningTask(createInput(true));
    vi.mocked(dependencies.abortSession).mockClear();
    vi.mocked(dependencies.loadSession).mockRejectedValueOnce(
      Object.assign(new Error("Chat session not found"), {
        code: "CHAT_SESSION_NOT_FOUND",
      }),
    );

    await service.recover();

    expect(dependencies.abortSession).not.toHaveBeenCalled();
    expect((await service.get(created.task.id)).runs[0]?.status).toBe("failed");
    expect(repository.listRunSteps(created.runs[0]!.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ step: "failure_stop", state: "done" }),
      ]),
    );
  });

  it("finalizes failure after recovering a completed failure-stop intent", async () => {
    const created = await createRunningTask(createInput(true));
    repository.upsertRunStep(created.runs[0]!.id, "failure_stop", "done", {
      code: "TASK_PROMPT_FAILED",
      failureMessage: "Prompt failed after session bind",
      retryable: true,
    });

    await service.recover();

    expect(dependencies.abortSession).not.toHaveBeenCalled();
    expect((await service.get(created.task.id)).runs[0]).toMatchObject({
      status: "failed",
      error: {
        code: "TASK_PROMPT_FAILED",
        message: "Prompt failed after session bind",
        retryable: true,
      },
    });
  });

  it("finalizes a report that arrives after the settled event", async () => {
    const created = await createRunningTask(createInput(true));
    await settleAgent();
    expect((await service.get(created.task.id)).runs[0]?.status).toBe(
      "awaiting_report",
    );
    vi.mocked(dependencies.sessionStatus).mockResolvedValue("idle");

    const reported = await reportResult!({
      runId: created.runs[0]!.id,
      outcome: "success",
      summary: "Late report",
      tests: [],
    });

    expect(reported.task.status).toBe("needs_review");
    expect(reported.runs[0]?.status).toBe("reported");
  });

  it("finalizes a durably reported run only after recovery confirms the session is idle", async () => {
    const created = await createRunningTask(createInput(true));
    await reportResult!({
      runId: created.runs[0]!.id,
      outcome: "success",
      summary: "Done before restart",
      tests: [],
    });
    vi.mocked(dependencies.sessionStatus).mockResolvedValue("idle");

    await service.recover();

    const recovered = await service.get(created.task.id);
    expect(recovered.task.status).toBe("needs_review");
    expect(recovered.runs[0]).toMatchObject({ status: "reported" });
  });

  it("replays a persisted verified delivery into metadata after a crash", async () => {
    const created = await createRunningTask(createInput(true));
    await reportResult!({
      runId: created.runs[0]!.id,
      outcome: "success",
      summary: "Done before delivery snapshot update",
      tests: [],
    });
    const changeRequest = {
      kind: "github_pr" as const,
      url: "https://github.com/acme/widgets/pull/30",
      draft: false,
    };
    repository.upsertRunStep(created.runs[0]!.id, "git_delivery", "done", {
      changed: true,
      head: "b".repeat(40),
      changeRequest,
    });
    vi.mocked(dependencies.sessionStatus).mockResolvedValue("idle");

    await service.recover();

    const recovered = await service.get(created.task.id);
    expect(recovered.task.metadata.review).toEqual(changeRequest);
    expect(recovered.runs[0]?.report?.changeRequest).toEqual(changeRequest);
    expect(dependencies.deliverGitChanges).not.toHaveBeenCalled();
  });

  it("converges a recovered idle running session to awaiting_report", async () => {
    const created = await createRunningTask(createInput(true));
    vi.mocked(dependencies.sessionStatus).mockResolvedValue("idle");

    await service.recover();

    const recovered = await service.get(created.task.id);
    expect(recovered.runs[0]?.status).toBe("awaiting_report");
    expect(dependencies.notify).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "awaiting_report" }),
    );
  });

  it("recovers a durable cancel intent by aborting once and completing cancellation", async () => {
    const created = await createRunningTask(createInput(true));
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
