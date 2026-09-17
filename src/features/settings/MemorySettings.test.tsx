import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemorySettings } from "./MemorySettings";
import { memoryApi } from "./memoryApi";

vi.mock("./memoryApi", () => ({
  memoryApi: { read: vi.fn(), getConfig: vi.fn(), setConfig: vi.fn() },
}));

const summary = {
  id: "summary" as const,
  name: "memory_summary.md",
  content: "# Summary\n\nCurrent memory.",
  size: 27,
  updatedAt: Date.parse("2026-09-16T12:00:00Z"),
};
const handbook = {
  id: "handbook" as const,
  name: "MEMORY.md",
  content: "# Handbook\n\nLong-term memory.",
  size: 30,
  updatedAt: Date.parse("2026-09-16T13:00:00Z"),
};
const config = {
  provider: "traex",
  modelId: "DeepSeek-V4-Flash",
  reasoningEffort: "low" as const,
};

beforeEach(() => {
  vi.mocked(memoryApi.read).mockImplementation(async (document) =>
    document === "summary" ? summary : handbook,
  );
  vi.mocked(memoryApi.getConfig).mockResolvedValue(config);
  vi.mocked(memoryApi.setConfig).mockResolvedValue({
    provider: "openai",
    modelId: "gpt-5.6",
    reasoningEffort: "high",
  });
});

describe("MemorySettings", () => {
  it("loads the summary by default and switches documents without a refresh button", async () => {
    render(<MemorySettings />);

    expect(
      await screen.findByRole("heading", { name: "Summary" }),
    ).toBeInTheDocument();
    expect(memoryApi.read).toHaveBeenCalledWith("summary");
    expect(
      screen.queryByRole("button", { name: "Refresh memory document" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "MEMORY.md" }));
    expect(
      await screen.findByRole("heading", { name: "Handbook" }),
    ).toBeInTheDocument();
    expect(memoryApi.read).toHaveBeenCalledWith("handbook");
  });

  it("loads and saves Memory Model and reasoning effort", async () => {
    render(<MemorySettings />);

    const model = await screen.findByRole("textbox", { name: "Memory Model" });
    expect(model).toHaveValue("traex/DeepSeek-V4-Flash");
    expect(
      screen.getByRole("combobox", { name: "Reasoning Effort" }),
    ).toHaveValue("low");

    fireEvent.change(model, { target: { value: "openai/gpt-5.6" } });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Reasoning Effort" }),
      {
        target: { value: "high" },
      },
    );
    const save = screen.getByRole("button", {
      name: "Save Memory configuration",
    });
    expect(save.parentElement).toHaveClass("memory-config-actions");
    fireEvent.click(save);

    await waitFor(() =>
      expect(memoryApi.setConfig).toHaveBeenCalledWith({
        provider: "openai",
        modelId: "gpt-5.6",
        reasoningEffort: "high",
      }),
    );
    expect(
      await screen.findByText("Restart SpireCode to apply these changes."),
    ).toBeInTheDocument();
  });

  it("restores persisted configuration when saving fails", async () => {
    vi.mocked(memoryApi.setConfig).mockRejectedValue({
      code: "INVALID_ARGUMENT",
      message: "unable to save configuration",
    });
    render(<MemorySettings />);
    const model = await screen.findByRole("textbox", { name: "Memory Model" });
    fireEvent.change(model, { target: { value: "openai/gpt-5.6" } });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Reasoning Effort" }),
      {
        target: { value: "high" },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save Memory configuration" }),
    );

    expect(
      await screen.findByText("unable to save configuration"),
    ).toBeInTheDocument();
    expect(model).toHaveValue("traex/DeepSeek-V4-Flash");
    expect(
      screen.getByRole("combobox", { name: "Reasoning Effort" }),
    ).toHaveValue("low");
  });

  it("rejects a Memory Model without provider and model parts", async () => {
    render(<MemorySettings />);
    const model = await screen.findByRole("textbox", { name: "Memory Model" });
    fireEvent.change(model, { target: { value: "invalid" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Save Memory configuration" }),
    );

    expect(
      await screen.findByText("Use a full provider/model identifier."),
    ).toBeInTheDocument();
    expect(memoryApi.setConfig).not.toHaveBeenCalled();
  });

  it("shows a missing-document state", async () => {
    vi.mocked(memoryApi.read).mockRejectedValue({
      code: "NOT_FOUND",
      message: "memory document has not been generated",
    });
    render(<MemorySettings />);

    expect(
      await screen.findByText("memory_summary.md has not been generated yet."),
    ).toBeInTheDocument();
  });

  it("does not let an older request replace the selected document", async () => {
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
});
