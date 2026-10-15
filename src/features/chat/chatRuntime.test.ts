import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatRuntime } from "./chatRuntime";
import type { ChatSnapshot } from "./types";

const snapshot: ChatSnapshot = {
  sessionId: "session-1",
  worktreeId: "worktree-1",
  status: "idle",
  items: [],
  queue: [],
  sequence: 4,
};

afterEach(() => vi.useRealTimers());

describe("ChatRuntime", () => {
  it("hydrates a snapshot and applies only newer events", () => {
    const runtime = new ChatRuntime({ batchMs: 0 });
    runtime.hydrate(snapshot);
    runtime.push({
      sessionId: "session-1",
      sequence: 4,
      event: { type: "agent_start" },
    });
    expect(runtime.getSnapshot("session-1").status).toBe("idle");
    runtime.push({
      sessionId: "session-1",
      sequence: 5,
      event: { type: "agent_start" },
    });
    expect(runtime.getSnapshot("session-1").status).toBe("streaming");
  });

  it("aggregates streaming sessions by worktree and notifies only when activity changes", () => {
    const runtime = new ChatRuntime({ batchMs: 0 });
    runtime.ensure("session-1", "worktree-1", "idle");
    runtime.ensure("session-2", "worktree-1", "idle");
    runtime.ensure("session-3", "worktree-2", "idle");
    const listener = vi.fn();
    runtime.subscribeActiveWorktrees(listener);

    runtime.setStatus("session-1", "streaming");
    expect(runtime.getActiveWorktreeIds()).toEqual(new Set(["worktree-1"]));
    expect(listener).toHaveBeenCalledTimes(1);

    runtime.setStatus("session-2", "streaming");
    runtime.push({
      sessionId: "session-1",
      sequence: 1,
      event: {
        type: "message_update",
        message: {
          id: "m1",
          role: "assistant",
          content: "working",
          status: "streaming",
        },
      },
    });
    expect(listener).toHaveBeenCalledTimes(1);

    runtime.setStatus("session-1", "idle");
    expect(runtime.getActiveWorktreeIds()).toEqual(new Set(["worktree-1"]));
    expect(listener).toHaveBeenCalledTimes(1);

    runtime.setStatus("session-2", "idle");
    expect(runtime.getActiveWorktreeIds()).toEqual(new Set());
    expect(listener).toHaveBeenCalledTimes(2);

    runtime.setStatus("session-3", "streaming");
    runtime.remove("session-3");
    expect(runtime.getActiveWorktreeIds()).toEqual(new Set());
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it("routes sessions independently and batches notifications", () => {
    vi.useFakeTimers();
    const runtime = new ChatRuntime({ batchMs: 20 });
    runtime.ensure("session-1", "worktree-1");
    runtime.ensure("session-2", "worktree-1");
    const listener = vi.fn();
    runtime.subscribe("session-1", listener);

    runtime.push({
      sessionId: "session-1",
      sequence: 1,
      event: { type: "agent_start" },
    });
    runtime.push({
      sessionId: "session-1",
      sequence: 2,
      event: { type: "agent_end" },
    });
    runtime.push({
      sessionId: "session-2",
      sequence: 1,
      event: { type: "agent_start" },
    });

    expect(listener).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20);
    expect(listener).toHaveBeenCalledOnce();
    expect(runtime.getSnapshot("session-1").sequence).toBe(2);
    expect(runtime.getSnapshot("session-2").sequence).toBe(1);
  });
});
