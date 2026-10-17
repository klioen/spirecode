import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "./SettingsPage";
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
    listExtensionCatalog: vi.fn(),
    installExtensionPackage: vi.fn(),
    updateExtensionPackage: vi.fn(),
    removeExtensionPackage: vi.fn(),
    listSkills: vi.fn(),
    setSkillEnabled: vi.fn(),
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
  vi.mocked(settingsApi.listExtensionCatalog).mockResolvedValue({
    items: [
      {
        name: "pi-safe",
        description: "Safe community tools.",
        publisher: "alice",
        downloads: 1200,
        downloadsLabel: "1.2K/mo",
        publishedLabel: "2d ago",
        types: ["extension"],
        catalogUrl: "https://pi.dev/packages/pi-safe?type=extension",
        npmUrl: "https://www.npmjs.com/package/pi-safe",
        repositoryUrl: "https://github.com/example/pi-safe",
      },
    ],
    page: 1,
    total: 1,
    totalPages: 1,
  });
  vi.mocked(settingsApi.installExtensionPackage).mockResolvedValue([
    {
      ...extension,
      id: "installed-safe",
      name: "pi-safe",
      source: "package",
      packageSource: "npm:pi-safe",
      management: "npm",
    },
  ]);
  vi.mocked(settingsApi.updateExtensionPackage).mockResolvedValue([extension]);
  vi.mocked(settingsApi.removeExtensionPackage).mockResolvedValue([]);
  vi.mocked(settingsApi.listSkills).mockResolvedValue([]);
  vi.mocked(settingsApi.setSkillEnabled).mockResolvedValue([]);
});

