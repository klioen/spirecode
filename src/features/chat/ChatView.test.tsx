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
            content: "Plain **safe** text",
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
            name: "extension_tool",
            status: "done",
            result: { ok: true },
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
  it("attaches and renders plain messages, thinking, and generic tools", async () => {
    render(
      <ChatView
        worktreeId="worktree-1"
        sessionId="session-1"
        api={api()}
        runtime={new ChatRuntime({ batchMs: 0 })}
      />,
    );

    expect(await screen.findByText("Plain **safe** text")).toBeInTheDocument();
    expect(screen.getByText("Thinking")).toBeInTheDocument();
    expect(screen.getByText("extension_tool")).toBeInTheDocument();
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
