import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsDialog } from "./SettingsDialog";
import { memoryApi } from "./memoryApi";
import { settingsApi } from "./settingsApi";

vi.mock("./memoryApi", () => ({
  memoryApi: { read: vi.fn(), getConfig: vi.fn(), setConfig: vi.fn() },
}));

vi.mock("./settingsApi", () => ({
  settingsApi: {
    listExtensions: vi.fn(),
    setExtensionEnabled: vi.fn(),
  },
}));

const extension = {
  id: "extension-1",
  name: "review-tools",
  source: "pi" as const,
  scope: "project" as const,
  displayPath: ".pi/extensions/review-tools.ts",
  enabled: true,
  status: "enabled" as const,
};

beforeEach(() => {
  vi.mocked(memoryApi.getConfig).mockResolvedValue({
    provider: "traex",
    modelId: "DeepSeek-V4-Flash",
    reasoningEffort: "low",
  });
  vi.mocked(memoryApi.read).mockResolvedValue({
    id: "summary",
    name: "memory_summary.md",
    content: "# Memory Summary",
    size: 16,
    updatedAt: 1,
  });
  vi.mocked(settingsApi.listExtensions).mockResolvedValue([extension]);
  vi.mocked(settingsApi.setExtensionEnabled).mockResolvedValue([
    { ...extension, enabled: false, status: "disabled" },
  ]);
});

describe("SettingsDialog", () => {
  it("lists extensions and persists a toggle", async () => {
    render(<SettingsDialog worktreeId="w1" onClose={() => undefined} />);

    expect(await screen.findByText("review-tools")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Disable review-tools" }),
    );

    await waitFor(() =>
      expect(settingsApi.setExtensionEnabled).toHaveBeenCalledWith(
        "w1",
        "extension-1",
        false,
      ),
    );
    expect(
      await screen.findByRole("checkbox", { name: "Enable review-tools" }),
    ).not.toBeChecked();
  });

  it("shows a project requirement without calling Main", () => {
    render(<SettingsDialog worktreeId={null} onClose={() => undefined} />);

    expect(
      screen.getByText("Open a project to manage extensions."),
    ).toBeInTheDocument();
    expect(settingsApi.listExtensions).not.toHaveBeenCalled();
  });

  it("opens global memory without requiring a worktree", async () => {
    render(<SettingsDialog worktreeId={null} onClose={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "Memory" }));
    expect(
      await screen.findByRole("heading", { name: "Memory Summary" }),
    ).toBeInTheDocument();
    expect(memoryApi.read).toHaveBeenCalledWith("summary");
  });

  it("closes from the close button", () => {
    const close = vi.fn();
    render(<SettingsDialog worktreeId={null} onClose={close} />);

    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
    expect(close).toHaveBeenCalledOnce();
  });
});
