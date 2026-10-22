// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ipcMain } from "electron";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AppState } from "./appState.js";
import {
  openTaskDatabase,
  type TaskDatabase,
} from "./domains/tasks/database.js";
import { TaskRepository } from "./domains/tasks/repository.js";
import type { Page, TaskNotification } from "./domains/tasks/types.js";
import { registerIpc } from "./ipc.js";
import { createRendererLocationPolicy } from "./security/navigation.js";

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
    removeListener: vi.fn(),
  },
  dialog: {},
  Notification: vi.fn(),
  shell: {},
}));

const taskId = "10000000-0000-4000-8000-000000000001";
const runId = "40000000-0000-4000-8000-000000000001";
let directory: string;
let database: TaskDatabase;
let repository: TaskRepository;
let unregister: () => void;
let invoke: (
  command: string,
  args: Record<string, unknown>,
) => Promise<{
  ok: boolean;
  value?: unknown;
  error?: { code: string; message: string };
}>;

beforeEach(() => {
  vi.clearAllMocks();
  directory = mkdtempSync(join(tmpdir(), "spire-notification-ipc-"));
  database = openTaskDatabase(join(directory, "tasks.sqlite3"));
  repository = new TaskRepository(database.connection);
  repository.createTask({
    id: taskId,
    title: "Notification contract",
    description: "",
    projectId: "20000000-0000-4000-8000-000000000001",
    workspace: { mode: "new_managed", baseRef: "origin/main" },
    automationEnabled: false,
  });
  repository.createNotification(taskId, null, "needs_review");
  const { run } = repository.createRun(taskId, 1, {
    id: runId,
    projectId: "20000000-0000-4000-8000-000000000001",
    promptMarker: `spire-task-run:${runId}`,
    ownsManagedWorktree: true,
    worktreeName: "notification-contract",
    baseRef: "origin/main",
  });
  repository.createNotification(taskId, run.id, "failed");

  const entry = join(directory, "index.html");
  const senderFrame = { url: pathToFileURL(entry).href };
  const sender = { mainFrame: senderFrame };
  const state = {
    window: { webContents: sender },
    taskNotificationsList: (options: { limit: number; cursor?: string }) => ({
      ...repository.listNotifications(options),
      unreadCount: repository.unreadNotificationCount(),
    }),
    taskNotificationMarkRead: (id: string, run: string | null, kind: string) =>
      repository.markNotificationRead(id, run, kind),
    taskNotificationsMarkAllRead: () => repository.markAllNotificationsRead(),
  } as unknown as AppState;
  unregister = registerIpc(state, createRendererLocationPolicy(entry));
  const handler = vi
    .mocked(ipcMain.handle)
    .mock.calls.find(([channel]) => channel === "spire:invoke")![1];
  invoke = (command, args) =>
    handler(
      { sender, senderFrame } as Parameters<typeof handler>[0],
      command,
      args,
    );
});

afterEach(() => {
  unregister?.();
  database?.close();
  rmSync(directory, { recursive: true, force: true });
});

it("loads and paginates notifications through the validated IPC handler", async () => {
  const first = await invoke("task_notifications_list", { limit: 1 });
  expect(first).toMatchObject({ ok: true, value: { unreadCount: 2 } });
  const page = first.value as Page<TaskNotification>;
  expect(page.items).toHaveLength(1);
  expect(page.nextCursor).not.toBeNull();
  const second = await invoke("task_notifications_list", {
    limit: 1,
    cursor: page.nextCursor,
  });
  expect(second).toMatchObject({
    ok: true,
    value: { nextCursor: null, unreadCount: 2 },
  });
  const next = second.value as Page<TaskNotification>;
  expect(next.items).toHaveLength(1);
  expect(next.items[0]).not.toEqual(page.items[0]);
});

it("marks task-level and run-level notifications read through IPC", async () => {
  expect(
    await invoke("task_notification_mark_read", {
      taskId,
      runId: null,
      kind: "needs_review",
    }),
  ).toMatchObject({ ok: true });
  expect(repository.unreadNotificationCount()).toBe(1);
  expect(
    await invoke("task_notification_mark_read", {
      taskId,
      runId,
      kind: "failed",
    }),
  ).toMatchObject({ ok: true });
  expect(repository.unreadNotificationCount()).toBe(0);
  expect(await invoke("task_notifications_mark_all_read", {})).toMatchObject({
    ok: true,
  });
});

it("rejects malformed pagination before querying the notification repository", async () => {
  expect(
    await invoke("task_notifications_list", { limit: "50" }),
  ).toMatchObject({ ok: false, error: { code: "INVALID_ARGUMENT" } });
  expect(
    await invoke("task_notifications_list", {
      limit: 50,
      cursor: "invalid-cursor",
    }),
  ).toMatchObject({ ok: false, error: { code: "TASK_RESULT_INVALID" } });
  expect(repository.unreadNotificationCount()).toBe(2);
});
