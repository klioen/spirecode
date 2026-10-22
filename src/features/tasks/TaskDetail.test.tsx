import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskDetail } from "./TaskDetail";
import { createTasksApiMock, taskDetail } from "./tasksTestUtils";

const awaitingTask = taskDetail({
  status: "running",
  activeRunId: "run-1",
  runs: [
    {
      id: "run-1",
      attempt: 1,
      status: "awaiting_report",
      worktreeId: "worktree-1",
      worktreeName: "task-feature",
      sessionId: "session-1",
      error: null,
      report: null,
      createdAt: 1,
      settledAt: 2,
    },
  ],
});

const reviewTask = taskDetail({
  status: "needs_review",
  activeRunId: null,
  runs: [
    {
      ...awaitingTask.runs[0],
      status: "reported",
      report: {
        outcome: "success",
        summary: "Implemented and tested",
        tests: [
          { command: "pnpm test", status: "passed", summary: "6 passed" },
        ],
        changeRequest: {
          kind: "github_pr",
          url: "https://github.com/example/repo/pull/1",
          draft: true,
        },
      },
    },
  ],
});

beforeEach(() => vi.spyOn(window, "confirm").mockReturnValue(true));

describe("TaskDetail", () => {
  it("keeps a previous run report accessible while a follow-up run is queued", () => {
    render(
      <TaskDetail
        api={createTasksApiMock()}
        onChange={vi.fn()}
        task={{
          ...reviewTask,
          status: "queued",
          activeRunId: "run-2",
          runs: [
            {
              ...reviewTask.runs[0],
              id: "run-2",
              attempt: 2,
              status: "queued",
              report: null,
            },
            reviewTask.runs[0]!,
          ],
        }}
      />,
    );

    fireEvent.click(screen.getByText("Previous attempts (1)"));
    const reportSummary = screen.getByText("Task result");
    expect(reportSummary.tagName).toBe("SUMMARY");
    fireEvent.click(reportSummary);
    expect(screen.getByText("Implemented and tested")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open draft change request" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Accept completion" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the completed report visible after acceptance and workspace cleanup without review actions", () => {
    const completed = { ...reviewTask, status: "completed" as const };
    const { rerender } = render(
      <TaskDetail
        api={createTasksApiMock()}
        task={completed}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Implemented and tested")).toBeInTheDocument();
    expect(screen.getByText("pnpm test").closest("li")).toHaveTextContent(
      "pnpm test: Passed",
    );
    expect(
      screen.getByRole("link", { name: "Open draft change request" }),
    ).toHaveAttribute("href", "https://github.com/example/repo/pull/1");
    expect(
      screen.queryByRole("button", { name: "Accept completion" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Request changes" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Change request note" }),
    ).not.toBeInTheDocument();

    rerender(
      <TaskDetail
        api={createTasksApiMock()}
        task={{ ...completed, workspaceCleanupStatus: "removed" }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Implemented and tested")).toBeInTheDocument();
    expect(screen.getByText("pnpm test").closest("li")).toHaveTextContent(
      "pnpm test: Passed",
    );
  });

  it("renders the task description", () => {
    render(
      <TaskDetail
        api={createTasksApiMock()}
        task={taskDetail({ durationMs: 3_661_000, tokenCount: 98_765 })}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Build the renderer feature")).toBeInTheDocument();
    expect(screen.getByText("Duration")).toBeInTheDocument();
    expect(screen.getByText("1h 1m 1s")).toBeInTheDocument();
    expect(screen.getByText("Tokens")).toBeInTheDocument();
    expect(screen.getByText("98.8K")).toBeInTheDocument();
  });

  it("treats awaiting_report as running and never as completed", async () => {
    const api = createTasksApiMock();
    render(<TaskDetail api={api} task={awaitingTask} onChange={vi.fn()} />);

    expect(screen.getByText("Status: Awaiting report")).toBeInTheDocument();
    expect(
      screen.getByText(/still running and is not complete/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Accept completion" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Continue and request report" }),
    );
    await waitFor(() =>
      expect(api.continueForReport).toHaveBeenCalledWith("task-1", 1),
    );
  });

  it("shows structured test evidence and only completes through an explicit user action", async () => {
    const api = createTasksApiMock();
    const onChange = vi.fn();
    render(<TaskDetail api={api} task={reviewTask} onChange={onChange} />);

    expect(screen.getByText("pnpm test").closest("li")).toHaveTextContent(
      "pnpm test: Passed",
    );
    expect(
      screen.getByRole("link", { name: "Open draft change request" }),
    ).toHaveAttribute("href", "https://github.com/example/repo/pull/1");
    fireEvent.click(screen.getByRole("button", { name: "Accept completion" }));
    await waitFor(() => expect(api.complete).toHaveBeenCalledWith("task-1", 1));
    expect(onChange).toHaveBeenCalled();
  });

  it("cleans a completed managed workspace and hides stale session navigation after removal", async () => {
    const api = createTasksApiMock();
    const completed = taskDetail({
      status: "completed",
      resolvedWorktreeId: "worktree-1",
      ownsManagedWorktree: true,
      runs: awaitingTask.runs,
    });
    const { rerender } = render(
      <TaskDetail
        api={api}
        task={completed}
        onChange={vi.fn()}
        onOpenSession={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Clean up workspace" }));
    await waitFor(() =>
      expect(api.cleanupWorkspace).toHaveBeenCalledWith("task-1", 1),
    );

    rerender(
      <TaskDetail
        api={api}
        task={{ ...completed, workspaceCleanupStatus: "removed" }}
        onChange={vi.fn()}
        onOpenSession={vi.fn()}
      />,
    );
    expect(
      screen.getByText("The managed workspace has been removed."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open session" }),
    ).not.toBeInTheDocument();
  });

  it("requires a note before requesting another attempt", async () => {
    const api = createTasksApiMock();
    render(<TaskDetail api={api} task={reviewTask} onChange={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Request changes" });
    expect(button).toBeDisabled();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Change request note" }),
      {
        target: { value: "Add an edge-case test" },
      },
    );
    fireEvent.click(button);
    await waitFor(() =>
      expect(api.requestChanges).toHaveBeenCalledWith(
        "task-1",
        1,
        "Add an edge-case test",
      ),
    );
  });
});

it.each(["queued", "provisioning", "prompting", "running"] as const)(
  "exposes cancellation during %s",
  async (status) => {
    const api = createTasksApiMock();
    const task = {
      ...awaitingTask,
      status: status === "queued" ? ("queued" as const) : ("running" as const),
      runs: [{ ...awaitingTask.runs[0]!, status }],
    };
    render(<TaskDetail api={api} task={task} onChange={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: status === "queued" ? "Cancel queue" : "Stop execution",
      }),
    );
    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith("task-1", 1));
  },
);
it("does not stop execution when confirmation is rejected", () => {
  const api = createTasksApiMock();
  vi.mocked(window.confirm).mockReturnValueOnce(false);
  render(
    <TaskDetail
      api={api}
      task={{
        ...awaitingTask,
        runs: [{ ...awaitingTask.runs[0]!, status: "running" }],
      }}
      onChange={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Stop execution" }));
  expect(api.cancel).not.toHaveBeenCalled();
});
it("puts the latest result before collapsed history and labels a report still draining", () => {
  render(
    <TaskDetail
      api={createTasksApiMock()}
      task={{
        ...reviewTask,
        status: "running",
        activeRunId: "run-2",
        runs: [
          {
            ...reviewTask.runs[0]!,
            id: "run-2",
            status: "running",
            attempt: 2,
          },
          reviewTask.runs[0]!,
        ],
      }}
      onChange={vi.fn()}
    />,
  );
  expect(
    screen.getByText(/Report received; the Agent is still finishing/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Accept completion" }),
  ).not.toBeInTheDocument();
  const history = screen.getByText("Previous attempts (1)").closest("details")!;
  expect(history).not.toHaveAttribute("open");
  const report = screen.getByRole("region", { name: "Task result" });
  expect(
    report.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});
it("shows session navigation errors inline", async () => {
  render(
    <TaskDetail
      api={createTasksApiMock()}
      task={reviewTask}
      onChange={vi.fn()}
      onOpenSession={vi
        .fn()
        .mockRejectedValue(new Error("Session unavailable"))}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open session" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Session unavailable",
  );
});
