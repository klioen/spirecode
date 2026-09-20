import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsDialog } from "./SettingsDialog";
import { memoryApi } from "./memoryApi";
import { settingsApi } from "./settingsApi";
import { commands } from "../../bindings";
import { initializeLanguage } from "../../i18n";

vi.mock("../../bindings", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../bindings")>();
  return {
    ...original,
    commands: {
      ...original.commands,
      feedbackOpen: vi.fn().mockResolvedValue(undefined),
    },
  };
});

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
    getLanguage: vi.fn(),
    setLanguage: vi.fn(),
    getAgentReadiness: vi.fn(),
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
  initializeLanguage("en");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  vi.mocked(settingsApi.getLanguage).mockResolvedValue("en");
  vi.mocked(settingsApi.setLanguage).mockImplementation(
    async (language) => language,
  );
  vi.mocked(settingsApi.getAgentReadiness).mockResolvedValue({
    piAgentDirectoryExists: true,
    authenticatedModelCount: 1,
    availableProviders: [{ id: "openai", authenticated: true }],
    defaultModelAvailable: true,
    resourcesHealthy: true,
  });
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
});

describe("SettingsDialog", () => {
  it("shows only resolved user resources as a read-only list", async () => {
    render(<SettingsDialog worktreeId="w1" onClose={() => undefined} />);

    expect(
      await screen.findByText("Configured user resources"),
    ).toBeInTheDocument();
    expect(screen.queryByText("System built-in")).not.toBeInTheDocument();
    expect(screen.getByText("review-tools")).toBeInTheDocument();
    expect(screen.getByText("pi")).toBeInTheDocument();
    expect(screen.getByText("Enabled in pi settings")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("shows global user resources without an open project", async () => {
    render(<SettingsDialog worktreeId={null} onClose={() => undefined} />);

    expect(
      await screen.findByText("Configured user resources"),
    ).toBeInTheDocument();
    expect(settingsApi.listExtensions).toHaveBeenCalledWith(undefined);
  });

  it("shows Agent setup state and refreshes readiness", async () => {
    vi.mocked(settingsApi.getAgentReadiness)
      .mockResolvedValueOnce({
        piAgentDirectoryExists: false,
        authenticatedModelCount: 0,
        availableProviders: [],
        defaultModelAvailable: false,
        resourcesHealthy: true,
      })
      .mockResolvedValueOnce({
        piAgentDirectoryExists: true,
        authenticatedModelCount: 1,
        availableProviders: [{ id: "openai", authenticated: true }],
        defaultModelAvailable: true,
        resourcesHealthy: true,
      });
    render(<SettingsDialog worktreeId={null} onClose={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "Agent" }));
    expect(
      await screen.findByText("Setup is required before starting Chat."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Recheck" }));
    expect(
      await screen.findByText("Ready with 1 authenticated model(s)."),
    ).toBeInTheDocument();
  });

  it("opens global memory without requiring a worktree", async () => {
    render(<SettingsDialog worktreeId={null} onClose={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "Memory" }));
    expect(
      await screen.findByRole("heading", { name: "Memory Summary" }),
    ).toBeInTheDocument();
    expect(memoryApi.read).toHaveBeenCalledWith("summary");
  });

  it("switches language live only after Main persists it", async () => {
    let resolveLanguage!: (language: "zh-CN") => void;
    vi.mocked(settingsApi.setLanguage).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLanguage = resolve;
      }),
    );
    render(<SettingsDialog worktreeId={null} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "General" }));
    const language = screen.getByRole("combobox", { name: "Language" });
    fireEvent.change(language, { target: { value: "zh-CN" } });

    expect(settingsApi.setLanguage).toHaveBeenCalledWith("zh-CN");
    expect(language).toBeDisabled();
    expect(
      screen.getByRole("heading", { name: "General" }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");

    resolveLanguage("zh-CN");
    expect(
      await screen.findByRole("heading", { name: "通用" }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("zh-CN");
  });

  it("removes diagnostics and keeps feedback as a standalone setting", () => {
    render(<SettingsDialog worktreeId={null} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "General" }));

    expect(screen.queryByText("Diagnostics")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Copy diagnostics" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reveal logs" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Feedback")).toBeInTheDocument();
    expect(
      screen.getByText("Report an issue or share feedback about SpireCode."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(commands.feedbackOpen).toHaveBeenCalledOnce();
  });

  it("keeps the previous language when persistence fails", async () => {
    vi.mocked(settingsApi.setLanguage).mockRejectedValueOnce({
      code: "SETTINGS_FAILED",
      message: "write failed",
    });
    render(<SettingsDialog worktreeId={null} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "General" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Language" }), {
      target: { value: "zh-CN" },
    });

    expect(await screen.findByText("write failed")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "General" }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
  });

  it("traps focus and restores it to the opener when closed", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { unmount } = render(
      <SettingsDialog worktreeId={null} onClose={() => undefined} />,
    );

    const dialog = screen.getByRole("dialog", { name: "Settings" });
    const closeButton = screen.getByRole("button", { name: "Close settings" });
    const terminalButton = screen.getByRole("button", { name: "Terminal" });
    expect(closeButton).toHaveFocus();

    terminalButton.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(closeButton).toHaveFocus();

    closeButton.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(terminalButton).toHaveFocus();

    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("closes from the close button, Escape, and backdrop", () => {
    const close = vi.fn();
    const { rerender } = render(
      <SettingsDialog worktreeId={null} onClose={close} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
    expect(close).toHaveBeenCalledOnce();

    close.mockClear();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();

    close.mockClear();
    const dialog = screen.getByRole("dialog");
    fireEvent.mouseDown(dialog.parentElement!);
    expect(close).toHaveBeenCalledOnce();
    rerender(<></>);
  });
});
