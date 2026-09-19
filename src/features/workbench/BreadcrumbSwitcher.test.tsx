import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectSummary, WorktreeSummary } from "../../bindings";
import { setLanguage } from "../../i18n";
import { projectsApi } from "../projects/projectsApi";
import { useProjectsStore } from "../projects/projectsStore";
import { BreadcrumbSwitcher } from "./BreadcrumbSwitcher";

vi.mock("../projects/projectsApi", () => ({
  projectsApi: {
    selectWorktree: vi.fn(),
  },
}));

const mainWorktree: WorktreeSummary = {
  id: "w-main",
  projectId: "p-one",
  name: "main tree",
  path: "/one",
  branch: "main",
  baseRef: "origin/main",
  kind: "main",
  lastOpenedAt: 1,
};
const featureWorktree: WorktreeSummary = {
  ...mainWorktree,
  id: "w-feature",
  name: "feature tree",
  path: "/one-feature",
  branch: "feature/one",
  kind: "managed",
};
const fallbackWorktree: WorktreeSummary = {
  ...mainWorktree,
  id: "w-fallback",
  projectId: "p-two",
  name: "fallback tree",
  path: "/two",
  branch: "develop",
  kind: "external",
};
const projects: ProjectSummary[] = [
  {
    id: "p-one",
    name: "Alpha Project",
    path: "/one",
    lastOpenedAt: 1,
    worktrees: [featureWorktree, mainWorktree],
  },
  {
    id: "p-two",
    name: "Beta Project",
    path: "/two",
    lastOpenedAt: 1,
    worktrees: [fallbackWorktree],
  },
  {
    id: "p-empty",
    name: "Empty Project",
    path: "/empty",
    lastOpenedAt: 1,
    worktrees: [],
  },
];

function renderSwitcher() {
  return render(
    <BreadcrumbSwitcher
      activeProject={projects[0]}
      activeWorktree={mainWorktree}
      branch="live/main"
    />,
  );
}

beforeEach(() => {
  setLanguage("en");
  vi.clearAllMocks();
  useProjectsStore.setState({
    projects,
    activeWorktreeId: mainWorktree.id,
    loading: false,
    creatingProjectId: null,
    error: null,
  });
  vi.mocked(projectsApi.selectWorktree).mockResolvedValue(mainWorktree);
});

