import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsDialog } from "./SettingsDialog";
import { memoryApi } from "./memoryApi";
import { settingsApi } from "./settingsApi";

vi.mock("./memoryApi", () => ({
  memoryApi: {
    read: vi.fn(),
    listModels: vi.fn(),
    getConfig: vi.fn(),
    setConfig: vi.fn(),
  },
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
  kind: "user" as const,
  source: "pi" as const,
  scope: "project" as const,
  displayPath: ".pi/extensions/review-tools.ts",
  enabled: true,
  status: "enabled" as const,
};

beforeEach(() => {
  vi.mocked(memoryApi.listModels).mockResolvedValue([
    {
      provider: "traex",
      id: "DeepSeek-V4-Flash",
      label: "DeepSeek V4",
      reasoning: true,
    },
  ]);
  vi.mocked(memoryApi.getConfig).mockResolvedValue({
    phase1Provider: "traex",
    phase1ModelId: "DeepSeek-V4-Flash",
    phase1ReasoningEffort: "low",
    phase2Provider: "traex",
    phase2ModelId: "DeepSeek-V4-Flash",
    phase2ReasoningEffort: "medium",
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
  it("groups built-in and user extensions and persists a toggle", async () => {
    vi.mocked(settingsApi.listExtensions).mockResolvedValue([
      {
        ...extension,
        id: "builtin-1",
        name: "pi-plan",
        kind: "builtin",
        source: "spirecode",
        scope: "global",
        displayPath: "pi-plan",
      },
      extension,
    ]);
    render(<SettingsDialog worktreeId="w1" onClose={() => undefined} />);

    expect(await screen.findByText("System built-in")).toBeInTheDocument();
    expect(screen.getByText("User extensions")).toBeInTheDocument();
    expect(screen.getByText("pi-plan")).toBeInTheDocument();
    expect(screen.getByText("review-tools")).toBeInTheDocument();
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
