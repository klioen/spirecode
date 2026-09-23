// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyMemoryConfig, BackgroundWatcherScheduler } from "./appState.js";

const originalModel = process.env.PI_MEMORY_EXTRACT_MODEL;
const originalPhase2Model = process.env.PI_MEMORY_PHASE2_MODEL;
const originalThinking = process.env.PI_MEMORY_EXTRACT_THINKING;
const originalPhase2Thinking = process.env.PI_MEMORY_PHASE2_THINKING;

afterEach(() => {
  if (originalModel === undefined) delete process.env.PI_MEMORY_EXTRACT_MODEL;
  else process.env.PI_MEMORY_EXTRACT_MODEL = originalModel;
  if (originalPhase2Model === undefined)
    delete process.env.PI_MEMORY_PHASE2_MODEL;
  else process.env.PI_MEMORY_PHASE2_MODEL = originalPhase2Model;
  if (originalThinking === undefined)
    delete process.env.PI_MEMORY_EXTRACT_THINKING;
  else process.env.PI_MEMORY_EXTRACT_THINKING = originalThinking;
  if (originalPhase2Thinking === undefined)
    delete process.env.PI_MEMORY_PHASE2_THINKING;
  else process.env.PI_MEMORY_PHASE2_THINKING = originalPhase2Thinking;
});

describe("BackgroundWatcherScheduler", () => {
  it("prioritizes the active worktree and bounds concurrency", async () => {
    const started: string[] = [];
    const releases = new Map<string, () => void>();
    let running = 0;
    let maxRunning = 0;
    const scheduler = new BackgroundWatcherScheduler(
      ({ id }) =>
        new Promise<void>((resolve) => {
          started.push(id);
          running += 1;
          maxRunning = Math.max(maxRunning, running);
          releases.set(id, () => {
            running -= 1;
            resolve();
          });
        }),
      () => undefined,
      () => undefined,
      2,
    );

    scheduler.schedule(
      [
        { id: "one", path: "/one" },
        { id: "two", path: "/two" },
        { id: "active", path: "/active" },
        { id: "three", path: "/three" },
      ],
      "active",
    );
    expect(started).toEqual(["active", "one"]);
    releases.get("active")?.();
    await vi.waitFor(() => expect(started).toEqual(["active", "one", "two"]));
    expect(maxRunning).toBe(2);
    releases.get("one")?.();
    releases.get("two")?.();
    await Promise.resolve();
    await Promise.resolve();
    releases.get("three")?.();
    scheduler.dispose();
  });

  it("returns immediately, contains failures, and cancels queued work", async () => {
    const failures: unknown[] = [];
    let release: () => void = () => undefined;
    const started: string[] = [];
    const scheduler = new BackgroundWatcherScheduler(
      ({ id }) => {
        started.push(id);
        if (id === "running")
          return new Promise<void>((resolve) => {
            release = resolve;
          });
        return Promise.reject(new Error("private path must not escape"));
      },
      (error) => failures.push(error),
      () => undefined,
      1,
    );

    scheduler.schedule([
      { id: "running", path: "/running" },
      { id: "cancelled", path: "/cancelled" },
      { id: "failed", path: "/failed" },
    ]);
    expect(started).toEqual(["running"]);
    scheduler.cancel("cancelled");
    release();
    await vi.waitFor(() => expect(started).toEqual(["running", "failed"]));
    await vi.waitFor(() => expect(failures).toHaveLength(1));
    scheduler.dispose();
  });
});

describe("applyMemoryConfig", () => {
  it("clears Memory overrides for an unconfigured clean install", () => {
    process.env.PI_MEMORY_EXTRACT_MODEL = "old/model";
    process.env.PI_MEMORY_PHASE2_MODEL = "old/model";
    process.env.PI_MEMORY_EXTRACT_THINKING = "high";
    process.env.PI_MEMORY_PHASE2_THINKING = "high";

    applyMemoryConfig(null);

    expect(process.env.PI_MEMORY_EXTRACT_MODEL).toBeUndefined();
    expect(process.env.PI_MEMORY_PHASE2_MODEL).toBeUndefined();
    expect(process.env.PI_MEMORY_EXTRACT_THINKING).toBeUndefined();
    expect(process.env.PI_MEMORY_PHASE2_THINKING).toBeUndefined();
  });

  it("sets the Phase 1 model and reasoning before extensions load", () => {
    applyMemoryConfig({
      phase1Provider: "openai",
      phase1ModelId: "gpt-5.6",
      phase1ReasoningEffort: "high",
      phase2Provider: "traex",
      phase2ModelId: "DeepSeek-V4-Flash",
      phase2ReasoningEffort: "max",
    });

    expect(process.env.PI_MEMORY_EXTRACT_MODEL).toBe("openai/gpt-5.6");
    expect(process.env.PI_MEMORY_PHASE2_MODEL).toBe("traex/DeepSeek-V4-Flash");
    expect(process.env.PI_MEMORY_EXTRACT_THINKING).toBe("high");
    expect(process.env.PI_MEMORY_PHASE2_THINKING).toBe("max");
  });
});
