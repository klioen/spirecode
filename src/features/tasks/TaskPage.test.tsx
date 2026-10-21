import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { TaskPage } from "./TaskPage";
import { createTasksApiMock, taskDetail } from "./tasksTestUtils";
import { useTasksStore } from "./tasksStore";

beforeEach(() => useTasksStore.getState().reset());

it("loads the global list and opens a task detail without an active project", async () => {
  const api = createTasksApiMock();
  vi.mocked(api.list).mockResolvedValue({
    items: [taskDetail({ title: "Global task", projectName: "SpireCode" })],
    nextCursor: null,
  });
  vi.mocked(api.get).mockResolvedValue(taskDetail({ title: "Global task" }));

  render(<TaskPage api={api} projects={[]} />);

  const taskButton = await screen.findByRole("button", { name: /Global task/ });
  expect(taskButton).toHaveTextContent("SpireCode");
  fireEvent.click(taskButton);
  await waitFor(() => expect(api.get).toHaveBeenCalledWith("task-1"));
  expect(
    screen.getByRole("heading", { name: "Global task" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Run task" })).toBeInTheDocument();
});
