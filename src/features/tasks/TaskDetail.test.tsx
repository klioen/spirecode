import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

describe("TaskDetail", () => {
  it("renders the task description", () => {
    render(
      <TaskDetail
        api={createTasksApiMock()}
        task={taskDetail()}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Build the renderer feature")).toBeInTheDocument();
  });

  it("treats awaiting_report as running and never as completed", async () => {
    const api = createTasksApiMock();
    render(<TaskDetail api={api} task={awaitingTask} onChange={vi.fn()} />);

    expect(screen.getByText("Status: Running")).toBeInTheDocument();
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

    expect(screen.getByText(/pnpm test: Passed/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open draft change request" }),
    ).toHaveAttribute("href", "https://github.com/example/repo/pull/1");
    fireEvent.click(screen.getByRole("button", { name: "Accept completion" }));
    await waitFor(() => expect(api.complete).toHaveBeenCalledWith("task-1", 1));
    expect(onChange).toHaveBeenCalled();
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
