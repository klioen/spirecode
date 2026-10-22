// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyMemoryConfig, createTaskSession } from "./appState.js";

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

describe("createTaskSession", () => {
  it("binds an empty Pi session without resolving a path before prompt persistence", async () => {
    const create = vi.fn(async () => ({ sessionId: "run-1" }));
    const nameLoadedSession = vi.fn(async () => undefined);
    const onEvent = vi.fn();

    await expect(
      createTaskSession(
        { create, nameLoadedSession } as unknown as Parameters<
          typeof createTaskSession
        >[0],
        "worktree-1",
        {
          sessionId: "run-1",
          reportTool: {
            name: "task_report_result",
            description: "Report the result",
          },
          reportResult: vi.fn(),
          onEvent,
        } as unknown as Parameters<typeof createTaskSession>[2],
      ),
    ).resolves.toEqual({ sessionId: "run-1", sessionPath: null });

    expect(create).toHaveBeenCalledWith(
      "worktree-1",
      expect.objectContaining({ sessionId: "run-1" }),
    );
    expect(nameLoadedSession).toHaveBeenCalledWith(
      "worktree-1",
      "run-1",
      "SpireCode Task run-1",
    );
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
