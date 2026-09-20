import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitStatus } from "../../bindings";
import { useEditorStore } from "../editor/editorStore";
import { ChangesPanel } from "./ChangesPanel";
import { refreshChanges } from "./changesRefresh";
import { useChangesStore } from "./changesStore";

vi.mock("./changesRefresh", () => ({
  refreshChanges: vi.fn(),
}));

const snapshot: GitStatus = {
  branch: "main",
  upstream: null,
  ahead: 0,
  behind: 0,
  changes: [
    {
      path: "src/features/changes/ChangesPanel.tsx",
      status: ".M",
      staged: false,
      unstaged: true,
      untracked: false,
    },
    {
      path: "src/main.tsx",
      status: ".M",
      staged: false,
      unstaged: true,
      untracked: false,
    },
    {
      path: "README.md",
      status: "??",
      staged: false,
      unstaged: true,
      untracked: true,
    },
  ],
};

beforeEach(() => {
  vi.mocked(refreshChanges).mockReset();
  useChangesStore.setState({
    byWorktree: {
      w1: {
        snapshot,
        loading: false,
        staleError: null,
        generation: 1,
      },
    },
    mode: "list",
    diffMode: "unified",
  });
  useEditorStore.setState({ views: {}, navigationGeneration: 0 });
});

describe("ChangesPanel view modes", () => {
  it("defaults to the flat list mode without a manual refresh control", () => {
    render(<ChangesPanel worktreeId="w1" />);

    expect(refreshChanges).toHaveBeenCalledWith("w1");
    expect(
      screen.queryByRole("button", { name: "Refresh changes" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Tree view" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      screen.getByRole("treeitem", {
        name: "src/features/changes/ChangesPanel.tsx M",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "src" })).toBeNull();
  });

  it("shows grouped paths as an expanded, collapsible tree", () => {
    render(<ChangesPanel worktreeId="w1" />);
    fireEvent.click(screen.getByRole("button", { name: "Tree view" }));

    const src = screen.getByRole("treeitem", { name: "src" });
    expect(src).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("treeitem", { name: "features" })).toBeVisible();
    expect(
      screen.getByRole("treeitem", { name: "ChangesPanel.tsx M" }),
    ).toBeVisible();
    expect(screen.getByRole("treeitem", { name: "main.tsx M" })).toBeVisible();

    expect(src).toHaveStyle({ paddingLeft: "12px" });
    expect(screen.getByRole("treeitem", { name: "features" })).toHaveStyle({
      paddingLeft: "20px",
    });
    const changedFile = screen.getByRole("treeitem", {
      name: "ChangesPanel.tsx M",
    });
    expect(changedFile).toHaveStyle({ paddingLeft: "36px" });
    expect(changedFile.querySelector(".tree-indent")).toBeNull();

    fireEvent.click(src);

    expect(screen.queryByRole("treeitem", { name: "features" })).toBeNull();
    expect(screen.queryByRole("treeitem", { name: "main.tsx M" })).toBeNull();
    expect(screen.getByRole("treeitem", { name: "README.md U" })).toBeVisible();
  });

  it("adds tree semantics and supports the complete keyboard matrix", () => {
    render(<ChangesPanel worktreeId="w1" />);
    fireEvent.click(screen.getByRole("button", { name: "Tree view" }));

    expect(screen.getByRole("tree")).toBeInTheDocument();
    const src = screen.getByRole("treeitem", { name: "src" });
    const features = screen.getByRole("treeitem", { name: "features" });
    const changedFile = screen.getByRole("treeitem", {
      name: "ChangesPanel.tsx M",
    });
    expect(src).toHaveAttribute("aria-level", "1");
    expect(features).toHaveAttribute("aria-level", "2");
    expect(changedFile).toHaveAttribute("aria-level", "4");
    expect(src).toHaveAttribute("tabindex", "0");
    expect(features).toHaveAttribute("tabindex", "-1");

    src.focus();
    fireEvent.keyDown(src, { key: "ArrowDown" });
    expect(features).toHaveFocus();
    fireEvent.keyDown(features, { key: "ArrowUp" });
    expect(src).toHaveFocus();
    fireEvent.keyDown(src, { key: "End" });
    expect(screen.getByRole("treeitem", { name: "README.md U" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(src).toHaveFocus();
    fireEvent.keyDown(src, { key: "ArrowRight" });
    expect(features).toHaveFocus();
    fireEvent.keyDown(features, { key: "ArrowLeft" });
    expect(features).toHaveAttribute("aria-expanded", "false");
    fireEvent.keyDown(features, { key: "ArrowLeft" });
    expect(src).toHaveFocus();
    fireEvent.keyDown(src, { key: "ArrowLeft" });
    expect(src).toHaveAttribute("aria-expanded", "false");
    fireEvent.keyDown(src, { key: "ArrowRight" });
    expect(src).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(src, { key: " " });
    expect(src).toHaveAttribute("aria-expanded", "false");
    fireEvent.keyDown(src, { key: "Enter" });
    expect(src).toHaveAttribute("aria-expanded", "true");

    const file = screen.getByRole("treeitem", { name: "main.tsx M" });
    fireEvent.keyDown(file, { key: "Enter" });
    expect(useEditorStore.getState().views.w1.activeTabId).toBe(
      "diff:w1:unstaged:src/main.tsx",
    );
  });

  it("opens the original path with the group scope from tree mode", () => {
    render(<ChangesPanel worktreeId="w1" />);
    fireEvent.click(screen.getByRole("button", { name: "Tree view" }));
    fireEvent.click(
      screen.getByRole("treeitem", { name: "ChangesPanel.tsx M" }),
    );

    const view = useEditorStore.getState().views.w1;
    expect(view.activeTabId).toBe(
      "diff:w1:unstaged:src/features/changes/ChangesPanel.tsx",
    );
    expect(view.tabs[0]).toMatchObject({
      relativePath: "src/features/changes/ChangesPanel.tsx",
      scope: "unstaged",
      preview: true,
    });
  });

  it("keeps status groups separate in tree mode", () => {
    render(<ChangesPanel worktreeId="w1" />);
    fireEvent.click(screen.getByRole("button", { name: "Tree view" }));

    const groups = screen.getAllByRole("region");
    expect(within(groups[0]).getByText("CHANGES")).toBeInTheDocument();
    expect(within(groups[1]).getByText("UNTRACKED")).toBeInTheDocument();
  });
});