describe("SettingsPage", () => {
  it("offers system, light, and dark appearance modes", () => {
    render(
      <SettingsPage
        worktreeId={null}
        initialSection="general"
        onBack={() => undefined}
      />,
    );

    const theme = screen.getByRole("combobox", { name: "Theme" });
    expect(
      Array.from((theme as HTMLSelectElement).options).map((option) =>
        option.textContent?.trim(),
      ),
    ).toEqual(["System", "Light", "Dark"]);
  });

  it("shows Installed first and selects it by default", async () => {
    render(<SettingsPage worktreeId="w1" onBack={() => undefined} />);

    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Installed",
      "Marketplace",
    ]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(settingsApi.listExtensionCatalog).not.toHaveBeenCalled();
  });

  it("shows resolved user resources in the Installed tab", async () => {
    render(<SettingsPage worktreeId="w1" onBack={() => undefined} />);

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
    render(<SettingsPage worktreeId={null} onBack={() => undefined} />);

    fireEvent.click(await screen.findByRole("tab", { name: "Installed" }));
    expect(
      await screen.findByText("Configured user resources"),
    ).toBeInTheDocument();
    expect(settingsApi.listExtensions).toHaveBeenCalledWith(undefined);
  });

  it("browses the Pi Catalog without presenting community packages as verified", async () => {
    render(<SettingsPage worktreeId={null} onBack={() => undefined} />);

    fireEvent.click(screen.getByRole("tab", { name: "Marketplace" }));
    expect(await screen.findByText("pi-safe")).toBeInTheDocument();
    expect(screen.getByText("Safe community tools.")).toBeInTheDocument();
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("Community")).toBeInTheDocument();
    expect(screen.queryByText("Verified")).not.toBeInTheDocument();
    expect(settingsApi.listExtensionCatalog).toHaveBeenCalledWith(
      "",
      "downloads",
      1,
    );
  });

  it("requires an explicit trust confirmation before installing", async () => {
    render(<SettingsPage worktreeId={null} onBack={() => undefined} />);

    fireEvent.click(screen.getByRole("tab", { name: "Marketplace" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Install pi-safe" }),
    );
    expect(
      screen.getByRole("heading", { name: "Install pi-safe?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/same operating-system permissions as the Pi agent/i),
    ).toBeInTheDocument();
    expect(settingsApi.installExtensionPackage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Install extension" }));
    await waitFor(() =>
      expect(settingsApi.installExtensionPackage).toHaveBeenCalledWith(
        "pi-safe",
      ),
    );
    expect(
      await screen.findByText(
        /Restart active Agent sessions to apply extension changes/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Installed pi-safe" }),
    ).toBeDisabled();
  });

  it("keeps unmanaged resources read-only and manages configured npm packages", async () => {
    const installed = [
      extension,
      {
        ...extension,
        id: "managed",
        name: "pi-safe",
        source: "package" as const,
        packageSource: "npm:pi-safe",
        management: "npm" as const,
      },
      {
        ...extension,
        id: "local",
        name: "pi-local",
        source: "package" as const,
        scope: "global" as const,
        packageSource: "../../dev/pi-local",
        management: "local" as const,
      },
    ];
    vi.mocked(settingsApi.listExtensions).mockResolvedValue(installed);
    vi.mocked(settingsApi.updateExtensionPackage).mockResolvedValue(installed);
    render(<SettingsPage worktreeId={null} onBack={() => undefined} />);

    fireEvent.click(await screen.findByRole("tab", { name: "Installed" }));
    expect(await screen.findByText("review-tools")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Update review-tools" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Update pi-local" }),
    ).toBeNull();
    const removeLocal = screen.getByRole("button", {
      name: "Remove pi-local from Pi",
    });
    expect(removeLocal).toBeInTheDocument();
    vi.mocked(settingsApi.removeExtensionPackage).mockResolvedValueOnce(
      installed,
    );
    fireEvent.click(removeLocal);
    expect(
      screen.getByRole("heading", { name: "Remove pi-local from Pi?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not delete or modify the source files/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove from Pi" }));
    await waitFor(() =>
      expect(settingsApi.removeExtensionPackage).toHaveBeenCalledWith(
        "../../dev/pi-local",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Update pi-safe" }));
    await waitFor(() =>
      expect(settingsApi.updateExtensionPackage).toHaveBeenCalledWith(
        "npm:pi-safe",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Uninstall pi-safe" }));
    expect(
      screen.getByRole("heading", { name: "Uninstall pi-safe?" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Uninstall extension" }),
    );
    await waitFor(() =>
      expect(settingsApi.removeExtensionPackage).toHaveBeenCalledWith(
        "npm:pi-safe",
      ),
    );
  });

  it("groups skills and persists a single-skill toggle", async () => {
    const skills = [
      {
        id: "builtin-skill",
        name: "sdlc-build",
        description: "Implement approved plans.",
        kind: "builtin" as const,
        displayPath: "pi-sdlc",
        enabled: true,
        status: "enabled" as const,
        disableModelInvocation: false,
      },
      {
        id: "user-skill",
        name: "pdf-tools",
        description: "Extract PDFs.",
        kind: "user" as const,
        displayPath: "~/.pi/agent/skills/pdf-tools/SKILL.md",
        enabled: true,
        status: "enabled" as const,
        disableModelInvocation: false,
      },
      {
        id: "project-skill",
        name: "release",
        description: "Prepare a release.",
        kind: "project" as const,
        displayPath: ".pi/skills/release/SKILL.md",
        enabled: true,
        status: "enabled" as const,
        disableModelInvocation: true,
      },
    ];
    vi.mocked(settingsApi.listSkills).mockResolvedValue(skills);
    vi.mocked(settingsApi.setSkillEnabled).mockResolvedValue([
      skills[0],
      { ...skills[1], enabled: false, status: "disabled" },
      skills[2],
    ]);
    render(<SettingsPage worktreeId="w1" onBack={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "Skills" }));
    expect(await screen.findByText("System built-in")).toBeInTheDocument();
    expect(screen.getByText("User skills")).toBeInTheDocument();
    expect(screen.getByText("Project skills")).toBeInTheDocument();
    expect(screen.getByText("Extract PDFs.")).toBeInTheDocument();
    expect(screen.getByText("Explicit command only")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Disable pdf-tools" }),
    );

    await waitFor(() =>
      expect(settingsApi.setSkillEnabled).toHaveBeenCalledWith(
        "w1",
        "user-skill",
        false,
      ),
    );
    expect(
      await screen.findByRole("checkbox", { name: "Enable pdf-tools" }),
    ).not.toBeChecked();
  });

  it("requires a project before loading skills", () => {
    render(<SettingsPage worktreeId={null} onBack={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "Skills" }));
    expect(
      screen.getByText("Open a project to manage skills."),
    ).toBeInTheDocument();
    expect(settingsApi.listSkills).not.toHaveBeenCalled();
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
    render(<SettingsPage worktreeId={null} onBack={() => undefined} />);

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
    render(<SettingsPage worktreeId={null} onBack={() => undefined} />);

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
    render(<SettingsPage worktreeId={null} onBack={() => undefined} />);
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
    render(<SettingsPage worktreeId={null} onBack={() => undefined} />);
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
    render(<SettingsPage worktreeId={null} onBack={() => undefined} />);
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

  it("renders as a full page with grouped navigation and an explicit back action", () => {
    const back = vi.fn();
    render(
      <SettingsPage worktreeId={null} initialSection="general" onBack={back} />,
    );

    expect(screen.getByRole("main", { name: "Settings" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("CORE")).toBeInTheDocument();
    expect(screen.getByText("CAPABILITIES")).toBeInTheDocument();
    expect(screen.getByText("WORKSPACE")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "General" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    fireEvent.click(screen.getByRole("button", { name: "Back to workspace" }));
    expect(back).toHaveBeenCalledOnce();
  });

  it("filters sections from the Settings search field and focuses the first match", async () => {
    render(<SettingsPage worktreeId={null} onBack={() => undefined} />);
    const search = screen.getByRole("searchbox", { name: "Search settings" });
    expect(search).toHaveFocus();

    fireEvent.change(search, { target: { value: "theme" } });

    expect(screen.queryByRole("button", { name: "Extensions" })).toBeNull();
    expect(screen.getByRole("button", { name: "General" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      await screen.findByRole("heading", { name: "General" }),
    ).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "no-setting-matches" } });
    expect(
      screen.getByText('No settings found for "no-setting-matches".'),
    ).toBeInTheDocument();
  });
});
