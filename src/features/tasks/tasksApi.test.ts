import { expect, it, vi } from "vitest";
import { createHostTasksApi, type TaskHostBindings } from "./tasksApi";

it("adapts future host bindings without importing unavailable generated commands", async () => {
  const listener = vi.fn();
  const unsubscribe = vi.fn();
  const host = {
    taskList: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    taskDashboard: vi.fn().mockResolvedValue({ total: 0 }),
    taskGet: vi.fn(),
    taskCreate: vi.fn(),
    taskRetryVerification: vi.fn(),
    taskRetryVerificationCurrentCommit: vi.fn(),
    taskRecoverVerification: vi.fn(),
    taskRun: vi.fn().mockResolvedValue(undefined),
    taskCancel: vi.fn(),
    taskComplete: vi.fn(),
    taskRequestChanges: vi.fn(),
    taskContinueForReport: vi.fn(),
    subscribeTaskEvents: vi.fn().mockReturnValue(unsubscribe),
  } as unknown as TaskHostBindings;
  const api = createHostTasksApi(host);

  await api.list({ limit: 25, statuses: ["running"] });
  await api.dashboard();
  await api.run("task-1", 3);
  await api.retryVerification("task-1", 3);
  await api.recoverVerification("task-1", 3);
  const stop = api.subscribe(listener);

  expect(host.taskList).toHaveBeenCalledWith({
    limit: 25,
    statuses: ["running"],
  });
  expect(host.taskDashboard).toHaveBeenCalledWith();
  expect(host.taskRun).toHaveBeenCalledWith({
    taskId: "task-1",
    expectedRevision: 3,
  });
  expect(host.taskRetryVerification).toHaveBeenCalledWith({
    taskId: "task-1",
    expectedRevision: 3,
  });
  expect(host.taskRecoverVerification).toHaveBeenCalledWith({
    taskId: "task-1",
    expectedRevision: 3,
  });
  expect(host.subscribeTaskEvents).toHaveBeenCalledWith(listener);
  expect(stop).toBe(unsubscribe);
});

it("sends current-commit retry with only Task identity and revision", async () => {
  const host = {
    taskRetryVerificationCurrentCommit: vi.fn(),
  } as unknown as Parameters<typeof createHostTasksApi>[0];
  await createHostTasksApi(host).retryVerificationCurrentCommit("task-1", 7);
  expect(host.taskRetryVerificationCurrentCommit).toHaveBeenCalledWith({
    taskId: "task-1",
    expectedRevision: 7,
  });
});
