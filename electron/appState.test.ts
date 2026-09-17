// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { applyMemoryConfig } from "./appState.js";

const originalModel = process.env.PI_MEMORY_EXTRACT_MODEL;
const originalThinking = process.env.PI_MEMORY_EXTRACT_THINKING;

afterEach(() => {
  if (originalModel === undefined) delete process.env.PI_MEMORY_EXTRACT_MODEL;
  else process.env.PI_MEMORY_EXTRACT_MODEL = originalModel;
  if (originalThinking === undefined)
    delete process.env.PI_MEMORY_EXTRACT_THINKING;
  else process.env.PI_MEMORY_EXTRACT_THINKING = originalThinking;
});

describe("applyMemoryConfig", () => {
  it("sets the Phase 1 model and reasoning before extensions load", () => {
    applyMemoryConfig({
      provider: "openai",
      modelId: "gpt-5.6",
      reasoningEffort: "high",
    });

    expect(process.env.PI_MEMORY_EXTRACT_MODEL).toBe("openai/gpt-5.6");
    expect(process.env.PI_MEMORY_EXTRACT_THINKING).toBe("high");
  });
});
