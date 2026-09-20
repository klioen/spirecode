import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../../i18n";
import { useChangesStore } from "../changes/changesStore";
import { refreshChanges } from "../changes/changesRefresh";
import { useProjectsStore } from "../projects/projectsStore";
import { Workbench } from "./Workbench";
import { settingsApi } from "../settings/settingsApi";
import { resetWorkbenchStore } from "./workbenchStore";

vi.mock("../projects/ProjectRail", () => ({
  ProjectRail: () => <aside>Projects</aside>,
}));
vi.mock("../files/FileTree", () => ({ FileTree: () => <div>Files</div> }));
vi.mock("../changes/ChangesPanel", () => ({
  ChangesPanel: () => <div>Changes</div>,
}));
vi.mock("../changes/changesRefresh", () => ({
  refreshChanges: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../editor/EditorPane", () => ({
  EditorPane: () => <main>Editor</main>,
}));
vi.mock("./BreadcrumbSwitcher", () => ({
  BreadcrumbSwitcher: ({
    activeProject,
    activeWorktree,
    branch,
  }: {
    activeProject: { name: string };
    activeWorktree: { name: string };
    branch: string;
  }) => (
    <div data-testid="breadcrumb-switcher">
      <button>{activeProject.name}</button>
      <span>{" > "}</span>
      <button>{activeWorktree.name}</button>
      <span>{" > "}</span>
      <span className="breadcrumb-branch">{branch}</span>
    </div>
  ),
}));
vi.mock("../settings/settingsApi", () => ({
  settingsApi: { getAgentReadiness: vi.fn() },
}));
vi.mock("../settings/SettingsDialog", () => ({
  SettingsDialog: ({
    onClose,
    initialSection,
  }: {
    onClose: () => void;
    initialSection?: string;
  }) => (
    <div role="dialog" aria-label="Settings dialog">
      <span>{initialSection}</span>
      <button onClick={onClose}>Close mocked settings</button>
    </div>
  ),
}));

beforeEach(() => {
  setLanguage("en");
  localStorage.clear();
  resetWorkbenchStore();
  vi.mocked(refreshChanges).mockClear();
  vi.mocked(settingsApi.getAgentReadiness).mockResolvedValue({
    piAgentDirectoryExists: true,
    authenticatedModelCount: 1,
    availableProviders: [{ id: "openai", authenticated: true }],
    defaultModelAvailable: true,
    resourcesHealthy: true,
  });
  useChangesStore.setState({ byWorktree: {} });
  useProjectsStore.setState({
    projects: [
      {
        id: "p1",
        name: "Project",
        path: "/repo",
        lastOpenedAt: 1,
        worktrees: [
          {
            id: "w1",
            projectId: "p1",
            name: "main",
            path: "/repo",
            branch: "main",
            baseRef: "origin/main",
            kind: "main",
            lastOpenedAt: 1,
          },
        ],
      },
    ],
    activeWorktreeId: "w1",
    loading: false,
    creatingProjectId: null,
    error: null,
  });
});

describe("Workbench panel handles", () => {
  it("shows project, worktree, and the live Git branch as a three-level breadcrumb", () => {
    useChangesStore.setState({
      byWorktree: {
        w1: {
          snapshot: {
            branch: "feat/cross-platform-packaging",
            upstream: "origin/feat/cross-platform-packaging",
            ahead: 0,
            behind: 0,
            changes: [],
          },
          loading: false,
          staleError: null,
          generation: 1,
        },
      },
    });

    render(<Workbench />);

    const breadcrumb = screen.getByRole("navigation", {
      name: "Project context",
    });
    expect(breadcrumb).toHaveTextContent(
      "Project > main > feat/cross-platform-packaging",
    );
    expect(screen.getByTestId("breadcrumb-switcher")).toBeInTheDocument();
    expect(breadcrumb.querySelector(".breadcrumb-branch")).toHaveTextContent(
      "feat/cross-platform-packaging",
    );
    expect(refreshChanges).toHaveBeenCalledWith("w1");
  });

  it("shows the SpireCode identity and slogan when no project is active", () => {
    useProjectsStore.setState({ projects: [], activeWorktreeId: null });

    render(<Workbench />);

    expect(
      screen.getByRole("heading", { name: "SpireCode" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("spirecode-mark")).toBeInTheDocument();
    expect(
      screen.getByText("Fast Lightweight GUI Code Agent"),
    ).toBeInTheDocument();
  });

  it("live-switches empty chrome while preserving the product name", () => {
    useProjectsStore.setState({ projects: [], activeWorktreeId: null });

    render(<Workbench />);
    expect(
      screen.getByText("Fast Lightweight GUI Code Agent"),
    ).toBeInTheDocument();

    act(() => setLanguage("zh-CN"));

    expect(
      screen.getByRole("heading", { name: "SpireCode" }),
    ).toBeInTheDocument();
    expect(screen.getByText("快速轻量的图形化代码智能体")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "打开项目" }),
    ).toBeInTheDocument();
  });

  it("uses icon-only controls to switch files and changes", () => {
    render(<Workbench />);

    const files = screen.getByRole("button", { name: "FILES" });
    const changes = screen.getByRole("button", { name: "CHANGES" });
    expect(files).toHaveAttribute("title", "FILES");
    expect(changes).toHaveAttribute("title", "CHANGES");
    expect(files).toHaveTextContent("");
    expect(changes).toHaveTextContent("");
    expect(screen.getByText("Files")).toBeInTheDocument();

    fireEvent.click(changes);

    expect(screen.getByText("Changes")).toBeInTheDocument();
  });

  it("exposes resize separators only for the two auxiliary side panels", () => {
    render(<Workbench />);

    expect(
      screen.getByRole("separator", { name: "Resize projects panel" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("separator", {
        name: "Resize files and changes panel",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("separator", { name: "Resize terminal panel" }),
    ).not.toBeInTheDocument();
  });

  it("hides the right resize separator when the files panel is collapsed", () => {
    render(<Workbench />);

    fireEvent.click(screen.getByRole("button", { name: "Toggle files panel" }));

    expect(
      screen.queryByRole("separator", {
        name: "Resize files and changes panel",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("separator", { name: "Resize projects panel" }),
    ).toBeInTheDocument();
  });

  it("opens Agent setup automatically when no authenticated model is available", async () => {
    vi.mocked(settingsApi.getAgentReadiness).mockResolvedValueOnce({
      piAgentDirectoryExists: false,
      authenticatedModelCount: 0,
      availableProviders: [],
      defaultModelAvailable: false,
      resourcesHealthy: true,
    });
    render(<Workbench />);

    expect(
      await screen.findByRole("dialog", { name: "Settings dialog" }),
    ).toHaveTextContent("agent");
  });

  it("opens settings from the top-right action", () => {
    render(<Workbench />);

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(
      screen.getByRole("dialog", { name: "Settings dialog" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Close mocked settings" }),
    );
    expect(
      screen.queryByRole("dialog", { name: "Settings dialog" }),
    ).not.toBeInTheDocument();
  });

  it("hides the projects panel and separator when collapsed", () => {
    render(<Workbench />);

    fireEvent.click(
      screen.getByRole("button", { name: "Toggle projects panel" }),
    );

    expect(screen.queryByText("Projects")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("separator", { name: "Resize projects panel" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Editor")).toBeInTheDocument();
  });
});
