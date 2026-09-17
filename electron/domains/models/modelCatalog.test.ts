// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { ModelCatalogService } from "./modelCatalog.js";

const available = [
  {
    provider: "traex",
    id: "DeepSeek-V4-Flash",
    name: "DeepSeek V4",
    reasoning: true,
  },
  { provider: "openai", id: "gpt-5.6", reasoning: true },
  { invalid: true },
];

describe("ModelCatalogService", () => {
  it("returns a strict available-model DTO without creating a session", async () => {
    const getAvailable = vi.fn().mockResolvedValue(available);
    const initialize = vi.fn().mockResolvedValue({ getAvailable });
    const service = new ModelCatalogService(initialize);

    await expect(service.list()).resolves.toEqual([
      { provider: "openai", id: "gpt-5.6", label: "gpt-5.6", reasoning: true },
      {
        provider: "traex",
        id: "DeepSeek-V4-Flash",
        label: "DeepSeek V4",
        reasoning: true,
      },
    ]);
    expect(initialize).toHaveBeenCalledOnce();
    expect(getAvailable).toHaveBeenCalledOnce();
  });

  it("retries initialization after a transient failure", async () => {
    const initialize = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary path detail"))
      .mockResolvedValueOnce({ getAvailable: async () => available });
    const service = new ModelCatalogService(initialize);

    await expect(service.list()).rejects.toMatchObject({
      code: "CHAT_FAILED",
      message: "Unable to initialize model catalog",
    });
    await expect(service.list()).resolves.toHaveLength(2);
    expect(initialize).toHaveBeenCalledTimes(2);
  });

  it("validates both selected models against the latest catalog", async () => {
    const service = new ModelCatalogService(async () => ({
      getAvailable: async () => available,
    }));

    await expect(
      service.assertAvailable([
        { provider: "traex", id: "DeepSeek-V4-Flash" },
        { provider: "openai", id: "gpt-5.6" },
      ]),
    ).resolves.toBeUndefined();
    await expect(
      service.assertAvailable([{ provider: "missing", id: "model" }]),
    ).rejects.toMatchObject({ code: "CHAT_MODEL_UNAVAILABLE" });
  });
});
