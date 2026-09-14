import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectRail } from "./ProjectRail";
import { useProjectsStore } from "./projectsStore";

vi.mock("./projectsApi", () => ({
  projectsApi: {
    openDialog: vi.fn(),
    selectWorktree: vi.fn().mockResolvedValue(undefined),
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
  it("renders nested checkout rows and a project-scoped create button", () => {
    render(<ProjectRail />);
    expect(screen.getByText("spirecode-client")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "main" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: "feature" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Create worktree for spirecode-client",
      }),
    ).toBeInTheDocument();
  });

  it("only exposes managed worktree lifecycle actions", () => {
    render(<ProjectRail />);
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
});
