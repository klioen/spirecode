import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openTaskDatabase, type TaskDatabase } from "./database.js";
import { TaskRepository } from "./repository.js";
import type { CreateTaskInput, TaskRunReport } from "./types.js";

const directories: string[] = [];
let database: TaskDatabase;
let repository: TaskRepository;
let databasePath: string;
let now: number;

const taskInput: CreateTaskInput = {
  id: "10000000-0000-4000-8000-000000000001",
  title: "  Ship task foundation  ",
  description: "Persist tasks safely",
  projectId: "20000000-0000-4000-8000-000000000001",
  workspace: { mode: "new_managed", baseRef: "refs/remotes/origin/main" },
  automationEnabled: false,
};

beforeEach(() => {
  const directory = mkdtempSync(join(tmpdir(), "spire-task-repository-"));
  directories.push(directory);
  now = 1_700_000_000_000;
  databasePath = join(directory, "tasks.sqlite3");
  database = openTaskDatabase(databasePath, {
    now: () => now,
  });
  repository = new TaskRepository(database.connection, { now: () => now });
});

afterEach(() => {
  database.close();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function createTask() {
  return repository.createTask(taskInput);
}

function createRun(expectedRevision = 1) {
  return repository.createRun(taskInput.id, expectedRevision, {
    id: "40000000-0000-4000-8000-000000000001",
    projectId: taskInput.projectId,
    promptMarker: "spire-task-run:40000000-0000-4000-8000-000000000001",
    ownsManagedWorktree: true,
    worktreeName: "task-40000000-ship-task-foundation",
    baseRef: "refs/remotes/origin/main",
  });
}

describe("TaskRepository", () => {
  it("searches literal text and scopes attention tasks in the durable list", () => {
    createTask();
    repository.createTask({
      ...taskInput,
      id: "10000000-0000-4000-8000-000000000002",
      title: "Literal 100%_done",
      description: "",
      projectId: "20000000-0000-4000-8000-000000000002",
    });
    expect(
      repository
        .listTasks({ limit: 10, query: "100%_" })
        .items.map((task) => task.title),
    ).toEqual(["Literal 100%_done"]);
    expect(
      repository.listTasks({ limit: 10, projectId: taskInput.projectId }).items,
    ).toHaveLength(1);
    const { run } = createRun();
    const provisioning = repository.transitionRun(
      run.id,
      run.revision,
      "provisioning",
      { taskStatus: "running" },
    ).run;
    const prompting = repository.transitionRun(
      run.id,
      provisioning.revision,
      "prompting",
    ).run;
    const running = repository.transitionRun(
      run.id,
      prompting.revision,
      "running",
    ).run;
    expect(
      repository.listTasks({
        limit: 10,
        attentionOnly: true,
        projectId: taskInput.projectId,
      }).items,
    ).toHaveLength(0);
    repository.transitionRun(run.id, running.revision, "awaiting_report");
    expect(
      repository.listTasks({
        limit: 10,
        attentionOnly: true,
        projectId: taskInput.projectId,
      }).items,
    ).toHaveLength(1);
  });

  it("commits a task and its initial queued run together", () => {
    const runId = "40000000-0000-4000-8000-000000000001";
    const created = repository.createTask(
      { ...taskInput, automationEnabled: true },
      {
        id: runId,
        projectId: taskInput.projectId,
        promptMarker: `spire-task-run:${runId}`,
        ownsManagedWorktree: true,
      },
    );

    expect(created).toMatchObject({
      status: "queued",
      activeRunId: runId,
      revision: 2,
    });
    expect(repository.getRun(runId)).toMatchObject({
      taskId: created.id,
      status: "queued",
      sagaPhase: "created",
    });
  });

  it("rolls back task creation when the initial queued run cannot be stored", () => {
    expect(() =>
      repository.createTask(
        { ...taskInput, automationEnabled: true },
        {
          id: "40000000-0000-4000-8000-000000000001",
          projectId: taskInput.projectId,
          promptMarker: "",
          ownsManagedWorktree: true,
        },
      ),
    ).toThrowError(expect.objectContaining({ code: "TASK_RESULT_INVALID" }));

    expect(repository.getTask(taskInput.id)).toBeNull();
    expect(repository.listActiveRuns()).toEqual([]);
  });

  it("creates, gets, and lists normalized tasks", () => {
    const created = createTask();
    expect(created).toMatchObject({
      title: "Ship task foundation",
      metadata: {},
      status: "backlog",
      revision: 1,
      workspace: { mode: "new_managed", baseRef: "refs/remotes/origin/main" },
    });
    expect(repository.getTask(created.id)).toEqual(created);
    expect(repository.listTasks({ limit: 10 })).toEqual({
      items: [created],
      nextCursor: null,
    });
  });

  it("updates editable task fields with a revision guard", () => {
    const created = createTask();
    const updated = repository.updateTask(created.id, created.revision, {
      title: "Ship the complete task foundation",
      description: "Updated scope",
      workspace: taskInput.workspace,
      automationEnabled: false,
    });

    expect(updated).toMatchObject({
      title: "Ship the complete task foundation",
      description: "Updated scope",
      automationEnabled: false,
      revision: 2,
    });
    expect(() =>
      repository.updateTask(created.id, created.revision, {
        title: "Stale",
        description: "",
        workspace: taskInput.workspace,
        automationEnabled: false,
      }),
    ).toThrowError(expect.objectContaining({ code: "TASK_CONFLICT" }));
  });

  it("paginates deterministically and filters fixed statuses", () => {
    createTask();
    now += 1;
    repository.createTask({
      ...taskInput,
      id: "10000000-0000-4000-8000-000000000002",
      title: "Second",
    });

    const first = repository.listTasks({ limit: 1, statuses: ["backlog"] });
    expect(first.items.map((task) => task.title)).toEqual(["Second"]);
    expect(first.nextCursor).not.toBeNull();
    const second = repository.listTasks({ limit: 1, cursor: first.nextCursor });
    expect(second.items.map((task) => task.title)).toEqual([
      "Ship task foundation",
    ]);
  });

  it("uses revision guards and creates only one active run", () => {
    createTask();
    const { task, run } = createRun();
    expect(task).toMatchObject({
      status: "queued",
      activeRunId: run.id,
      revision: 2,
    });
    expect(run).toMatchObject({
      attempt: 1,
      status: "queued",
      sagaPhase: "created",
      revision: 1,
    });
    expect(repository.taskCounts()).toEqual({
      incompleteCount: 1,
      activeCount: 1,
    });

    expect(() => createRun(1)).toThrowError(
      expect.objectContaining({ code: "TASK_CONFLICT" }),
    );
    expect(() =>
      repository.createRun(taskInput.id, 2, {
        id: "40000000-0000-4000-8000-000000000002",
        projectId: taskInput.projectId,
        promptMarker: "spire-task-run:40000000-0000-4000-8000-000000000002",
        ownsManagedWorktree: false,
      }),
    ).toThrowError(expect.objectContaining({ code: "TASK_ACTIVE_RUN_EXISTS" }));
  });

  it("transitions task and run atomically with revision checks", () => {
    createTask();
    const { run } = createRun();
    now += 1;
    const updated = repository.transitionRun(run.id, 1, "provisioning", {
      sagaPhase: "workspace_intent",
      taskStatus: "running",
    });
    expect(updated.run).toMatchObject({
      status: "provisioning",
      sagaPhase: "workspace_intent",
      revision: 2,
    });
    expect(updated.task).toMatchObject({ status: "running", revision: 3 });

    expect(() => repository.transitionRun(run.id, 1, "prompting")).toThrowError(
      expect.objectContaining({ code: "TASK_CONFLICT" }),
    );
    expect(() => repository.transitionRun(run.id, 2, "reported")).toThrowError(
      expect.objectContaining({ code: "TASK_INVALID_STATE" }),
    );
  });

  it("lists runs newest-first and keeps reporting on the dedicated path", () => {
    createTask();
    const { run } = createRun();
    expect(repository.listRuns(taskInput.id, { limit: 10 })).toEqual({
      items: [run],
      nextCursor: null,
    });
    expect(repository.listAllRuns(taskInput.id)).toEqual([run]);
    expect(repository.getRun(run.id)).toEqual(run);

    const provisioning = repository.transitionRun(run.id, 1, "provisioning", {
      taskStatus: "running",
    });
    const prompting = repository.transitionRun(
      run.id,
      provisioning.run.revision,
      "prompting",
    );
    const running = repository.transitionRun(
      run.id,
      prompting.run.revision,
      "running",
    );
    expect(() =>
      repository.transitionRun(run.id, running.run.revision, "reported"),
    ).toThrowError(expect.objectContaining({ code: "TASK_INVALID_STATE" }));
  });

  it("persists workspace/session bindings and terminal failures", () => {
    createTask();
    const { run } = createRun();
    const provisioning = repository.transitionRun(run.id, 1, "provisioning", {
      sagaPhase: "workspace_intent",
      taskStatus: "running",
    });
    const workspace = repository.bindRunWorkspace(
      run.id,
      provisioning.run.revision,
      "50000000-0000-4000-8000-000000000001",
    );
    expect(workspace).toMatchObject({
      worktreeId: "50000000-0000-4000-8000-000000000001",
      sagaPhase: "workspace_ready",
    });
    const prompting = repository.transitionRun(
      run.id,
      workspace.revision,
      "prompting",
      { sagaPhase: "session_intent" },
    );
    const session = repository.bindRunSession(
      run.id,
      prompting.run.revision,
      "60000000-0000-4000-8000-000000000001",
      "/session.jsonl",
    );
    expect(session).toMatchObject({
      sessionId: "60000000-0000-4000-8000-000000000001",
      sessionPath: "/session.jsonl",
      sagaPhase: "session_ready",
    });
    expect(repository.listActiveRuns()).toHaveLength(1);

    const failed = repository.failRun(run.id, session.revision, {
      code: "TASK_PROMPT_FAILED",
      message: "Prompt was rejected",
      retryable: true,
    });
    expect(failed.task).toMatchObject({ status: "failed", activeRunId: null });
    expect(failed.run).toMatchObject({
      status: "failed",
      sagaPhase: "terminal",
      error: { code: "TASK_PROMPT_FAILED", retryable: true },
    });
    expect(repository.listActiveRuns()).toEqual([]);
  });

  it("completes only a task that is awaiting review", () => {
    createTask();
    expect(() => repository.completeTask(taskInput.id, 1)).toThrowError(
      expect.objectContaining({ code: "TASK_INVALID_STATE" }),
    );
  });

  it("records the first valid report and makes identical retries idempotent", () => {
    createTask();
    const { run } = createRun();
    const provisioning = repository.transitionRun(run.id, 1, "provisioning", {
      taskStatus: "running",
    });
    const prompting = repository.transitionRun(
      run.id,
      provisioning.run.revision,
      "prompting",
    );
    const running = repository.transitionRun(
      run.id,
      prompting.run.revision,
      "running",
    );
    const report: TaskRunReport = {
      outcome: "success",
      summary: "Done",
      tests: [
        { command: "pnpm exec vitest run", status: "passed", summary: "green" },
      ],
    };

    const recorded = repository.reportRun(run.id, running.run.revision, report);
    expect(recorded.run).toMatchObject({
      status: "running",
      report,
      reportedAt: null,
    });
    expect(recorded.task).toMatchObject({
      status: "running",
      activeRunId: run.id,
    });
    expect(repository.reportRun(run.id, 1, report)).toEqual(recorded);
    expect(() =>
      repository.reportRun(run.id, recorded.run.revision, {
        ...report,
        summary: "Different",
      }),
    ).toThrowError(
      expect.objectContaining({ code: "TASK_RESULT_ALREADY_REPORTED" }),
    );

    const finalized = repository.finalizeRunReport(
      run.id,
      recorded.run.revision,
    );
    expect(finalized.run).toMatchObject({
      status: "reported",
      report,
      reportedAt: now,
    });
    expect(finalized.task).toMatchObject({
      status: "needs_review",
      activeRunId: null,
    });
  });

  it("atomically applies only a verified review to the run and Task metadata", () => {
    createTask();
    const { run } = createRun();
    const provisioning = repository.transitionRun(run.id, 1, "provisioning", {
      taskStatus: "running",
    });
    const prompting = repository.transitionRun(
      run.id,
      provisioning.run.revision,
      "prompting",
    );
    const running = repository.transitionRun(
      run.id,
      prompting.run.revision,
      "running",
    );
    const recorded = repository.reportRun(run.id, running.run.revision, {
      outcome: "success",
      summary: "Agent supplied no verified delivery",
      tests: [],
    });
    const beforeTask = repository.getTask(taskInput.id)!;
    const verified = {
      kind: "github_pr" as const,
      url: "https://github.com/acme/widgets/pull/9#discussion",
      draft: false,
    };

    const applied = repository.applyVerifiedReview(
      run.id,
      recorded.run.revision,
      verified,
    );
    expect(applied.report?.changeRequest).toEqual({
      ...verified,
      url: "https://github.com/acme/widgets/pull/9",
    });
    const task = repository.getTask(taskInput.id)!;
    expect(task.metadata.review).toEqual(applied.report?.changeRequest);
    expect(task.revision).toBe(beforeTask.revision + 1);

    const replayed = repository.applyVerifiedReview(
      run.id,
      applied.revision,
      verified,
    );
    expect(replayed.revision).toBe(applied.revision);
    expect(repository.getTask(taskInput.id)?.revision).toBe(task.revision);
    expect(() =>
      repository.applyVerifiedReview(run.id, replayed.revision, {
        kind: "github_pr",
        url: "https://gitlab.com/acme/widgets/-/merge_requests/9",
        draft: false,
      }),
    ).toThrowError(expect.objectContaining({ code: "TASK_RESULT_INVALID" }));
    expect(repository.getTask(taskInput.id)?.metadata).toEqual(task.metadata);

    database.close();
    database = openTaskDatabase(databasePath);
    repository = new TaskRepository(database.connection, { now: () => now });
    expect(repository.getTask(taskInput.id)?.metadata).toEqual(task.metadata);
  });

  it("stores bounded events, steps, and deduplicated notifications", () => {
    createTask();
    const { run } = createRun();
    repository.upsertRunStep(run.id, "workspace", "intent", {
      source: "managed",
    });
    repository.upsertRunStep(run.id, "workspace", "done", { worktreeId: "w1" });
    expect(repository.listRunSteps(run.id)).toEqual([
      expect.objectContaining({
        step: "workspace",
        state: "done",
        details: { worktreeId: "w1" },
      }),
    ]);

    repository.appendEvent(taskInput.id, run.id, "run.created", { attempt: 1 });
    expect(repository.listEvents(taskInput.id, { limit: 10 })).toEqual([
      expect.objectContaining({ type: "run.created", payload: { attempt: 1 } }),
    ]);

    expect(repository.createNotification(taskInput.id, run.id, "failed")).toBe(
      true,
    );
    expect(repository.createNotification(taskInput.id, run.id, "failed")).toBe(
      false,
    );
    now += 1;
    expect(
      repository.createNotification(taskInput.id, null, "task-level"),
    ).toBe(true);
    expect(
      repository.createNotification(taskInput.id, null, "task-level"),
    ).toBe(false);
    expect(repository.listNotifications({ limit: 10 }).items).toEqual([
      expect.objectContaining({
        taskId: taskInput.id,
        runId: null,
        kind: "task-level",
      }),
      expect.objectContaining({
        taskId: taskInput.id,
        runId: run.id,
        kind: "failed",
        appReadAt: null,
      }),
    ]);
    repository.markNotificationRead(taskInput.id, run.id, "failed");
    expect(repository.listNotifications({ limit: 10 }).items[1].appReadAt).toBe(
      now,
    );
  });
});

it("marks all notifications read idempotently without changing system delivery history", () => {
  const task = createTask();
  repository.createNotification(task.id, null, "failed");
  repository.createNotification(task.id, null, "needs_review");
  repository.markNotificationSystemSent(task.id, null, "failed");
  expect(repository.unreadNotificationCount()).toBe(2);
  repository.markAllNotificationsRead();
  expect(repository.unreadNotificationCount()).toBe(0);
  const first = repository.listNotifications({ limit: 10 });
  now++;
  repository.markAllNotificationsRead();
  expect(repository.listNotifications({ limit: 10 })).toEqual(first);
  expect(
    first.items.find((item) => item.kind === "failed")?.systemSentAt,
  ).not.toBeNull();
});
it("finds matching tasks outside the first unfiltered page and treats SQL text literally", () => {
  createTask();
  for (let index = 0; index < 51; index++) {
    now++;
    repository.createTask({
      ...taskInput,
      id: `10000000-0000-4000-8000-${String(index + 2).padStart(12, "0")}`,
      title: "Unrelated",
      description: "",
    });
  }
  expect(
    repository
      .listTasks({ limit: 50 })
      .items.some((item) => item.id === taskInput.id),
  ).toBe(false);
  expect(
    repository.listTasks({ limit: 50, query: "Ship task" }).items[0]?.id,
  ).toBe(taskInput.id);
  expect(
    repository.listTasks({ limit: 50, query: "' OR 1=1 --" }).items,
  ).toEqual([]);
});

it("creates, binds, completes, and preserves exact-commit verification history", () => {
  createTask();
  const created = createRun();
  const worktreeId = "90000000-0000-4000-8000-000000000001";
  repository.bindRunWorkspace(created.run.id, created.run.revision, worktreeId);
  const verification = repository.createVerification({
    id: "50000000-0000-4000-8000-000000000001",
    taskId: taskInput.id,
    codingRunId: created.run.id,
    worktreeId,
    commitSha: "a".repeat(40),
  });
  expect(verification).toMatchObject({ verdict: null, sessionId: null });
  repository.bindVerificationSession(
    verification.id,
    "60000000-0000-4000-8000-000000000001",
  );
  const finished = repository.finishVerification(verification.id, {
    verdict: "fail",
    summary: "A required path failed",
    evidence: {
      acceptanceCriteria: [
        { criterion: "CLI works", status: "fail", evidence: ["exit 1"] },
      ],
      commands: [
        { command: "tool check", status: "failed", summary: "exit 1" },
      ],
      issues: [
        { severity: "major", summary: "CLI failed", evidence: "exit 1" },
      ],
    },
  });
  expect(repository.latestVerification(taskInput.id)).toEqual(finished);
  expect(repository.findVerification(created.run.id, "a".repeat(40))).toEqual(
    finished,
  );
  expect(repository.listVerifications(taskInput.id)).toEqual([finished]);
  expect(() =>
    repository.finishVerification(verification.id, {
      verdict: "pass",
      summary: "duplicate",
      evidence: { acceptanceCriteria: [], commands: [], issues: [] },
    }),
  ).toThrowError(
    expect.objectContaining({ code: "TASK_VERIFICATION_ALREADY_REPORTED" }),
  );
});

it("separates occupied execution slots from idle runs retaining workspace leases", () => {
  createTask();
  const created = createRun();
  const bound = repository.bindRunWorkspace(
    created.run.id,
    created.run.revision,
    "90000000-0000-4000-8000-000000000001",
  );
  const provisioning = repository.transitionRun(
    bound.id,
    bound.revision,
    "provisioning",
    { taskStatus: "running" },
  ).run;
  expect(repository.executionQueueSnapshot().occupiedSlots).toBe(1);
  const prompting = repository.transitionRun(
    provisioning.id,
    provisioning.revision,
    "prompting",
  ).run;
  const running = repository.transitionRun(
    prompting.id,
    prompting.revision,
    "running",
  ).run;
  repository.transitionRun(running.id, running.revision, "awaiting_report");
  const snapshot = repository.executionQueueSnapshot();
  expect(snapshot.occupiedSlots).toBe(0);
  expect(
    snapshot.busyWorktreeIds.has("90000000-0000-4000-8000-000000000001"),
  ).toBe(true);
});
