import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { TaskPage } from "./TaskPage";
import { createTasksApiMock, taskDetail } from "./tasksTestUtils";
import { useTasksStore } from "./tasksStore";

beforeEach(() => useTasksStore.getState().reset());

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

  fireEvent.click(
    await screen.findByRole("button", { name: "Clean up safe workspaces" }),
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
