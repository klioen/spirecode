import { describe, expect, it } from "vitest";
import { createInitialChatState, sessionReducer } from "./sessionReducer";

const reduce = (
  state: ReturnType<typeof createInitialChatState>,
  sequence: number,
  event: Parameters<typeof sessionReducer>[1]["event"],
) => sessionReducer(state, { sequence, event });

describe("sessionReducer", () => {
  it("adds and idempotently updates todo timeline snapshots", () => {
    const initial = createInitialChatState("s1", "w1", "idle");
    const first = sessionReducer(initial, {
      sequence: 1,
      event: {
        type: "todo_update",
        todo: {
          id: "todo-1",
          todos: [{ id: "a", step: "Inspect", status: "pending" }],
        },
      },
    });
    const updated = sessionReducer(first, {
      sequence: 2,
      event: {
        type: "todo_update",
        todo: {
          id: "todo-1",
          todos: [{ id: "a", step: "Inspect", status: "completed" }],
        },
      },
    });

    expect(updated.items).toEqual([
      {
        type: "todo",
        id: "todo-1",
        todos: [{ id: "a", step: "Inspect", status: "completed" }],
      },
    ]);
  });
  it("stays busy after agent_end and becomes idle only after agent_settled", () => {
    let state = createInitialChatState("session-1", "worktree-1", "idle");
    state = reduce(state, 1, { type: "agent_start" });
    state = reduce(state, 2, { type: "agent_end" });
    expect(state.status).toBe("streaming");
    state = reduce(state, 3, { type: "agent_settled" });
    expect(state.status).toBe("idle");
  });

  it("replaces canonical message and tool partial snapshots", () => {
    let state = createInitialChatState("session-1", "worktree-1", "idle");
    state = reduce(state, 1, {
      type: "message_start",
      message: {
        id: "message-1",
        role: "assistant",
        content: "a",
        status: "streaming",
      },
    });
    state = reduce(state, 2, {
      type: "message_update",
      message: {
        id: "message-1",
        role: "assistant",
        content: "ab",
        status: "streaming",
      },
    });
    state = reduce(state, 3, {
      type: "tool_execution_start",
      toolCallId: "tool-1",
      toolName: "custom",
    });
    state = reduce(state, 4, {
      type: "tool_execution_update",
      toolCallId: "tool-1",
      partialResult: "first",
    });
    state = reduce(state, 5, {
      type: "tool_execution_update",
      toolCallId: "tool-1",
      partialResult: "second",
    });

    expect(state.items.find((item) => item.type === "message")).toMatchObject({
      content: "ab",
    });
    expect(state.items.find((item) => item.type === "tool")).toMatchObject({
      result: "second",
    });
  });

  it("updates and clears transient extension activity", () => {
    let state = createInitialChatState("session-1", "worktree-1", "streaming");
    state = reduce(state, 1, {
      type: "extension_status",
      message: "TraeX is waiting for model capacity · position 362",
    });
    expect(state.activity).toBe(
      "TraeX is waiting for model capacity · position 362",
    );

    state = reduce(state, 2, { type: "extension_status" });
    expect(state.activity).toBeNull();
  });

  it("keeps duplicate queued text until an authoritative queue_update", () => {
    let state = createInitialChatState("session-1", "worktree-1", "streaming");
    state = reduce(state, 1, {
      type: "queue_update",
      queue: [
        { id: "queue-1", text: "same" },
        { id: "queue-2", text: "same" },
      ],
    });
    state = reduce(state, 2, {
      type: "message_end",
      message: {
        id: "message-1",
        role: "user",
        content: "same",
        status: "complete",
      },
    });

    expect(state.queue).toHaveLength(2);
    state = reduce(state, 3, {
      type: "queue_update",
      queue: [{ id: "queue-2", text: "same" }],
    });
    expect(state.queue).toEqual([{ id: "queue-2", text: "same" }]);
  });

  it("ignores duplicate events and advances sequence for unknown runtime events", () => {
    const state = reduce(
      createInitialChatState("session-1", "worktree-1", "idle"),
      2,
      { type: "agent_start" },
    );
    const duplicate = reduce(state, 2, { type: "agent_settled" });
    expect(duplicate).toBe(state);

    const unknown = reduce(state, 3, {
      type: "future_runtime_event",
    } as unknown as Parameters<typeof sessionReducer>[1]["event"]);
    expect(unknown.sequence).toBe(3);
    expect(unknown.status).toBe("streaming");
  });
});
