import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../../i18n";
import { useChangesStore } from "../changes/changesStore";
import { refreshChanges } from "../changes/changesRefresh";
import { useEditorStore } from "../editor/editorStore";
import { projectsApi } from "../projects/projectsApi";
import { useProjectsStore } from "../projects/projectsStore";
import { Workbench } from "./Workbench";
import { settingsApi } from "../settings/settingsApi";
import { resetWorkbenchStore, useWorkbenchStore } from "./workbenchStore";

vi.mock("../projects/ProjectRail", () => ({
  ProjectRail: ({
    onToggleProjects,
    onOpenSettings,
    onOpenTasks,
    onOpenSession,
  }: {
    onToggleProjects: () => void;
    onOpenSettings: () => void;
    onOpenTasks: () => void;
    onOpenSession: () => void;
  }) => (
    <aside>
      Projects
      <button onClick={onToggleProjects}>Toggle projects panel</button>
      <button onClick={onOpenSettings}>Settings</button>
      <button onClick={onOpenTasks}>Tasks</button>
      <button onClick={onOpenSession}>Project session</button>
    </aside>
  ),
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
vi.mock("../tasks/TaskPage", () => ({
  TaskPage: ({
    onOpenSession,
  }: {
    onOpenSession?: (worktreeId: string, sessionId: string) => void;
  }) => (
    <main>
      Task page
      <button onClick={() => onOpenSession?.("task-worktree", "task-session")}>
        Task session
      </button>
    </main>
  ),
}));
vi.mock("./BreadcrumbSwitcher", () => ({
  BreadcrumbSwitcher: ({
    activeProject,
    activeWorktree,
    branch,
  }: {
    activeProject: { name: string; kind: "git" | "directory" };
    activeWorktree: { name: string };
    branch: string;
  }) => (
    <div data-testid="breadcrumb-switcher">
      <button>{activeProject.name}</button>
      {activeProject.kind === "git" && (
        <>
          <span>{" > "}</span>
          <button>{activeWorktree.name}</button>
          <span>{" > "}</span>
          <span className="breadcrumb-branch">{branch}</span>
        </>
      )}
    </div>
  ),
}));
vi.mock("../projects/projectsApi", () => ({
  projectsApi: { selectWorktree: vi.fn() },
}));
vi.mock("../settings/settingsApi", () => ({
  settingsApi: { getAgentReadiness: vi.fn() },
}));
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
};

vi.mock("../settings/SettingsPage", () => ({
  SettingsPage: ({
    onBack,
    initialSection,
  }: {
    onBack: () => void;
    initialSection?: string;
  }) => (
    <main aria-label="Settings page">
      <span>{initialSection}</span>
      <button onClick={onBack}>Back to workspace</button>
    </main>
  ),
}));

beforeEach(() => {
  setLanguage("en");
  localStorage.clear();
  resetWorkbenchStore();
  vi.mocked(refreshChanges).mockClear();
  vi.mocked(projectsApi.selectWorktree).mockResolvedValue({
    id: "task-worktree",
    projectId: "p1",
    name: "task-fix",
    path: "/task-fix",
    branch: "task-fix",
    baseRef: "origin/main",
    kind: "managed",
    lastOpenedAt: 2,
  });
  vi.mocked(settingsApi.getAgentReadiness).mockResolvedValue({
    piAgentDirectoryExists: true,
    authenticatedModelCount: 1,
    availableProviders: [{ id: "openai", authenticated: true }],
    defaultModelAvailable: true,
    resourcesHealthy: true,
  });
  useChangesStore.setState({ byWorktree: {} });
  useEditorStore.setState({ views: {} });
  useProjectsStore.setState({
    groups: [],
    projects: [
      {
        id: "p1",
        groupId: null,
        name: "Project",
        path: "/repo",
        kind: "git",
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

  it("uses Files without mutating the Changes preference for a directory project", () => {
    useProjectsStore.setState({
      projects: [
        {
          id: "directory",
          groupId: null,
          name: "Notes",
          path: "/notes",
          kind: "directory",
          lastOpenedAt: 1,
          worktrees: [
            {
              id: "directory-main",
              projectId: "directory",
              name: "Notes",
              path: "/notes",
              branch: "",
              baseRef: "",
              kind: "main",
              lastOpenedAt: 1,
            },
          ],
        },
      ],
      activeWorktreeId: "directory-main",
    });
    useWorkbenchStore.getState().setRightView("changes");

    render(<Workbench />);

    expect(refreshChanges).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "CHANGES" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Files")).toBeInTheDocument();
    expect(screen.queryByText("Changes")).not.toBeInTheDocument();
    expect(useWorkbenchStore.getState().rightView).toBe("changes");
    expect(
      screen.getByRole("navigation", { name: "Project context" }),
    ).toHaveTextContent("Notes");
  });

  it("restores the Changes preference when switching back to a Git project", () => {
    useWorkbenchStore.getState().setRightView("changes");
    const directoryProject = {
      id: "directory",
      groupId: null,
      name: "Notes",
      path: "/notes",
      kind: "directory" as const,
      lastOpenedAt: 1,
      worktrees: [
        {
          id: "directory-main",
          projectId: "directory",
          name: "Notes",
          path: "/notes",
          branch: "",
          baseRef: "",
          kind: "main" as const,
          lastOpenedAt: 1,
        },
      ],
    };
    const gitProject = useProjectsStore.getState().projects[0];
    useProjectsStore.setState({
      projects: [directoryProject, gitProject],
      activeWorktreeId: "directory-main",
    });
    const view = render(<Workbench />);
    expect(screen.getByText("Files")).toBeInTheDocument();

    act(() => useProjectsStore.getState().selectWorktree("w1"));
    view.rerender(<Workbench />);

    expect(screen.getByText("Changes")).toBeInTheDocument();
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
      screen.getByRole("button", { name: "打开目录" }),
    ).toBeInTheDocument();
  });

  it("keeps theme selection exclusive to Settings", () => {
    render(<Workbench />);

    expect(
      screen.queryByRole("button", { name: /^Theme:/ }),
    ).not.toBeInTheDocument();
  });

  it("uses icon-only controls to switch files and changes", () => {
    render(<Workbench />);

    const files = screen.getByRole("button", { name: "FILES" });
    const changes = screen.getByRole("button", { name: "CHANGES" });
    fireEvent.focus(files);
    expect(screen.getByRole("tooltip", { name: "FILES" })).toHaveAttribute(
      "id",
      files.getAttribute("aria-describedby"),
    );
    fireEvent.blur(files, { relatedTarget: changes });
    fireEvent.focus(changes);
    expect(screen.getByRole("tooltip", { name: "CHANGES" })).toHaveAttribute(
      "id",
      changes.getAttribute("aria-describedby"),
    );
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
      await screen.findByRole("main", { name: "Settings page" }),
    ).toHaveTextContent("agent");
    expect(screen.queryByText("Editor")).not.toBeInTheDocument();
  });

  it("opens full-page settings from the Projects footer and returns to the workspace", () => {
    render(<Workbench />);

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(
      screen.getByRole("main", { name: "Settings page" }),
    ).toHaveTextContent("general");
    expect(screen.queryByText("Projects")).not.toBeInTheDocument();
    expect(screen.queryByText("Editor")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to workspace" }));
    expect(
      screen.queryByRole("main", { name: "Settings page" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Projects")).toBeInTheDocument();
    expect(screen.getByText("Editor")).toBeInTheDocument();
  });

  it("opens the global Task surface without losing the workspace", () => {
    render(<Workbench />);

    fireEvent.click(screen.getByRole("button", { name: "Tasks" }));
    expect(screen.getByText("Task page")).toBeInTheDocument();
    expect(screen.getByText("Task page").closest(".workbench")).toHaveClass(
      "tasks-open",
    );
    expect(screen.queryByText("Editor")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("separator", { name: "Resize files panel" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tasks" }));
    expect(screen.getByText("Editor")).toBeInTheDocument();
  });

  it("returns from Tasks when a Project session is opened", () => {
    render(<Workbench />);

    fireEvent.click(screen.getByRole("button", { name: "Tasks" }));
    expect(screen.getByText("Task page")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Project session" }));
    expect(screen.queryByText("Task page")).not.toBeInTheDocument();
    expect(screen.getByText("Editor")).toBeInTheDocument();
  });

  it("hydrates a Task managed worktree before opening its session", async () => {
    render(<Workbench />);

    fireEvent.click(screen.getByRole("button", { name: "Tasks" }));
    fireEvent.click(screen.getByRole("button", { name: "Task session" }));

    await waitFor(() =>
      expect(projectsApi.selectWorktree).toHaveBeenCalledWith("task-worktree"),
    );
    await waitFor(() =>
      expect(useProjectsStore.getState().activeWorktreeId).toBe(
        "task-worktree",
      ),
    );
    expect(
      useProjectsStore
        .getState()
        .projects[0]?.worktrees.some(({ id }) => id === "task-worktree"),
    ).toBe(true);
    expect(screen.queryByText("Task page")).not.toBeInTheDocument();
    expect(screen.getByText("Editor")).toBeInTheDocument();
    expect(useEditorStore.getState().views["task-worktree"]).toMatchObject({
      activeTabId: "chat:task-worktree:task-session",
      tabs: [
        expect.objectContaining({
          type: "chat",
          worktreeId: "task-worktree",
          sessionId: "task-session",
        }),
      ],
    });
  });

  it("ignores a stale Task session selection after another worktree opens", async () => {
    const selection =
      deferred<Awaited<ReturnType<typeof projectsApi.selectWorktree>>>();
    vi.mocked(projectsApi.selectWorktree).mockReturnValueOnce(
      selection.promise,
    );
    useProjectsStore.setState((state) => ({
      projects: state.projects.map((project) => ({
        ...project,
        worktrees: [
          ...project.worktrees,
          {
            id: "w2",
            projectId: "p1",
            name: "feature",
            path: "/repo-feature",
            branch: "feature",
            baseRef: "origin/main",
            kind: "managed" as const,
            lastOpenedAt: 2,
          },
        ],
      })),
    }));
    render(<Workbench />);

    fireEvent.click(screen.getByRole("button", { name: "Tasks" }));
    fireEvent.click(screen.getByRole("button", { name: "Task session" }));
    await act(async () => {
      useProjectsStore.getState().selectWorktree("w2");
      selection.resolve({
        id: "task-worktree",
        projectId: "p1",
        name: "task-fix",
        path: "/task-fix",
        branch: "task-fix",
        baseRef: "origin/main",
        kind: "managed",
        lastOpenedAt: 2,
      });
      await selection.promise;
    });

    expect(useProjectsStore.getState().activeWorktreeId).toBe("w2");
    expect(useEditorStore.getState().views["task-worktree"]).toBeUndefined();
    expect(screen.getByText("Task page")).toBeInTheDocument();
  });

  it("keeps Tasks open when a Task worktree cannot be selected", async () => {
    vi.mocked(projectsApi.selectWorktree).mockRejectedValueOnce(
      new Error("Worktree missing"),
    );
    render(<Workbench />);

    fireEvent.click(screen.getByRole("button", { name: "Tasks" }));
    fireEvent.click(screen.getByRole("button", { name: "Task session" }));

    await waitFor(() =>
      expect(useProjectsStore.getState().error?.message).toBe(
        "Worktree missing",
      ),
    );
    expect(screen.getByText("Task page")).toBeInTheDocument();
    expect(useEditorStore.getState().views["task-worktree"]).toBeUndefined();
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
    const reopen = screen.getByRole("button", {
      name: "Toggle projects panel",
    });
    expect(reopen).toHaveClass("project-panel-reopen");
    fireEvent.click(reopen);
    expect(screen.getByText("Projects")).toBeInTheDocument();
  });
});
