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

  it("shows only resolved user resources as a read-only list", async () => {
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

    expect(
      await screen.findByText("Configured user resources"),
    ).toBeInTheDocument();
    expect(settingsApi.listExtensions).toHaveBeenCalledWith(undefined);
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
