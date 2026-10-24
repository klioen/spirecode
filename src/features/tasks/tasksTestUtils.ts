import { vi } from "vitest";
import type { TaskDetailValue, TasksApi } from "./tasksApi";

export const taskDetail = (
  overrides: Partial<TaskDetailValue> = {},
): TaskDetailValue => ({
  id: "task-1",
  title: "Implement task module",
  description: "Build the renderer feature",
  projectId: "project-1",
  projectName: "SpireCode",
  workspace: { mode: "new_managed", baseRef: "origin/main" },
  metadata: {},
  automationEnabled: true,
  verificationEnabled: true,
  verification: null,
  status: "backlog",
  activeRunId: null,
  resolvedWorktreeId: null,
  ownsManagedWorktree: false,
  workspaceCleanupStatus: "retained",
  workspaceCleanedAt: null,
  workspaceCleanupErrorCode: null,
  revision: 1,
  createdAt: 1,
  updatedAt: 1,
  durationMs: 0,
  tokenCount: 0,
  completedAt: null,
  runs: [],
  ...overrides,
});

export const createTasksApiMock = (): TasksApi => ({
  list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  dashboard: vi.fn().mockResolvedValue({
    total: 0,
    active: 0,
    attention: 0,
    completed: 0,
    createdLast7Days: 0,
    completedLast7Days: 0,
    durationMs: 0,
    tokenCount: 0,
    measuredAt: Date.now(),
    advancingRunCount: 0,
    byStatus: {
      backlog: 0,
      queued: 0,
      running: 0,
      needs_review: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    },
  }),
  get: vi.fn().mockResolvedValue(taskDetail()),
  create: vi.fn().mockResolvedValue(taskDetail()),
  update: vi.fn().mockResolvedValue(taskDetail()),
  notificationsList: vi.fn().mockResolvedValue({
    items: [],
    nextCursor: null,
  }),
  notificationsMarkAllRead: vi.fn().mockResolvedValue(undefined),
  notificationMarkRead: vi.fn().mockResolvedValue(undefined),
  retryVerificationCurrentCommit: vi.fn(),
  retryVerification: vi
    .fn()
    .mockResolvedValue(taskDetail({ status: "running", revision: 2 })),
  recoverVerification: vi
    .fn()
    .mockResolvedValue(taskDetail({ status: "running", revision: 2 })),
  run: vi.fn().mockResolvedValue(taskDetail({ status: "queued", revision: 2 })),
  cancel: vi
    .fn()
    .mockResolvedValue(taskDetail({ status: "cancelled", revision: 2 })),
  complete: vi
    .fn()
    .mockResolvedValue(taskDetail({ status: "completed", revision: 2 })),
  cleanupWorkspace: vi.fn().mockResolvedValue(
    taskDetail({
      status: "completed",
      workspaceCleanupStatus: "removed",
      revision: 3,
    }),
  ),
  requestChanges: vi
    .fn()
    .mockResolvedValue(taskDetail({ status: "queued", revision: 2 })),
  continueForReport: vi
    .fn()
    .mockResolvedValue(taskDetail({ status: "running", revision: 2 })),
  subscribe: vi.fn().mockReturnValue(() => undefined),
});
