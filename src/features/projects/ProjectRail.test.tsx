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
    projects: [
      {
        id: "project-1",
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

  it("shows active Pi session loading on the owning project and worktree only", async () => {
    chatRuntime.ensure("active-feature", "feature", "streaming");
    render(<ProjectRail />);

    expect(
      screen.getByRole("button", { name: "Expand spirecode-client" }),
    ).toContainElement(screen.getByLabelText("Pi session active"));

    fireEvent.click(
      screen.getByRole("button", { name: "Expand spirecode-client" }),
    );
    expect(screen.getByRole("button", { name: "feature" })).toContainElement(
      screen.getAllByLabelText("Pi session active")[1],
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

    expect(screen.getByLabelText("Pi session active")).toBeInTheDocument();
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
