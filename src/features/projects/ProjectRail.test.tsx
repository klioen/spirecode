import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { chatRuntime } from "../chat/chatRuntime";
import { ProjectRail } from "./ProjectRail";
import { projectsApi } from "./projectsApi";
import { useProjectsStore } from "./projectsStore";

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
    revealWorktree: vi.fn().mockResolvedValue(undefined),
    listOriginBranches: vi.fn(),
    renameWorktree: vi.fn(),
    inspectDeleteWorktree: vi.fn(),
    deleteWorktree: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  chatRuntime.remove("active-main");
  chatRuntime.remove("active-feature");
  chatRuntime.remove("active-directory");
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
  it("opens an existing folder", async () => {
    vi.mocked(projectsApi.openDialog).mockResolvedValueOnce(null);
    render(<ProjectRail />);

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }));

    await vi.waitFor(() => expect(projectsApi.openDialog).toHaveBeenCalled());
    expect(
      screen.queryByRole("button", { name: "New project" }),
    ).not.toBeInTheDocument();
  });

  it("renders the shared SpireCode brand mark", () => {
    render(<ProjectRail />);
    expect(screen.getByTestId("spirecode-mark")).toBeInTheDocument();
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

  it("selects a directory project's primary workspace without exposing worktree controls", async () => {
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

    chatRuntime.ensure("active-directory", "directory-main", "streaming");
    render(<ProjectRail />);

    expect(screen.getAllByLabelText("Pi session active")).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "Expand notes" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create worktree for notes" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open notes" }));

    await vi.waitFor(() =>
      expect(projectsApi.selectWorktree).toHaveBeenCalledWith("directory-main"),
    );
    expect(useProjectsStore.getState().activeWorktreeId).toBe("directory-main");
  });

  it("groups projects, collapses groups, and keeps ungrouped projects visible", () => {
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

    render(<ProjectRail />);

    expect(
      screen.getByRole("button", { name: "Collapse group Client" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Collapse group Ungrouped" }),
    ).toBeInTheDocument();
    expect(screen.getByText("spirecode-client")).toBeInTheDocument();
    expect(screen.getByText("playground")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Collapse group Client" }),
    );
    expect(screen.queryByText("spirecode-client")).not.toBeInTheDocument();
    expect(screen.getByText("playground")).toBeInTheDocument();
  });

  it("moves a project to a group using the authoritative returned catalog", async () => {
    const project = useProjectsStore.getState().projects[0]!;
    useProjectsStore.setState({ groups: [{ id: "group-1", name: "Client" }] });
    vi.mocked(projectsApi.setProjectGroup).mockResolvedValue({
      version: 4,
      groups: [{ id: "group-1", name: "Client" }],
      projects: [{ ...project, groupId: "group-1" }],
      activeWorktreeId: "main",
    });
    render(<ProjectRail />);

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
      expect(projectsApi.setProjectGroup).toHaveBeenCalledWith(
        "project-1",
        "group-1",
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
