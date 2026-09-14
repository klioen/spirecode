import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorktreeSummary } from "../../bindings";
import { projectsApi } from "./projectsApi";
import { useProjectsStore } from "./projectsStore";
import { DeleteWorktreeDialog, NewWorktreeDialog } from "./WorktreeDialog";

vi.mock("./projectsApi", () => ({
  projectsApi: {
    listOriginBranches: vi.fn(),
    createWorktree: vi.fn(),
    inspectDeleteWorktree: vi.fn(),
    deleteWorktree: vi.fn(),
  },
}));

const managed: WorktreeSummary = {
  id: "feature-id",
  projectId: "project-id",
  name: "feature",
  path: "/worktrees/feature",
  branch: "feature",
  baseRef: "origin/main",
  kind: "managed",
  lastOpenedAt: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  useProjectsStore.setState({
    projects: [
      {
        id: "project-id",
        name: "Project",
        path: "/repo",
        lastOpenedAt: 1,
        worktrees: [managed],
      },
    ],
    activeWorktreeId: managed.id,
    loading: false,
    creatingProjectId: null,
    error: null,
  });
});

describe("worktree dialogs", () => {
  it("loads origin branches and uses the backend-provided default name", async () => {
    vi.mocked(projectsApi.listOriginBranches).mockResolvedValue({
      originConfigured: true,
      branches: [
        { ref: "origin/main", name: "main" },
        { ref: "origin/release", name: "release" },
      ],
      defaultRef: "origin/release",
      nextName: "worktree3",
    });
    vi.mocked(projectsApi.createWorktree).mockResolvedValue({
      ...managed,
      id: "created",
      name: "worktree3",
      branch: "worktree3",
      baseRef: "origin/release",
    });

    render(
      <NewWorktreeDialog
        projectId="project-id"
        projectName="Project"
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByDisplayValue("worktree3")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Base branch" })).toHaveValue(
      "origin/release",
    );
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(projectsApi.createWorktree).toHaveBeenCalledWith(
        "project-id",
        "worktree3",
        "origin/release",
      ),
    );
  });

  it("explains when origin is not configured and can refresh", async () => {
    vi.mocked(projectsApi.listOriginBranches)
      .mockResolvedValueOnce({
        originConfigured: false,
        branches: [],
        defaultRef: null,
        nextName: "worktree1",
      })
      .mockResolvedValueOnce({
        originConfigured: true,
        branches: [{ ref: "origin/main", name: "main" }],
        defaultRef: "origin/main",
        nextName: "worktree1",
      });

    render(
      <NewWorktreeDialog
        projectId="project-id"
        projectName="Project"
        onClose={vi.fn()}
      />,
    );

    expect(
      await screen.findByText(/No origin remote configured/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(
      await screen.findByRole("option", { name: "main" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Base branch" })).toHaveValue(
      "origin/main",
    );
  });

  it("explains when origin has no fetched branches", async () => {
    vi.mocked(projectsApi.listOriginBranches).mockResolvedValue({
      originConfigured: true,
      branches: [],
      defaultRef: null,
      nextName: "worktree1",
    });

    render(
      <NewWorktreeDialog
        projectId="project-id"
        projectName="Project"
        onClose={vi.fn()}
      />,
    );

    expect(
      await screen.findByText(/No fetched origin branches/),
    ).toBeInTheDocument();
  });

  it("requires force deletion when inspection reports dirty or busy state", async () => {
    vi.mocked(projectsApi.inspectDeleteWorktree).mockResolvedValue({
      dirty: true,
      terminalCount: 2,
      branch: "feature",
    });
    vi.mocked(projectsApi.deleteWorktree).mockResolvedValue({ ok: true });

    render(<DeleteWorktreeDialog worktree={managed} onClose={vi.fn()} />);

    expect(
      await screen.findByText(/Uncommitted changes will be lost/),
    ).toBeInTheDocument();
    expect(screen.getByText(/2 running terminal/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Force delete" }));
    await waitFor(() =>
      expect(projectsApi.deleteWorktree).toHaveBeenCalledWith(
        "feature-id",
        true,
      ),
    );
  });
});
