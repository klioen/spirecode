import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorktreeSummary } from "../../bindings";
import { hostChatApi } from "../chat/hostChatApi";
import { chatRuntime } from "../chat/chatRuntime";
import { chatResourceId, useEditorStore } from "../editor/editorStore";
import { useTasksStore } from "../tasks/tasksStore";
import { ProjectRail } from "./ProjectRail";
import { projectsApi } from "./projectsApi";
import { useProjectsStore } from "./projectsStore";

vi.mock("../chat/hostChatApi", () => ({
  hostChatApi: { list: vi.fn(), rename: vi.fn(), delete: vi.fn() },
}));

vi.mock("./projectsApi", () => ({
  projectsApi: {
    openDialog: vi.fn(),
    selectWorktree: vi.fn().mockResolvedValue(undefined),
    reveal: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    createGroup: vi.fn(),
    renameGroup: vi.fn(),
    deleteGroup: vi.fn(),
    setProjectGroup: vi.fn(),
    moveProject: vi.fn(),
    revealWorktree: vi.fn().mockResolvedValue(undefined),
    listOriginBranches: vi.fn(),
    renameWorktree: vi.fn(),
    inspectDeleteWorktree: vi.fn(),
    deleteWorktree: vi.fn(),
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    "spirecode.projects.expanded-groups.v1",
    JSON.stringify(["__ungrouped__"]),
  );
  vi.clearAllMocks();
  chatRuntime.remove("active-main");
  chatRuntime.remove("active-feature");
  chatRuntime.remove("active-directory");
  chatRuntime.remove("main-chat");
  vi.mocked(hostChatApi.list).mockReset();
  vi.mocked(hostChatApi.rename).mockReset();
  vi.mocked(hostChatApi.delete).mockReset();
  useEditorStore.setState({ views: {} });
  useTasksStore.setState({
    items: [],
    incompleteCount: 0,
    activeCount: 0,
    selectedTaskId: null,
  });
  useProjectsStore.setState({
    groups: [],
    projects: [
      {
        id: "project-1",
        groupId: null,
        name: "spirecode-client",
        path: "/repo",
        kind: "git",
        lastOpenedAt: 1,
        worktrees: [
          {
            id: "main",
            projectId: "project-1",
            name: "main",
            path: "/repo",
            branch: "main",
            baseRef: "origin/main",
            kind: "main",
            lastOpenedAt: 1,
          },
          {
            id: "feature",
            projectId: "project-1",
            name: "feature",
            path: "/worktrees/feature",
            branch: "feature",
            baseRef: "origin/main",
            kind: "managed",
            lastOpenedAt: 2,
          },
        ],
      },
    ],
    activeWorktreeId: "main",
    loading: false,
    creatingProjectId: null,
    error: null,
  });
});

describe("ProjectRail", () => {
  it("places the global Task entry above Projects and outside project sorting", () => {
    render(<ProjectRail />);

    const tasks = screen.getByRole("button", { name: /Tasks/i });
    const projects = screen.getByText("PROJECTS");
    expect(
      tasks.compareDocumentPosition(projects) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(tasks.closest("[data-project-drag-handle]")).toBeNull();
  });

  it("opens an existing folder", async () => {
    vi.mocked(projectsApi.openDialog).mockResolvedValueOnce(null);
    render(<ProjectRail />);

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }));

    await vi.waitFor(() => expect(projectsApi.openDialog).toHaveBeenCalled());
    expect(
      screen.queryByRole("button", { name: "New project" }),
    ).not.toBeInTheDocument();
  });

  it("renders the shared SpireCode brand mark and keyboard drag handle", () => {
    render(<ProjectRail />);
    expect(screen.getByTestId("spirecode-mark")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Move spirecode-client" }),
    ).toBeInTheDocument();
  });

  it("cancels a keyboard drag without moving the project", () => {
    render(<ProjectRail />);
    const handle = screen.getByRole("button", {
      name: "Move spirecode-client",
    });
    handle.focus();
    fireEvent.keyDown(handle, { key: " ", code: "Space" });
    fireEvent.keyDown(handle, { key: "Escape", code: "Escape" });

    expect(projectsApi.moveProject).not.toHaveBeenCalled();
    expect(handle).toHaveFocus();
  });

  it("places panel and Settings controls at the top and bottom edges", () => {
    const toggleProjects = vi.fn();
    const openSettings = vi.fn();
    render(
      <ProjectRail
        onToggleProjects={toggleProjects}
        onOpenSettings={openSettings}
      />,
    );

    const rail = screen.getByRole("complementary", { name: "Projects" });
    const toggle = screen.getByRole("button", {
      name: "Toggle projects panel",
    });
    const settings = screen.getByRole("button", { name: "Settings" });
    expect(toggle.closest(".brand")).toBeTruthy();
    expect(settings.closest(".project-rail-footer")).toBeTruthy();
    expect(rail.compareDocumentPosition(settings)).toBe(
      Node.DOCUMENT_POSITION_CONTAINED_BY | Node.DOCUMENT_POSITION_FOLLOWING,
    );

    fireEvent.click(toggle);
    fireEvent.click(settings);
    expect(toggleProjects).toHaveBeenCalledOnce();
    expect(openSettings).toHaveBeenCalledOnce();
  });

  it("shows active Pi session loading on the owning project and worktree only", async () => {
    chatRuntime.ensure("active-feature", "feature", "streaming");
    render(<ProjectRail />);

    expect(
      screen.getByRole("button", { name: "Expand spirecode-client" }),
    ).toContainElement(screen.getAllByLabelText("Pi session active")[1]);

    fireEvent.click(
      screen.getByRole("button", { name: "Expand spirecode-client" }),
    );
    expect(screen.getByRole("button", { name: "feature" })).toContainElement(
      screen.getAllByLabelText("Pi session active")[2],
    );
    expect(
      screen
        .getByRole("button", { name: "main" })
        .querySelector(".project-session-spinner"),
    ).toBeNull();

    chatRuntime.setStatus("active-feature", "idle");
    await vi.waitFor(() =>
      expect(
        screen.queryByLabelText("Pi session active"),
      ).not.toBeInTheDocument(),
    );
  });

  it("collapses projects by default and toggles their worktrees", () => {
    render(<ProjectRail />);
    const toggle = screen.getByRole("button", {
      name: "Expand spirecode-client",
    });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: "main" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "feature" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Create worktree for spirecode-client",
      }),
    ).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(
      screen.getByRole("button", { name: "Collapse spirecode-client" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "main" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: "feature" })).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Collapse spirecode-client" }),
    );
    expect(
      screen.queryByRole("button", { name: "main" }),
    ).not.toBeInTheDocument();
  });

  it("expands a directory project and opens Pi sessions by title", async () => {
    useProjectsStore.setState({
      projects: [
        {
          id: "directory-1",
          groupId: null,
          name: "notes",
          path: "/notes",
          kind: "directory",
          lastOpenedAt: 1,
          worktrees: [
            {
              id: "directory-main",
              projectId: "directory-1",
              name: "notes",
              path: "/notes",
              branch: "",
              baseRef: "",
              kind: "main",
              lastOpenedAt: 1,
            },
          ],
        },
      ],
      activeWorktreeId: null,
    });
    vi.mocked(hostChatApi.list).mockResolvedValue([
      {
        sessionId: "older",
        worktreeId: "directory-main",
        title: "Older session",
        updatedAt: 10,
      },
      {
        sessionId: "latest",
        worktreeId: "directory-main",
        title: "Latest session",
        updatedAt: 20,
      },
    ]);

    chatRuntime.ensure("active-directory", "directory-main", "streaming");
    const onOpenSession = vi.fn();
    render(<ProjectRail onOpenSession={onOpenSession} />);

    expect(screen.getAllByLabelText("Pi session active")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Expand notes" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: "Create worktree for notes" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand notes" }));

    await vi.waitFor(() =>
      expect(hostChatApi.list).toHaveBeenCalledWith("directory-main"),
    );
    expect(projectsApi.selectWorktree).toHaveBeenCalledWith("directory-main");
    const latestButton = await screen.findByRole("button", {
      name: "Latest session",
    });
    const olderButton = screen.getByRole("button", { name: "Older session" });
    expect(latestButton.compareDocumentPosition(olderButton)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    const olderSelection = deferred<WorktreeSummary>();
    const latestSelection = deferred<WorktreeSummary>();
    const selectedWorkspace =
      useProjectsStore.getState().projects[0]!.worktrees[0]!;
    vi.mocked(projectsApi.selectWorktree)
      .mockReset()
      .mockImplementationOnce(() => olderSelection.promise)
      .mockImplementationOnce(() => latestSelection.promise);
    fireEvent.click(screen.getByRole("button", { name: "Older session" }));
    fireEvent.click(screen.getByRole("button", { name: "Latest session" }));

    latestSelection.resolve(selectedWorkspace);
    await vi.waitFor(() =>
      expect(
        useEditorStore.getState().views["directory-main"]?.activeTabId,
      ).toBe(chatResourceId("directory-main", "latest")),
    );
    olderSelection.resolve(selectedWorkspace);
    await vi.waitFor(() =>
      expect(
        useEditorStore.getState().views["directory-main"]?.activeTabId,
      ).toBe(chatResourceId("directory-main", "latest")),
    );
    expect(useProjectsStore.getState().activeWorktreeId).toBe("directory-main");
    expect(onOpenSession).toHaveBeenCalledTimes(1);
  });

  it("expands Git worktree sessions and quickly moves a session to Trash", async () => {
    vi.mocked(hostChatApi.list).mockResolvedValue([
      {
        sessionId: "main-chat",
        worktreeId: "main",
        title: "Main chat",
        updatedAt: 20,
      },
    ]);
    const deletion = deferred<void>();
    vi.mocked(hostChatApi.delete).mockImplementation(() => deletion.promise);
    useEditorStore.getState().openChat("main", "main-chat", "Main chat");
    chatRuntime.ensure("main-chat", "main", "idle");
    render(<ProjectRail />);

    fireEvent.click(
      screen.getByRole("button", { name: "Expand spirecode-client" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Expand Pi sessions for main" }),
    );
    expect(await screen.findByText("Main chat")).toBeInTheDocument();

    const sessionButton = screen.getByRole("button", { name: "Main chat" });
    expect(
      screen.queryByRole("menuitem", { name: "Delete Main chat" }),
    ).not.toBeInTheDocument();
    fireEvent.contextMenu(sessionButton);
    const deleteMenuItem = screen.getByRole("menuitem", {
      name: "Delete Main chat",
    });
    fireEvent.click(deleteMenuItem);
    fireEvent.contextMenu(sessionButton);

    expect(hostChatApi.delete).toHaveBeenCalledOnce();
    expect(hostChatApi.delete).toHaveBeenCalledWith("main", "main-chat");
    deletion.resolve();
    await vi.waitFor(() =>
      expect(screen.queryByText("Main chat")).not.toBeInTheDocument(),
    );
    expect(useEditorStore.getState().views.main?.tabs).toEqual([]);
    expect(() => chatRuntime.getSnapshot("main-chat")).toThrow();
  });

  it("renames a Git session from its context menu and updates an open tab", async () => {
    vi.mocked(hostChatApi.list).mockResolvedValue([
      {
        sessionId: "main-chat",
        worktreeId: "main",
        title: "Main chat",
        updatedAt: 20,
      },
    ]);
    vi.mocked(hostChatApi.rename).mockResolvedValue({
      sessionId: "main-chat",
      worktreeId: "main",
      title: "Renamed chat",
      createdAt: 10,
      updatedAt: 30,
    });
    useEditorStore.getState().openChat("main", "main-chat", "Main chat");
    render(<ProjectRail />);

    fireEvent.click(
      screen.getByRole("button", { name: "Expand spirecode-client" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Expand Pi sessions for main" }),
    );
    const sessionButton = await screen.findByRole("button", {
      name: "Main chat",
    });
    fireEvent.contextMenu(sessionButton);
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename Main chat" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Session name" }), {
      target: { value: "Renamed chat" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));

    expect(await screen.findByText("Renamed chat")).toBeVisible();
    expect(hostChatApi.rename).toHaveBeenCalledWith(
      "main",
      "main-chat",
      "Renamed chat",
    );
    expect(useEditorStore.getState().views.main.tabs[0]).toMatchObject({
      type: "chat",
      title: "Renamed chat",
    });
  });

  it("keeps a Git session visible when quick deletion fails", async () => {
    vi.mocked(hostChatApi.list).mockResolvedValue([
      {
        sessionId: "main-chat",
        worktreeId: "main",
        title: "Main chat",
      },
    ]);
    vi.mocked(hostChatApi.delete).mockRejectedValue(new Error("delete failed"));
    render(<ProjectRail />);

    fireEvent.click(
      screen.getByRole("button", { name: "Expand spirecode-client" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Expand Pi sessions for main" }),
    );
    const sessionButton = await screen.findByRole("button", {
      name: "Main chat",
    });
    fireEvent.contextMenu(sessionButton);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete Main chat" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("delete failed");
    expect(screen.getByText("Main chat")).toBeInTheDocument();
    await vi.waitFor(() => expect(sessionButton).toHaveFocus());
  });

  it("shows the directory session empty state", async () => {
    const project = useProjectsStore.getState().projects[0]!;
    useProjectsStore.setState({
      projects: [
        {
          ...project,
          kind: "directory",
          worktrees: [{ ...project.worktrees[0]!, branch: "", baseRef: "" }],
        },
      ],
    });
    vi.mocked(hostChatApi.list).mockResolvedValue([]);

    render(<ProjectRail />);
    fireEvent.click(
      screen.getByRole("button", { name: "Expand spirecode-client" }),
    );

    expect(await screen.findByText("No Pi sessions")).toBeInTheDocument();
  });

  it("shows a directory session loading failure without hiding the project", async () => {
    const project = useProjectsStore.getState().projects[0]!;
    useProjectsStore.setState({
      projects: [
        {
          ...project,
          kind: "directory",
          worktrees: [{ ...project.worktrees[0]!, branch: "", baseRef: "" }],
        },
      ],
    });
    vi.mocked(hostChatApi.list).mockRejectedValue(new Error("list failed"));

    render(<ProjectRail />);
    fireEvent.click(
      screen.getByRole("button", { name: "Expand spirecode-client" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("list failed");
    expect(screen.getByText("spirecode-client")).toBeInTheDocument();
  });

  it("defaults groups to collapsed and restores expansion across mounts", () => {
    const grouped = useProjectsStore.getState().projects[0]!;
    useProjectsStore.setState({
      groups: [{ id: "group-1", name: "Client" }],
      projects: [
        { ...grouped, groupId: "group-1" },
        {
          ...grouped,
          id: "project-2",
          groupId: null,
          name: "playground",
          worktrees: grouped.worktrees.map((worktree) => ({
            ...worktree,
            id: `other-${worktree.id}`,
            projectId: "project-2",
          })),
        },
      ],
    });

    localStorage.clear();
    const firstMount = render(<ProjectRail />);

    expect(
      screen.getByRole("button", { name: "Expand group Client" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("button", { name: "Expand group Ungrouped" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("spirecode-client")).not.toBeInTheDocument();
    expect(screen.queryByText("playground")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Expand group Client" }),
    );
    expect(screen.getByText("spirecode-client")).toBeInTheDocument();
    expect(screen.queryByText("playground")).not.toBeInTheDocument();

    firstMount.unmount();
    const secondMount = render(<ProjectRail />);
    expect(
      screen.getByRole("button", { name: "Collapse group Client" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("spirecode-client")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Collapse group Client" }),
    );
    secondMount.unmount();
    render(<ProjectRail />);
    expect(
      screen.getByRole("button", { name: "Expand group Client" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("spirecode-client")).not.toBeInTheDocument();
  });

  it("moves a project to a group using the authoritative returned catalog", async () => {
    const project = useProjectsStore.getState().projects[0]!;
    useProjectsStore.setState({ groups: [{ id: "group-1", name: "Client" }] });
    vi.mocked(projectsApi.moveProject).mockResolvedValue({
      version: 5,
      groups: [{ id: "group-1", name: "Client" }],
      projects: [{ ...project, groupId: "group-1" }],
      projectOrder: [project.id],
      activeWorktreeId: "main",
    });
    render(<ProjectRail />);
    fireEvent.click(
      screen.getByRole("button", { name: "Expand group Client" }),
    );

    const manage = screen.getByRole("button", {
      name: "Manage spirecode-client",
    });
    manage.focus();
    fireEvent.click(manage);
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to group…" }));
    fireEvent.change(screen.getByLabelText("Group"), {
      target: { value: "group-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Move to group…" }));

    await vi.waitFor(() =>
      expect(projectsApi.moveProject).toHaveBeenCalledWith(
        "project-1",
        "group-1",
        null,
      ),
    );
    expect(useProjectsStore.getState().projects[0]?.groupId).toBe("group-1");
    await vi.waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Manage spirecode-client" }),
      ).toHaveFocus(),
    );
  });

  it("manages a project with reveal and close actions", async () => {
    render(<ProjectRail />);
    fireEvent.click(
      screen.getByRole("button", { name: "Manage spirecode-client" }),
    );
    expect(
      screen.getByRole("menuitem", { name: "Reveal in Finder" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "Reveal in Finder" }));
    await vi.waitFor(() =>
      expect(projectsApi.reveal).toHaveBeenCalledWith("project-1"),
    );
    await vi.waitFor(() =>
      expect(
        screen.queryByRole("menuitem", { name: "Reveal in Finder" }),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Manage spirecode-client" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Close project" }));
    await vi.waitFor(() =>
      expect(projectsApi.close).toHaveBeenCalledWith("project-1"),
    );
    expect(screen.queryByText("spirecode-client")).not.toBeInTheDocument();
    expect(useProjectsStore.getState().activeWorktreeId).toBeNull();
  });

  it("keeps a project visible when close fails", async () => {
    vi.mocked(projectsApi.close).mockRejectedValueOnce({
      code: "PROJECT_FAILED",
      message: "close failed",
    });
    render(<ProjectRail />);
    fireEvent.click(
      screen.getByRole("button", { name: "Manage spirecode-client" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Close project" }));
    await vi.waitFor(() =>
      expect(useProjectsStore.getState().error?.message).toBe("close failed"),
    );
    expect(screen.getByText("spirecode-client")).toBeInTheDocument();
  });

  it("only exposes managed worktree lifecycle actions after expansion", () => {
    render(<ProjectRail />);
    fireEvent.click(
      screen.getByRole("button", { name: "Expand spirecode-client" }),
    );
    expect(
      screen.queryByRole("button", { name: "Manage main" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Manage feature" }));
    expect(
      screen.getByRole("menuitem", { name: "Rename" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Delete" }),
    ).toBeInTheDocument();
  });

  it("closes an open worktree menu when clicking outside it", () => {
    render(<ProjectRail />);
    fireEvent.click(
      screen.getByRole("button", { name: "Expand spirecode-client" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Manage feature" }));

    fireEvent.pointerDown(screen.getByText("PROJECTS"));

    expect(
      screen.queryByRole("menuitem", { name: "Rename" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Delete" }),
    ).not.toBeInTheDocument();
  });
});
