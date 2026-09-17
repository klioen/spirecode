// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { applyMemoryConfig } from "./appState.js";

const originalModel = process.env.PI_MEMORY_EXTRACT_MODEL;
const originalPhase2Model = process.env.PI_MEMORY_PHASE2_MODEL;
const originalThinking = process.env.PI_MEMORY_EXTRACT_THINKING;

afterEach(() => {
  if (originalModel === undefined) delete process.env.PI_MEMORY_EXTRACT_MODEL;
  else process.env.PI_MEMORY_EXTRACT_MODEL = originalModel;
  if (originalPhase2Model === undefined)
    delete process.env.PI_MEMORY_PHASE2_MODEL;
  else process.env.PI_MEMORY_PHASE2_MODEL = originalPhase2Model;
  if (originalThinking === undefined)
    delete process.env.PI_MEMORY_EXTRACT_THINKING;
  else process.env.PI_MEMORY_EXTRACT_THINKING = originalThinking;
});

describe("applyMemoryConfig", () => {
  it("sets the Phase 1 model and reasoning before extensions load", () => {
    applyMemoryConfig({
      phase1Provider: "openai",
      phase1ModelId: "gpt-5.6",
      phase2Provider: "traex",
      phase2ModelId: "DeepSeek-V4-Flash",
      reasoningEffort: "high",
    });

    expect(process.env.PI_MEMORY_EXTRACT_MODEL).toBe("openai/gpt-5.6");
    expect(process.env.PI_MEMORY_PHASE2_MODEL).toBe("traex/DeepSeek-V4-Flash");
    expect(process.env.PI_MEMORY_EXTRACT_THINKING).toBe("high");
  });
});
