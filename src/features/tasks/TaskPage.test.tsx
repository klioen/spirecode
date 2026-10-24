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

it("renders a global dashboard above filters and applies dashboard filters without changing list scope", async () => {
  const api = createTasksApiMock();
  vi.mocked(api.dashboard).mockResolvedValue({
    total: 10,
    active: 3,
    attention: 4,
    completed: 2,
    createdLast7Days: 5,
    completedLast7Days: 1,
    durationMs: 125_000,
    tokenCount: 12_345,
    measuredAt: Date.now() - 60_000,
    advancingRunCount: 1,
    byStatus: {
      backlog: 2,
      queued: 1,
      running: 2,
      needs_review: 1,
      completed: 2,
      failed: 1,
      cancelled: 1,
    },
  });
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

  const heading = await screen.findByRole("heading", { name: "Overview" });
  const toolbar = screen
    .getByRole("searchbox", { name: "Search tasks" })
    .closest(".task-list-toolbar")!;
  expect(
    heading.closest(".task-dashboard")!.compareDocumentPosition(toolbar) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.getByText("12.3K")).toBeInTheDocument();
  expect(screen.getByText("3m 5s")).toBeInTheDocument();
  expect(screen.getByText("May overlap with Active")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Active: 3/ }));
  await waitFor(() =>
    expect(api.list).toHaveBeenLastCalledWith({
      limit: 50,
      statuses: ["queued", "running"],
    }),
  );
  fireEvent.click(screen.getByRole("combobox", { name: "Filter by project" }));
  fireEvent.click(screen.getByRole("option", { name: "SpireCode" }));
  fireEvent.change(screen.getByRole("searchbox", { name: "Search tasks" }), {
    target: { value: "keep scope" },
  });
  await waitFor(() =>
    expect(api.list).toHaveBeenLastCalledWith({
      limit: 50,
      statuses: ["queued", "running"],
      query: "keep scope",
      projectId: "project-1",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: /Cancelled: 1/ }));
  await waitFor(() =>
    expect(api.list).toHaveBeenLastCalledWith({
      limit: 50,
      statuses: ["cancelled"],
      query: "keep scope",
      projectId: "project-1",
    }),
  );
  expect(api.dashboard).toHaveBeenCalledTimes(1);
});

it("keeps dashboard failure independent from the list and recovers to an explicit empty state", async () => {
  const api = createTasksApiMock();
  vi.mocked(api.list).mockResolvedValue({
    items: [taskDetail({ title: "List remains available" })],
    nextCursor: null,
  });
  vi.mocked(api.dashboard)
    .mockRejectedValueOnce(new Error("Overview offline"))
    .mockResolvedValueOnce({
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
    });

  render(<TaskPage api={api} projects={[]} />);
  expect(
    await screen.findByRole("button", { name: /List remains available/ }),
  ).toBeInTheDocument();
  const error = await screen.findByText("Overview offline");
  fireEvent.click(
    within(error.closest("section")!).getByRole("button", {
      name: "Retry overview",
    }),
  );
  expect(
    await screen.findByText(
      "No tasks yet. Every status currently has 0 tasks.",
    ),
  ).toBeInTheDocument();
  expect(screen.getAllByText("0").length).toBeGreaterThan(7);
});

it("coalesces dashboard event storms and ignores the invalidated response", async () => {
  const api = createTasksApiMock();
  let listener!: Parameters<typeof api.subscribe>[0];
  vi.mocked(api.subscribe).mockImplementation((value) => {
    listener = value;
    return () => undefined;
  });
  let release!: (value: Awaited<ReturnType<typeof api.dashboard>>) => void;
  const first = new Promise<Awaited<ReturnType<typeof api.dashboard>>>(
    (resolve) => {
      release = resolve;
    },
  );
  const fresh = {
    total: 2,
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
      backlog: 2,
      queued: 0,
      running: 0,
      needs_review: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    },
  } as const;
  vi.mocked(api.dashboard).mockImplementationOnce(() => first);
  vi.mocked(api.dashboard).mockResolvedValue(fresh);

  render(<TaskPage api={api} projects={[]} />);
  await waitFor(() => expect(api.dashboard).toHaveBeenCalledTimes(1));
  act(() => {
    listener({ kind: "changed", taskId: "task-1", revision: 2 });
    listener({ kind: "changed", taskId: "task-1", revision: 3 });
    listener({ kind: "notification", taskId: "task-1" });
  });
  release({
    ...fresh,
    total: 99,
    byStatus: { ...fresh.byStatus, backlog: 99 },
  });

  await waitFor(() => expect(api.dashboard).toHaveBeenCalledTimes(2));
  const total = await screen.findByText("Total tasks");
  expect(total.closest(".task-dashboard-metric")).toHaveTextContent("2");
  expect(total.closest(".task-dashboard-metric")).not.toHaveTextContent("99");
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
