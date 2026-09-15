import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ChatApi } from "./chatApi";
import { ChatRuntime } from "./chatRuntime";
import { ChatView } from "./ChatView";

function api(overrides: Partial<ChatApi> = {}): ChatApi {
  return {
    create: vi.fn(),
    list: vi.fn(),
    attach: vi.fn().mockResolvedValue({
      snapshot: {
        sessionId: "session-1",
        worktreeId: "worktree-1",
        status: "idle",
        items: [
          {
            type: "message",
            id: "m1",
            role: "assistant",
            content: "## Markdown result\n\nPlain **safe** text",
            status: "complete",
          },
          {
            type: "thinking",
            id: "t1",
            content: "reasoning",
            status: "complete",
          },
          {
            type: "tool",
            toolCallId: "tool-1",
            name: "read",
            status: "done",
            arguments: { path: "src/a.ts" },
            result: { ok: true },
          },
          {
            type: "tool",
            toolCallId: "tool-2",
            name: "bash",
            status: "done",
            arguments: { command: "pnpm test" },
            result: "passed",
          },
          {
            type: "message",
            id: "m2",
            role: "assistant",
            content: "More output",
            status: "complete",
          },
          {
            type: "tool",
            toolCallId: "tool-3",
            name: "edit",
            status: "done",
            arguments: { path: "src/b.ts" },
            result: "updated",
          },
        ],
        queue: [],
        sequence: 1,
      },
      detach: vi.fn(),
    }),
    send: vi.fn().mockResolvedValue({ accepted: true }),
    abort: vi.fn().mockResolvedValue({ accepted: true }),
    ...overrides,
  };
}

describe("ChatView", () => {
  it("renders Markdown, a unified process group, and a direct single tool", async () => {
    render(
      <ChatView
        worktreeId="worktree-1"
        sessionId="session-1"
        api={api()}
        runtime={new ChatRuntime({ batchMs: 0 })}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Markdown result" }),
    ).toBeInTheDocument();
    expect(screen.getByText("safe").tagName).toBe("STRONG");

    const processGroup = screen.getByText("已执行 3 项操作").closest("details");
    expect(processGroup).not.toHaveAttribute("open");
    expect(screen.getByText("深度思考")).not.toBeVisible();
    expect(screen.getByText("read")).not.toBeVisible();

    expect(screen.getByText("edit")).toBeVisible();
  });

  it("calls the unified send contract and restores only abort response text", async () => {
    const chatApi = api({
      attach: vi.fn().mockResolvedValue({
        snapshot: {
          sessionId: "session-1",
          worktreeId: "worktree-1",
          status: "idle",
          items: [],
          queue: [],
          sequence: 1,
        },
        detach: vi.fn(),
      }),
      abort: vi.fn().mockResolvedValue({
        accepted: true,
        restored: ["authoritative restored"],
      }),
    });
    const runtime = new ChatRuntime({ batchMs: 0 });
    render(
      <ChatView
        worktreeId="worktree-1"
        sessionId="session-1"
        api={chatApi}
        runtime={runtime}
      />,
    );

    const input = await screen.findByRole("textbox", { name: "Chat message" });
    await waitFor(() =>
      expect(runtime.getSnapshot("session-1").status).toBe("idle"),
    );
    runtime.push({
      sessionId: "session-1",
      sequence: 2,
      event: { type: "agent_start" },
    });
    runtime.push({
      sessionId: "session-1",
      sequence: 3,
      event: {
        type: "queue_update",
        queue: [{ id: "stale", text: "stale local queue" }],
      },
    });
    fireEvent.change(input, { target: { value: "follow this" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(chatApi.send).toHaveBeenCalledWith(
        "worktree-1",
        "session-1",
        "follow this",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(input).toHaveValue("authoritative restored"));
    expect(input).not.toHaveValue("stale local queue");
  });

  it.each([
    ["CHAT_AUTH_REQUIRED", "Sign in to pi"],
    ["CHAT_FAILED", "Chat failed"],
  ] as const)(
    "surfaces %s and disables the composer",
    async (code, message) => {
      const failing = api({
        attach: vi.fn().mockRejectedValue({ code, message }),
      });
      render(
        <ChatView
          worktreeId="worktree-1"
          sessionId="session-1"
          api={failing}
          runtime={new ChatRuntime({ batchMs: 0 })}
        />,
      );
      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(message),
      );
      expect(
        screen.getByRole("textbox", { name: "Chat message" }),
      ).toBeDisabled();
    },
  );
});
