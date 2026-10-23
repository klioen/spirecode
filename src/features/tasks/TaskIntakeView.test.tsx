import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands, type TaskIntakeSnapshot } from "../../bindings";
import { setLanguage } from "../../i18n";
import { TaskIntakeView } from "./TaskIntakeView";
import type { ChatViewProps } from "../chat/ChatView";

const { eventListeners } = vi.hoisted(() => ({
  eventListeners: new Set<
    (event: { kind: string; sessionId?: string }) => void
  >(),
}));
vi.mock("../../bindings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../bindings")>();
  return {
    ...actual,
    commands: { ...actual.commands, taskIntakeGet: vi.fn() },
    subscribeTaskEvent: (
      listener: (event: { kind: string; sessionId?: string }) => void,
    ) => {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
  };
});
vi.mock("../chat", () => ({
  hostChatApi: {},
  ChatView: (props: ChatViewProps) => (
    <div>
      {props.intro}
      {props.afterMessages}
      <textarea
        aria-label={props.composerLabel}
        placeholder={props.composerPlaceholder}
        disabled={props.inputDisabled}
      />
    </div>
  ),
}));

const base: TaskIntakeSnapshot = {
  sessionId: "s1",
  worktreeId: "w1",
  projectId: "p1",
  projectName: "Project one",
  baseRef: "origin/main",
  baseCommit: "a".repeat(40),
  phase: "clarifying",
  revision: 1,
  proposal: null,
  task: null,
};
beforeEach(() => {
  setLanguage("en");
  vi.mocked(commands.taskIntakeGet).mockReset().mockResolvedValue(base);
  eventListeners.clear();
});

describe("Task intake conversation", () => {
  it("prompts for a task description and renders the exact proposal without a submit button", async () => {
    vi.mocked(commands.taskIntakeGet).mockResolvedValue({
      ...base,
      phase: "review",
      proposal: {
        reviewId: "review-1",
        title: "Improve code",
        description:
          "Scope: app.ts\nAcceptance: pass pnpm check\nDo not change APIs",
        baseRef: base.baseRef,
        baseCommit: base.baseCommit,
      },
    });
    render(<TaskIntakeView worktreeId="w1" sessionId="s1" />);
    expect(screen.getByRole("textbox")).toBeDisabled();
    await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());
    expect(
      screen.getByPlaceholderText("Describe the task you want to accomplish…"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Final task proposal" }),
    ).toHaveTextContent("Scope: app.ts");
    expect(
      screen.getByText(/Reply “confirm”, “start” or “submit”/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /submit/i }),
    ).not.toBeInTheDocument();
  });
  it("stays in the conversation after submission and navigates only on View task", async () => {
    const onOpenTask = vi.fn();
    const view = render(
      <TaskIntakeView worktreeId="w1" sessionId="s1" onOpenTask={onOpenTask} />,
    );
    await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());
    vi.mocked(commands.taskIntakeGet).mockResolvedValue({
      ...base,
      phase: "submitted",
      revision: 2,
      task: { id: "task-1", title: "Improve code", status: "queued" },
    });
    act(() => {
      for (const listener of eventListeners)
        listener({ kind: "intake_changed", sessionId: "s1" });
    });
    const button = await screen.findByRole("button", { name: "View task" });
    expect(onOpenTask).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByText(/You can close this tab/)).toBeInTheDocument();
    fireEvent.click(button);
    expect(onOpenTask).toHaveBeenCalledWith("task-1");
    view.unmount();
    expect(eventListeners.size).toBe(0);
  });
  it("fails closed on metadata load failure and allows retry", async () => {
    vi.mocked(commands.taskIntakeGet).mockRejectedValueOnce(
      new Error("Metadata unavailable"),
    );
    render(<TaskIntakeView worktreeId="w1" sessionId="s1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Metadata unavailable",
    );
    expect(screen.getByRole("textbox")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());
  });
  it("ignores another intake's change events", async () => {
    render(<TaskIntakeView worktreeId="w1" sessionId="s1" />);
    await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());
    const count = vi.mocked(commands.taskIntakeGet).mock.calls.length;
    act(() => {
      for (const listener of eventListeners)
        listener({ kind: "intake_changed", sessionId: "other" });
    });
    expect(commands.taskIntakeGet).toHaveBeenCalledTimes(count);
  });
  it("renders localized Chinese intake copy", async () => {
    setLanguage("zh-CN");
    render(<TaskIntakeView worktreeId="w1" sessionId="s1" />);
    expect(
      screen.getByPlaceholderText("描述你想完成的任务…"),
    ).toBeInTheDocument();
    expect(screen.getByText("新建任务")).toBeInTheDocument();
  });
});
