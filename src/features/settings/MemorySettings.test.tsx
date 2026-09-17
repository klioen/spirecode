import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemorySettings } from "./MemorySettings";
import { memoryApi } from "./memoryApi";

vi.mock("./memoryApi", () => ({
  memoryApi: {
    read: vi.fn(),
    listModels: vi.fn(),
    getConfig: vi.fn(),
    setConfig: vi.fn(),
  },
}));

const summary = {
  id: "summary" as const,
  name: "memory_summary.md",
  content: "# Summary\n\nCurrent memory.",
  size: 27,
  updatedAt: 1,
};
const handbook = {
  id: "handbook" as const,
  name: "MEMORY.md",
  content: "# Handbook\n\nLong-term memory.",
  size: 30,
  updatedAt: 2,
};
const config = {
  phase1Provider: "traex",
  phase1ModelId: "DeepSeek-V4-Flash",
  phase2Provider: "traex",
  phase2ModelId: "DeepSeek-V4-Flash",
  reasoningEffort: "low" as const,
};
const models = [
  { provider: "openai", id: "gpt-5.6", label: "GPT 5.6", reasoning: true },
  {
    provider: "traex",
    id: "DeepSeek-V4-Flash",
    label: "DeepSeek V4",
    reasoning: true,
  },
];

beforeEach(() => {
  vi.mocked(memoryApi.read).mockImplementation(async (document) =>
    document === "summary" ? summary : handbook,
  );
  vi.mocked(memoryApi.listModels).mockResolvedValue(models);
  vi.mocked(memoryApi.getConfig).mockResolvedValue(config);
  vi.mocked(memoryApi.setConfig).mockResolvedValue({
    phase1Provider: "openai",
    phase1ModelId: "gpt-5.6",
    phase2Provider: "traex",
    phase2ModelId: "DeepSeek-V4-Flash",
    reasoningEffort: "high",
  });
});

describe("MemorySettings", () => {
  it("loads the summary and switches documents without refresh", async () => {
    render(<MemorySettings />);
    expect(
      await screen.findByRole("heading", { name: "Summary" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Refresh memory document" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "MEMORY.md" }));
    expect(
      await screen.findByRole("heading", { name: "Handbook" }),
    ).toBeInTheDocument();
  });

  it("loads model dropdowns and saves separate Phase 1 and Phase 2 models", async () => {
    render(<MemorySettings />);
    const phase1 = await screen.findByRole("combobox", {
      name: "Phase 1 Model",
    });
    const phase2 = screen.getByRole("combobox", { name: "Phase 2 Model" });
    expect(phase1).toHaveValue("traex/DeepSeek-V4-Flash");
    expect(phase2).toHaveValue("traex/DeepSeek-V4-Flash");
    expect(
      screen.queryByRole("textbox", { name: /Model/ }),
    ).not.toBeInTheDocument();

    fireEvent.change(phase1, { target: { value: "openai/gpt-5.6" } });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Reasoning Effort" }),
      { target: { value: "high" } },
    );
    const save = screen.getByRole("button", {
      name: "Save Memory configuration",
    });
    expect(save).not.toHaveClass("primary");
    fireEvent.click(save);

    await waitFor(() =>
      expect(memoryApi.setConfig).toHaveBeenCalledWith({
        phase1Provider: "openai",
        phase1ModelId: "gpt-5.6",
        phase2Provider: "traex",
        phase2ModelId: "DeepSeek-V4-Flash",
        reasoningEffort: "high",
      }),
    );
  });

  it("preserves a configured unavailable model and disables saving", async () => {
    vi.mocked(memoryApi.getConfig).mockResolvedValue({
      ...config,
      phase1Provider: "missing",
      phase1ModelId: "old",
    });
    render(<MemorySettings />);
    const phase1 = await screen.findByRole("combobox", {
      name: "Phase 1 Model",
    });
    expect(phase1).toHaveValue("missing/old");
    expect(
      screen.getByRole("option", { name: "missing/old (Unavailable)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save Memory configuration" }),
    ).toBeDisabled();
  });

  it("shows model-catalog failure without blocking documents", async () => {
    vi.mocked(memoryApi.listModels).mockRejectedValue({
      code: "CHAT_FAILED",
      message: "catalog failed",
    });
    render(<MemorySettings />);
    expect(
      await screen.findByText("Unable to load models: catalog failed"),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Summary" }),
    ).toBeInTheDocument();
  });

  it("restores persisted configuration when saving fails", async () => {
    vi.mocked(memoryApi.setConfig).mockRejectedValue({
      code: "INVALID_ARGUMENT",
      message: "unable to save configuration",
    });
    render(<MemorySettings />);
    const phase1 = await screen.findByRole("combobox", {
      name: "Phase 1 Model",
    });
    fireEvent.change(phase1, { target: { value: "openai/gpt-5.6" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Save Memory configuration" }),
    );
    expect(
      await screen.findByText("unable to save configuration"),
    ).toBeInTheDocument();
    expect(phase1).toHaveValue("traex/DeepSeek-V4-Flash");
  });

  it("does not let an older document request replace the selected document", async () => {
    let resolveSummary!: (value: typeof summary) => void;
    vi.mocked(memoryApi.read).mockImplementation((document) =>
      document === "summary"
        ? new Promise((resolve) => {
            resolveSummary = resolve;
          })
        : Promise.resolve(handbook),
    );
    render(<MemorySettings />);
    fireEvent.click(screen.getByRole("button", { name: "MEMORY.md" }));
    expect(
      await screen.findByRole("heading", { name: "Handbook" }),
    ).toBeInTheDocument();
    resolveSummary(summary);
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Summary" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("shows a missing-document state", async () => {
    vi.mocked(memoryApi.read).mockRejectedValue({
      code: "NOT_FOUND",
      message: "missing",
    });
    render(<MemorySettings />);
    expect(
      await screen.findByText("memory_summary.md has not been generated yet."),
    ).toBeInTheDocument();
  });
});
