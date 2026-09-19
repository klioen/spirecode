import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../../i18n";
import type { ChatApi } from "./chatApi";
import { ChatRuntime } from "./chatRuntime";
import { ChatView } from "./ChatView";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

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
            type: "todo",
            id: "todo-1",
            explanation: "Current progress",
            todos: [
              { id: "done", step: "Inspect todo", status: "completed" },
              { id: "active", step: "Render todo", status: "in_progress" },
            ],
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
    config: vi.fn().mockResolvedValue({
      model: { provider: "traex", id: "reasoning-model" },
      models: [
        {
          provider: "traex",
          id: "reasoning-model",
          label: "Reasoning Model",
          reasoning: true,
        },
      ],
      thinkingLevel: "medium",
      availableThinkingLevels: ["off", "low", "medium", "high"],
      commands: [],
    }),
    setModel: vi.fn().mockResolvedValue({
      model: { provider: "traex", id: "reasoning-model" },
      models: [],
      thinkingLevel: "medium",
      availableThinkingLevels: ["off", "medium"],
      commands: [],
    }),
    setThinkingLevel: vi.fn().mockResolvedValue({
      model: { provider: "traex", id: "reasoning-model" },
      models: [],
      thinkingLevel: "high",
      availableThinkingLevels: ["off", "high"],
      commands: [],
    }),
    send: vi.fn().mockResolvedValue({ accepted: true }),
    abort: vi.fn().mockResolvedValue({ accepted: true }),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("ChatView", () => {
  beforeEach(() => setLanguage("en"));

  it("does not render the old empty conversation prompt", async () => {
    render(
      <ChatView
        worktreeId="worktree-1"
        sessionId="session-1"
        api={api({
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
        })}
        runtime={new ChatRuntime({ batchMs: 0 })}
      />,
    );

    await screen.findByRole("textbox", { name: "Chat message" });
    expect(screen.queryByText("Start a conversation with pi")).toBeNull();
  });

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

    const thinking = screen.getByText("Thinking").closest("details");
    expect(thinking).not.toHaveAttribute("open");
    expect(screen.getByText("Thinking")).toBeVisible();
    expect(screen.getByText("reasoning")).not.toBeVisible();

    const processGroup = screen
      .getByText("Read file and Run command and other operations")
      .closest("details");
    expect(processGroup).not.toHaveAttribute("open");
    expect(screen.getByText("read")).not.toBeVisible();

    expect(screen.getByText("edit")).toBeVisible();
    expect(screen.getByRole("region", { name: "Todo progress" })).toBeVisible();
    expect(screen.getByText("1/2")).toBeVisible();
  });

  it("live-switches semantic notices while preserving external messages", async () => {
    const runtime = new ChatRuntime({ batchMs: 0 });
    render(
      <ChatView
        worktreeId="worktree-1"
        sessionId="session-1"
        api={api()}
        runtime={runtime}
      />,
    );
    await screen.findByRole("textbox", { name: "Chat message" });
    runtime.push({
      sessionId: "session-1",
      sequence: 2,
      event: { type: "auto_retry_start" },
    });
    runtime.push({
      sessionId: "session-1",
      sequence: 3,
      event: { type: "compaction_start", message: "External compact status" },
    });
    expect(await screen.findByText("Retrying…")).toBeVisible();
    expect(screen.getByText("External compact status")).toBeVisible();

    act(() => setLanguage("zh-CN"));
    expect(screen.getByText("正在重试…")).toBeVisible();
    expect(screen.getByText("External compact status")).toBeVisible();
  });

  it("shows and clears model capacity activity above the composer", async () => {
    let onEvent: Parameters<ChatApi["attach"]>[2] | undefined;
    const attach: ChatApi["attach"] = async (
      _worktreeId,
      _sessionId,
      listener,
    ) => {
      onEvent = listener;
      return {
        snapshot: {
          sessionId: "session-1",
          worktreeId: "worktree-1",
          status: "streaming",
          items: [],
          queue: [],
          activity: "TraeX is waiting for model capacity · position 361",
          sequence: 1,
        },
        detach: vi.fn(),
      };
    };
    const chatApi = api({ attach: vi.fn(attach) });
    render(
      <ChatView
        worktreeId="worktree-1"
        sessionId="session-1"
        api={chatApi}
        runtime={new ChatRuntime({ batchMs: 0 })}
      />,
    );

    const activity = await screen.findByRole("status", {
      name: "Agent activity",
    });
    expect(activity).toHaveTextContent("position 361");
    expect(
      activity.compareDocumentPosition(
        screen.getByRole("textbox", { name: "Chat message" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    onEvent?.({
      sessionId: "session-1",
      sequence: 2,
      event: {
        type: "extension_status",
        message: "TraeX is waiting for model capacity · position 120",
      },
    });
    expect(await screen.findByText(/position 120/)).toBeVisible();

    onEvent?.({
      sessionId: "session-1",
      sequence: 3,
      event: { type: "extension_status" },
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("status", { name: "Agent activity" }),
      ).toBeNull(),
    );
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

  it("loads config only after the authoritative attachment succeeds", async () => {
    const attachment = deferred<Awaited<ReturnType<ChatApi["attach"]>>>();
    const chatApi = api({
      attach: vi.fn().mockReturnValue(attachment.promise),
    });
    render(
      <ChatView
        worktreeId="worktree-1"
        sessionId="session-1"
        api={chatApi}
        runtime={new ChatRuntime({ batchMs: 0 })}
      />,
    );

    await waitFor(() => expect(chatApi.attach).toHaveBeenCalledOnce());
    expect(chatApi.config).not.toHaveBeenCalled();

    attachment.resolve({
      snapshot: {
        sessionId: "session-1",
        worktreeId: "worktree-1",
        status: "idle",
        items: [],
        queue: [],
        sequence: 1,
      },
      detach: vi.fn(),
    });
    await waitFor(() =>
      expect(chatApi.config).toHaveBeenCalledWith("worktree-1", "session-1"),
    );
  });

  it("cleans up the superseded attachment under StrictMode", async () => {
    const firstDetach = vi.fn();
    const secondDetach = vi.fn();
    const chatApi = api({
      attach: vi
        .fn()
        .mockResolvedValueOnce({
          snapshot: {
            sessionId: "session-1",
            worktreeId: "worktree-1",
            status: "idle",
            items: [],
            queue: [],
            sequence: 1,
          },
          detach: firstDetach,
        })
        .mockResolvedValueOnce({
          snapshot: {
            sessionId: "session-1",
            worktreeId: "worktree-1",
            status: "idle",
            items: [],
            queue: [],
            sequence: 1,
          },
          detach: secondDetach,
        }),
    });
    const onError = vi.fn();
    const { unmount } = render(
      <StrictMode>
        <ChatView
          worktreeId="worktree-1"
          sessionId="session-1"
          api={chatApi}
          runtime={new ChatRuntime({ batchMs: 0 })}
          onError={onError}
        />
      </StrictMode>,
    );

    await waitFor(() => expect(chatApi.attach).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(firstDetach).toHaveBeenCalledOnce());
    await waitFor(() => expect(chatApi.config).toHaveBeenCalledOnce());
    expect(onError).not.toHaveBeenCalled();

    unmount();
    expect(secondDetach).toHaveBeenCalledOnce();
  });

  it("loads session config and wires model and thinking selectors", async () => {
    const chatApi = api();
    render(
      <ChatView
        worktreeId="worktree-1"
        sessionId="session-1"
        api={chatApi}
        runtime={new ChatRuntime({ batchMs: 0 })}
      />,
    );

    const model = await screen.findByRole("combobox", { name: "Model" });
    expect(model).toHaveValue("traex/reasoning-model");
    fireEvent.change(model, { target: { value: "traex/reasoning-model" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Thinking level" }), {
      target: { value: "high" },
    });
    await waitFor(() =>
      expect(chatApi.setThinkingLevel).toHaveBeenCalledWith(
        "worktree-1",
        "session-1",
        "high",
      ),
    );
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
        expect(
          screen
            .getAllByRole("alert")
            .some((alert) => alert.textContent?.includes(message)),
        ).toBe(true),
      );
      expect(
        screen.getByRole("textbox", { name: "Chat message" }),
      ).toBeDisabled();
    },
  );

  it("shows the error code and pi auth guidance when authentication is required", async () => {
    const failing = api({
      attach: vi.fn().mockRejectedValue({
        code: "CHAT_AUTH_REQUIRED",
        message: "Agent authentication is required",
      }),
    });
    render(
      <ChatView
        worktreeId="worktree-1"
        sessionId="session-1"
        api={failing}
        runtime={new ChatRuntime({ batchMs: 0 })}
      />,
    );
    await screen.findByText("CHAT_AUTH_REQUIRED");
    expect(
      screen.getAllByText("Agent authentication is required").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(/configure auth under ~\/\.pi\/agent/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Run `pi` in a terminal/)).toBeInTheDocument();
  });

  it("recovers a failed session through Retry", async () => {
    const detach = vi.fn();
    const chatApi = api({
      attach: vi
        .fn()
        .mockRejectedValueOnce({
          code: "CHAT_AUTH_REQUIRED",
          message: "Agent authentication is required",
        })
        .mockResolvedValueOnce({
          snapshot: {
            sessionId: "session-1",
            worktreeId: "worktree-1",
            status: "idle",
            items: [],
            queue: [],
            sequence: 1,
          },
          detach,
        }),
    });
    render(
      <ChatView
        worktreeId="worktree-1"
        sessionId="session-1"
        api={chatApi}
        runtime={new ChatRuntime({ batchMs: 0 })}
      />,
    );
    await screen.findByText("CHAT_AUTH_REQUIRED");
    expect(
      screen.getByRole("textbox", { name: "Chat message" }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(chatApi.attach).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Chat message" }),
      ).toBeEnabled(),
    );
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
    expect(
      screen.queryByRole("button", { name: "Retry" }),
    ).not.toBeInTheDocument();
  });
});
