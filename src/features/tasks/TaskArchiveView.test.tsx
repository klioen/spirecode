import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TaskArchiveView } from "./TaskArchiveView";
import { TaskDetail } from "./TaskDetail";
import { createTasksApiMock, taskDetail } from "./tasksTestUtils";
import type { TaskArchivePage } from "./tasksApi";
const page: TaskArchivePage = {
  sessionId: "session-1",
  archivedAt: 1,
  entries: [
    {
      id: "entry-1",
      type: "message",
      role: "assistant",
      text: "Retained final answer",
      truncated: false,
    },
  ],
  nextCursor: null,
  artifacts: [{ relativePath: "report.txt", size: 5 }],
};
it("opens read-only history after cleanup without opening a live Agent session", async () => {
  const api = createTasksApiMock();
  vi.mocked(api.archiveRead).mockResolvedValue(page);
  const live = vi.fn();
  render(
    <TaskDetail
      api={api}
      task={taskDetail({
        status: "completed",
        workspaceCleanupStatus: "removed",
        archiveStatus: "ready",
        runs: [
          {
            id: "run-1",
            attempt: 1,
            status: "reported",
            worktreeId: "gone",
            worktreeName: "gone",
            sessionId: "session-1",
            archiveStatus: "archived",
            error: null,
            report: { outcome: "success", summary: "Stored result", tests: [] },
            createdAt: 1,
            settledAt: 2,
          },
        ],
      })}
      onChange={vi.fn()}
      onOpenSession={live}
    />,
  );
  expect(screen.getByText("Stored result")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Open session" }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "View archived session" }),
  );
  expect(await screen.findByText("Retained final answer")).toBeInTheDocument();
  expect(api.archiveRead).toHaveBeenCalledWith({
    taskId: "task-1",
    runId: "run-1",
    limit: 20,
  });
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(live).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "report.txt (5 B)" }));
  await waitFor(() =>
    expect(api.archiveReveal).toHaveBeenCalledWith(
      "task-1",
      "run-1",
      "report.txt",
    ),
  );
});
it("retains loaded history through pagination errors and retries the same cursor", async () => {
  const api = createTasksApiMock();
  vi.mocked(api.archiveRead)
    .mockResolvedValueOnce({ ...page, nextCursor: "next" })
    .mockRejectedValueOnce({
      code: "TASK_ARCHIVE_CORRUPT",
      message: "Integrity failed",
    })
    .mockResolvedValueOnce({
      ...page,
      entries: [{ ...page.entries[0], id: "entry-2", text: "More history" }],
    });
  render(
    <TaskArchiveView
      api={api}
      taskId="task-1"
      runId="run-1"
      onClose={vi.fn()}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Load more history" }),
  );
  const error = await screen.findByRole("alert");
  expect(error).toHaveTextContent("Integrity failed");
  expect(screen.getByText("Retained final answer")).toBeInTheDocument();
  fireEvent.click(within(error).getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("More history")).toBeInTheDocument();
  expect(screen.getByText("Retained final answer")).toBeInTheDocument();
  expect(api.archiveRead).toHaveBeenLastCalledWith({
    taskId: "task-1",
    runId: "run-1",
    limit: 20,
    cursor: "next",
  });
});
it("fences delayed responses when a different archived run is selected", async () => {
  const api = createTasksApiMock();
  let resolve!: (value: TaskArchivePage) => void;
  vi.mocked(api.archiveRead)
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    )
    .mockResolvedValueOnce({
      ...page,
      entries: [{ ...page.entries[0], text: "New selection" }],
    });
  const { rerender } = render(
    <TaskArchiveView api={api} taskId="task-1" runId="old" onClose={vi.fn()} />,
  );
  rerender(
    <TaskArchiveView api={api} taskId="task-1" runId="new" onClose={vi.fn()} />,
  );
  expect(await screen.findByText("New selection")).toBeInTheDocument();
  resolve(page);
  await waitFor(() =>
    expect(screen.queryByText("Retained final answer")).not.toBeInTheDocument(),
  );
});
it("archives selected files before cleanup and uses the returned revision", async () => {
  const api = createTasksApiMock();
  vi.mocked(api.archive).mockResolvedValue(
    taskDetail({ status: "completed", revision: 7, archiveStatus: "ready" }),
  );
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(
    <TaskDetail
      api={api}
      task={taskDetail({
        status: "completed",
        ownsManagedWorktree: true,
        resolvedWorktreeId: "w1",
        runs: [
          {
            id: "run-1",
            attempt: 1,
            status: "reported",
            worktreeId: "w1",
            worktreeName: "worktree",
            sessionId: "session-1",
            error: null,
            report: null,
            createdAt: 1,
            settledAt: 2,
          },
        ],
      })}
      onChange={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByRole("textbox", { name: /Files to retain/ }), {
    target: { value: "reports/test.log" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Clean up workspace" }));
  await waitFor(() =>
    expect(api.cleanupWorkspace).toHaveBeenCalledWith("task-1", 7),
  );
  expect(api.archive).toHaveBeenCalledWith("task-1", 1, [
    { runId: "run-1", relativePath: "reports/test.log" },
  ]);
  expect(vi.mocked(api.archive).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(api.cleanupWorkspace).mock.invocationCallOrder[0],
  );
});