describe("BreadcrumbSwitcher", () => {
  it("renders two listbox triggers, a read-only branch, and filters project names case-insensitively", () => {
    renderSwitcher();

    expect(
      screen.getByRole("button", { name: "Project: Alpha Project" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("button", { name: "Worktree: main tree" }),
    ).toBeInTheDocument();
    const branch = screen.getByText("live/main");
    expect(branch).toHaveClass("breadcrumb-branch");
    expect(branch.tagName).toBe("SPAN");
    expect(branch).not.toHaveAttribute("aria-haspopup");

    fireEvent.click(
      screen.getByRole("button", { name: "Project: Alpha Project" }),
    );
    const search = screen.getByRole("combobox", { name: "Search projects" });
    expect(search).toHaveFocus();
    fireEvent.change(search, { target: { value: "  BETA  " } });

    expect(
      screen.getByRole("option", { name: /Beta Project/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Alpha Project/ }),
    ).not.toBeInTheDocument();
  });

  it("selects a project's main worktree, falls back to its first worktree, and disables empty projects", async () => {
    renderSwitcher();
    fireEvent.click(
      screen.getByRole("button", { name: "Project: Alpha Project" }),
    );

    expect(
      screen.getByRole("option", { name: /Alpha Project/ }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("option", { name: /Empty Project/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("option", { name: /Empty Project/ }),
    ).toHaveTextContent("Unavailable");

    fireEvent.click(screen.getByRole("option", { name: /Beta Project/ }));
    await waitFor(() =>
      expect(projectsApi.selectWorktree).toHaveBeenCalledWith("w-fallback"),
    );
    expect(useProjectsStore.getState().activeWorktreeId).toBe("w-fallback");
  });

  it("searches worktrees, shows their branches, and selects a worktree", async () => {
    renderSwitcher();
    fireEvent.click(
      screen.getByRole("button", { name: "Worktree: main tree" }),
    );

    const search = screen.getByRole("combobox", { name: "Search worktrees" });
    fireEvent.change(search, { target: { value: "feature" } });
    const option = screen.getByRole("option", {
      name: /feature tree.*feature\/one/,
    });
    fireEvent.click(option);

    await waitFor(() =>
      expect(projectsApi.selectWorktree).toHaveBeenCalledWith("w-feature"),
    );
    expect(useProjectsStore.getState().activeWorktreeId).toBe("w-feature");
  });

  it("keeps the popover open and current selection when worktree selection fails", async () => {
    vi.mocked(projectsApi.selectWorktree).mockRejectedValueOnce({
      code: "WORKTREE_SELECT_FAILED",
      message: "cannot select worktree",
    });
    renderSwitcher();
    fireEvent.click(
      screen.getByRole("button", { name: "Worktree: main tree" }),
    );
    fireEvent.click(screen.getByRole("option", { name: /feature tree/ }));

    await waitFor(() =>
      expect(useProjectsStore.getState().error).toMatchObject({
        code: "WORKTREE_SELECT_FAILED",
      }),
    );
    expect(useProjectsStore.getState().activeWorktreeId).toBe("w-main");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("keeps the pending selection visible and blocks closing until it settles", async () => {
    vi.mocked(projectsApi.selectWorktree).mockReturnValueOnce(
      new Promise(() => undefined),
    );
    renderSwitcher();
    const trigger = screen.getByRole("button", { name: "Worktree: main tree" });
    fireEvent.click(trigger);
    const search = screen.getByRole("combobox", { name: "Search worktrees" });
    fireEvent.keyDown(search, { key: "ArrowUp" });
    fireEvent.keyDown(search, { key: "Enter" });
    await waitFor(() =>
      expect(screen.getAllByText("Switching…")).toHaveLength(2),
    );

    fireEvent.keyDown(search, { key: "Escape" });
    fireEvent.pointerDown(document.body);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-disabled", "true");
  });

  it("supports ArrowDown, ArrowUp, Enter, Escape focus return, and captured outside pointerdown", async () => {
    renderSwitcher();
    const trigger = screen.getByRole("button", { name: "Worktree: main tree" });
    fireEvent.click(trigger);
    const search = screen.getByRole("combobox", { name: "Search worktrees" });

    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "ArrowUp" });
    fireEvent.keyDown(search, { key: "Enter" });
    await waitFor(() =>
      expect(projectsApi.selectWorktree).toHaveBeenCalledWith("w-feature"),
    );

    fireEvent.click(trigger);
    fireEvent.keyDown(
      screen.getByRole("combobox", { name: "Search worktrees" }),
      { key: "Escape" },
    );
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    const outside = document.createElement("button");
    outside.addEventListener("pointerdown", (event) => event.stopPropagation());
    document.body.append(outside);
    fireEvent.pointerDown(outside);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    outside.remove();
  });

  it("ignores a pending selection result after the active worktree changes externally", async () => {
    let resolveSelection!: (value: WorktreeSummary) => void;
    vi.mocked(projectsApi.selectWorktree).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSelection = resolve;
      }),
    );
    const { rerender } = renderSwitcher();
    fireEvent.click(
      screen.getByRole("button", { name: "Worktree: main tree" }),
    );
    fireEvent.click(screen.getByRole("option", { name: /feature tree/ }));
    await waitFor(() =>
      expect(projectsApi.selectWorktree).toHaveBeenCalledWith("w-feature"),
    );

    useProjectsStore.getState().selectWorktree("w-fallback");
    resolveSelection(featureWorktree);
    rerender(
      <BreadcrumbSwitcher
        activeProject={projects[1]}
        activeWorktree={fallbackWorktree}
        branch="develop"
      />,
    );

    await waitFor(() =>
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
    );
    expect(useProjectsStore.getState().activeWorktreeId).toBe("w-fallback");
  });

  it("closes an open popover when the active worktree changes externally", async () => {
    const { rerender } = renderSwitcher();
    fireEvent.click(
      screen.getByRole("button", { name: "Worktree: main tree" }),
    );

    rerender(
      <BreadcrumbSwitcher
        activeProject={projects[0]}
        activeWorktree={featureWorktree}
        branch="feature/one"
      />,
    );

    await waitFor(() =>
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
    );
  });
});
