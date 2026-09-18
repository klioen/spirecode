import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  useProjectsStore.setState({
    projects: [
      {
        id: "project-1",
        name: "spirecode-client",
        path: "/repo",
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

  it("manages a project with reveal, copy path, and close actions", async () => {
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
