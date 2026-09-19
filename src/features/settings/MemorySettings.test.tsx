import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemorySettings } from "./MemorySettings";
import { memoryApi } from "./memoryApi";
import { settingsApi } from "./settingsApi";
import { initializeLanguage, setLanguage } from "../../i18n";

vi.mock("./settingsApi", () => ({
  settingsApi: { listExtensions: vi.fn().mockResolvedValue([]) },
}));

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
  phase1ReasoningEffort: "low" as const,
  phase2Provider: "traex",
  phase2ModelId: "DeepSeek-V4-Flash",
  phase2ReasoningEffort: "medium" as const,
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
  initializeLanguage("en");
  vi.mocked(settingsApi.listExtensions).mockResolvedValue([]);
  vi.mocked(memoryApi.read).mockImplementation(async (document) =>
    document === "summary" ? summary : handbook,
  );
  vi.mocked(memoryApi.listModels).mockResolvedValue(models);
  vi.mocked(memoryApi.getConfig).mockResolvedValue(config);
  vi.mocked(memoryApi.setConfig).mockResolvedValue({
    phase1Provider: "openai",
    phase1ModelId: "gpt-5.6",
    phase1ReasoningEffort: "high",
    phase2Provider: "traex",
    phase2ModelId: "DeepSeek-V4-Flash",
    phase2ReasoningEffort: "max",
  });
});

describe("MemorySettings", () => {
  it("disables configuration when pi-memory is disabled", async () => {
    vi.mocked(settingsApi.listExtensions).mockResolvedValueOnce([
      {
        id: "memory",
        name: "pi-memory",
        kind: "user",
        source: "package",
        scope: "global",
        displayPath: "pi-memory",
        version: "1.0.0",
        enabled: false,
        status: "disabled",
      },
    ]);
    render(<MemorySettings worktreeId="w1" />);
    expect(
      await screen.findByText("Enable pi-memory to configure Memory settings."),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("combobox", { name: "Phase 1 Model" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Save Memory configuration" }),
    ).toBeDisabled();
  });
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
      screen.getByRole("combobox", { name: "Phase 1 Reasoning Effort" }),
      { target: { value: "high" } },
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Phase 2 Reasoning Effort" }),
      { target: { value: "max" } },
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
        phase1ReasoningEffort: "high",
        phase2Provider: "traex",
        phase2ModelId: "DeepSeek-V4-Flash",
        phase2ReasoningEffort: "max",
      }),
    );
  });

  it("retranslates saved state after a live language switch", async () => {
    render(<MemorySettings />);
    const save = await screen.findByRole("button", {
      name: "Save Memory configuration",
    });
    fireEvent.click(save);

    expect(
      await screen.findByText("Restart SpireCode to apply these changes."),
    ).toBeInTheDocument();
    setLanguage("zh-CN");
    expect(
      await screen.findByText("重启 SpireCode 以应用这些更改。"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Restart SpireCode to apply these changes."),
    ).not.toBeInTheDocument();
  });

  it("stores validation semantics so validation retranslates live", async () => {
    vi.mocked(memoryApi.listModels).mockResolvedValue([
      ...models,
      { provider: "", id: "bad", label: "Invalid model", reasoning: true },
    ]);
    render(<MemorySettings />);
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Phase 1 Model" }),
      { target: { value: "/bad" } },
    );
    const save = screen.getByRole("button", {
      name: "Save Memory configuration",
    });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    expect(
      await screen.findByText("Select available Phase 1 and Phase 2 models."),
    ).toBeInTheDocument();
    setLanguage("zh-CN");
    expect(
      await screen.findByText("请选择可用的阶段 1 和阶段 2 模型。"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Select available Phase 1 and Phase 2 models."),
    ).not.toBeInTheDocument();
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
