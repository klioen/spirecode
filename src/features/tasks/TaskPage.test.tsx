import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { TaskPage } from "./TaskPage";
import { resetTaskDrafts } from "./taskDrafts";
import { createTasksApiMock, taskDetail } from "./tasksTestUtils";
import { useTasksStore } from "./tasksStore";

beforeEach(() => {
  useTasksStore.getState().reset();
  resetTaskDrafts();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

it("offers clean-only bulk cleanup for completed managed workspaces", async () => {
  const api = createTasksApiMock();
  const completed = taskDetail({
    status: "completed",
    resolvedWorktreeId: "worktree-1",
    ownsManagedWorktree: true,
  });
  vi.mocked(api.list).mockResolvedValue({
    items: [completed],
    nextCursor: null,
  });

  render(<TaskPage api={api} projects={[]} />);

  fireEvent.click(await screen.findByText("More"));
  fireEvent.click(
    screen.getByRole("button", { name: "Clean up safe workspaces" }),
  );
  await waitFor(() =>
    expect(api.cleanupWorkspace).toHaveBeenCalledWith("task-1", 1),
  );
  expect(await screen.findByText("Cleaned 1; skipped 0.")).toBeInTheDocument();
});

it("loads the global list and opens a task detail without an active project", async () => {
  const api = createTasksApiMock();
  vi.mocked(api.list).mockResolvedValue({
    items: [
      taskDetail({
        title: "Global task",
        projectName: "SpireCode",
        durationMs: 125_000,
        tokenCount: 12_345,
      }),
    ],
    nextCursor: null,
  });
  vi.mocked(api.get).mockResolvedValue(taskDetail({ title: "Global task" }));

  render(<TaskPage api={api} projects={[]} />);

  const taskButton = await screen.findByRole("button", { name: /Global task/ });
  expect(taskButton).toHaveTextContent("SpireCode");
  expect(taskButton).toHaveTextContent("2m 5s");
  expect(taskButton).toHaveTextContent("12.3K tokens");
  fireEvent.click(taskButton);
  await waitFor(() => expect(api.get).toHaveBeenCalledWith("task-1"));
  expect(
    screen.getByRole("heading", { name: "Global task" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Run task" })).toBeInTheDocument();
});

it("keeps the list, toolbar, header and notices in one centered content column", async () => {
  const api = createTasksApiMock();
  vi.mocked(api.list).mockResolvedValue({
    items: [taskDetail({ title: "Centered task" })],
    nextCursor: null,
  });
  vi.mocked(api.notificationsList).mockRejectedValue(new Error("Offline"));

  render(<TaskPage api={api} projects={[]} />);

  const taskButton = await screen.findByRole("button", {
    name: /Centered task/,
  });
  const page = screen.getByRole("main");
  const column = page.querySelector(".task-page-content");
  expect(column).not.toBeNull();
  expect(page.children).toHaveLength(1);
  expect(taskButton.closest("ul")?.parentElement).toBe(column);
  expect(
    screen.getByRole("heading", { name: "Tasks" }).closest("header")
      ?.parentElement,
  ).toBe(column);
  expect(
    screen
      .getByRole("searchbox", { name: "Search tasks" })
      .closest(".task-list-toolbar")?.parentElement,
  ).toBe(column);
  expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
  expect(screen.getByRole("alert").parentElement).toBe(column);
});

it("searches the durable list and exposes scoped views", async () => {
  const api = createTasksApiMock();
  render(
    <TaskPage
      api={api}
      projects={[
        {
          id: "project-1",
          name: "SpireCode",
          kind: "git",
          baseRefs: [],
          worktrees: [],
        },
      ]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Completed" }));
  fireEvent.click(screen.getByRole("combobox", { name: "Filter by project" }));
  fireEvent.click(screen.getByRole("option", { name: "SpireCode" }));
  fireEvent.change(screen.getByRole("searchbox", { name: "Search tasks" }), {
    target: { value: "oldest task" },
  });
  await waitFor(() =>
    expect(api.list).toHaveBeenLastCalledWith({
      limit: 50,
      statuses: ["completed"],
      query: "oldest task",
      projectId: "project-1",
    }),
  );
});
it("shows serialized notification errors and recovers through retry", async () => {
  const api = createTasksApiMock();
  vi.mocked(api.notificationsList)
    .mockRejectedValueOnce({
      code: "INVALID_ARGUMENT",
      message: "cursor must be a string",
    })
    .mockResolvedValue({ items: [], nextCursor: null, unreadCount: 0 });
  render(<TaskPage api={api} projects={[]} />);
  const error = await screen.findByRole("alert");
  expect(error).toHaveTextContent("cursor must be a string");
  expect(api.notificationsList).toHaveBeenCalledWith({ limit: 50 });
  fireEvent.click(within(error).getByRole("button", { name: "Retry" }));
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
  expect(api.notificationsList).toHaveBeenCalledTimes(2);
});

it("paginates task notifications without replacing the loaded page", async () => {
  const api = createTasksApiMock();
  const notification = {
    taskId: "task-1",
    taskTitle: "First notification",
    runId: "run-1",
    kind: "needs_review",
    appReadAt: null,
    systemSentAt: null,
    createdAt: Date.now(),
  };
  vi.mocked(api.notificationsList)
    .mockResolvedValueOnce({
      items: [notification],
      nextCursor: "next-page",
      unreadCount: 2,
    })
    .mockResolvedValueOnce({
      items: [
        { ...notification, runId: null, taskTitle: "Task-level notification" },
      ],
      nextCursor: null,
      unreadCount: 2,
    });
  render(<TaskPage api={api} projects={[]} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Notifications (2)" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Load more notifications" }),
  );
  expect(
    await screen.findByRole("button", { name: /Task-level notification/ }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /First notification/ }),
  ).toBeInTheDocument();
  expect(api.notificationsList).toHaveBeenLastCalledWith({
    limit: 50,
    cursor: "next-page",
  });
  fireEvent.click(
    screen.getByRole("button", { name: /Task-level notification/ }),
  );
  await waitFor(() =>
    expect(api.notificationMarkRead).toHaveBeenCalledWith(
      "task-1",
      null,
      "needs_review",
    ),
  );
});

it("uses readable workspace names and recognizable notifications with a global unread count", async () => {
  const api = createTasksApiMock();
  vi.mocked(api.list).mockResolvedValue({
    items: [
      taskDetail({
        title: "Fix login",
        workspace: {
          mode: "existing",
          worktreeId: "hidden-id",
          allowDirty: false,
        },
        workspaceName: "feature-login",
      }),
    ],
    nextCursor: null,
  });
  vi.mocked(api.notificationsList).mockResolvedValue({
    items: [
      {
        taskId: "task-1",
        taskTitle: "Fix login",
        projectName: "SpireCode",
        runId: "run-1",
        kind: "needs_review",
        appReadAt: null,
        systemSentAt: null,
        createdAt: Date.now(),
      },
    ],
    nextCursor: null,
    unreadCount: 12,
  });
  render(<TaskPage api={api} projects={[]} />);
  expect(await screen.findByText("feature-login")).toBeInTheDocument();
  expect(screen.queryByText("hidden-id")).not.toBeInTheDocument();
  fireEvent.click(
    await screen.findByRole("button", { name: "Notifications (12)" }),
  );
  expect(
    within(
      screen.getByRole("region", { name: "Task notifications" }),
    ).getByRole("button", { name: /Fix login/ }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
  await waitFor(() =>
    expect(api.notificationsMarkAllRead).toHaveBeenCalledTimes(1),
  );
});
it("coalesces initial detail requests and ignores responses from abandoned navigation", async () => {
  const api = createTasksApiMock();
  let resolveA!: (value: ReturnType<typeof taskDetail>) => void;
  const pendingA = new Promise<ReturnType<typeof taskDetail>>((resolve) => {
    resolveA = resolve;
  });
  vi.mocked(api.list).mockResolvedValue({
    items: [
      taskDetail({ id: "a", title: "Task A" }),
      taskDetail({ id: "b", title: "Task B" }),
    ],
    nextCursor: null,
  });
  vi.mocked(api.get).mockImplementation((id) =>
    id === "a"
      ? pendingA
      : Promise.resolve(taskDetail({ id: "b", title: "Task B" })),
  );
  render(<TaskPage api={api} projects={[]} />);
  fireEvent.click(await screen.findByRole("button", { name: /Task A/ }));
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Back to tasks" }));
  fireEvent.click(screen.getByRole("button", { name: /Task B/ }));
  expect(
    await screen.findByRole("heading", { name: "Task B" }),
  ).toBeInTheDocument();
  await act(async () => resolveA(taskDetail({ id: "a", title: "Task A" })));
  await waitFor(() =>
    expect(
      screen.queryByRole("heading", { name: "Task A" }),
    ).not.toBeInTheDocument(),
  );
  expect(api.get).toHaveBeenCalledTimes(2);
});
it("refreshes a selected task through events even when it is outside the loaded list", async () => {
  const api = createTasksApiMock();
  let emit!: (event: import("./tasksApi").TaskEvent) => void;
  vi.mocked(api.subscribe).mockImplementation((listener) => {
    emit = listener;
    return () => undefined;
  });
  useTasksStore.setState({ selectedTaskId: "task-1" });
  vi.mocked(api.get)
    .mockResolvedValueOnce(taskDetail({ title: "Selected", revision: 1 }))
    .mockResolvedValueOnce(taskDetail({ title: "Updated", revision: 2 }));
  render(<TaskPage api={api} projects={[]} />);
  expect(
    await screen.findByRole("heading", { name: "Selected" }),
  ).toBeInTheDocument();
  emit({ kind: "changed", taskId: "task-1", revision: 2 });
  expect(
    await screen.findByRole("heading", { name: "Updated" }),
  ).toBeInTheDocument();
});
it("keeps refresh errors visible alongside the selected detail", async () => {
  const api = createTasksApiMock();
  let emit!: (event: import("./tasksApi").TaskEvent) => void;
  vi.mocked(api.subscribe).mockImplementation((listener) => {
    emit = listener;
    return () => undefined;
  });
  useTasksStore.setState({ selectedTaskId: "task-1" });
  vi.mocked(api.get)
    .mockResolvedValueOnce(taskDetail({ title: "Selected" }))
    .mockRejectedValueOnce(new Error("Refresh failed"));
  render(<TaskPage api={api} projects={[]} />);
  await screen.findByRole("heading", { name: "Selected" });
  emit({ kind: "changed", taskId: "task-1", revision: 2 });
  expect(await screen.findByRole("alert")).toHaveTextContent("Refresh failed");
  expect(screen.getByRole("heading", { name: "Selected" })).toBeInTheDocument();
});
