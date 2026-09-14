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
