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
  automationEnabled: true,
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
  archive: vi.fn().mockResolvedValue(taskDetail({ archiveStatus: "ready" })),
  archiveRead: vi.fn().mockResolvedValue({
    sessionId: "session-1",
    archivedAt: 1,
    entries: [],
    nextCursor: null,
    artifacts: [],
  }),
  archiveReveal: vi.fn().mockResolvedValue(undefined),
  list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  get: vi.fn().mockResolvedValue(taskDetail()),
  create: vi.fn().mockResolvedValue(taskDetail()),
  update: vi.fn().mockResolvedValue(taskDetail()),
  notificationsList: vi.fn().mockResolvedValue({
    items: [],
    nextCursor: null,
  }),
  notificationsMarkAllRead: vi.fn().mockResolvedValue(undefined),
  notificationMarkRead: vi.fn().mockResolvedValue(undefined),
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
  rewriteStart: vi.fn().mockResolvedValue({ rewriteId: "rewrite-1" }),
  rewriteAbort: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn().mockReturnValue(() => undefined),
});
