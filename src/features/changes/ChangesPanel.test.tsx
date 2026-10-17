import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitStatus } from "../../bindings";
import { useEditorStore } from "../editor/editorStore";
import { ChangesPanel } from "./ChangesPanel";
import { commitChanges, discardChanges, stageChanges } from "./changesActions";
import { refreshChanges } from "./changesRefresh";
import { useChangesStore } from "./changesStore";

vi.mock("./changesRefresh", () => ({
  refreshChanges: vi.fn(),
}));
vi.mock("./changesActions", () => ({
  stageChanges: vi.fn(() => Promise.resolve(true)),
  unstageChanges: vi.fn(() => Promise.resolve(true)),
  discardChanges: vi.fn(() => Promise.resolve(true)),
  commitChanges: vi.fn(() => Promise.resolve(true)),
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
  vi.mocked(stageChanges).mockClear();
  vi.mocked(discardChanges).mockClear();
  vi.mocked(commitChanges).mockClear();
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
    commitDraftByWorktree: {},
    operationByWorktree: {},
    operationErrorByWorktree: {},
  });
  useEditorStore.setState({ views: {}, navigationGeneration: 0 });
});

const openViewOptions = () =>
  fireEvent.click(screen.getByRole("button", { name: "View options" }));
const selectTreeView = () => {
  openViewOptions();
  fireEvent.click(screen.getByRole("menuitemradio", { name: "Tree view" }));
};

describe("ChangesPanel view modes", () => {
  it("defaults to the flat list mode without a manual refresh control", () => {
    render(<ChangesPanel worktreeId="w1" />);

    expect(refreshChanges).toHaveBeenCalledWith("w1");
    expect(
      screen.queryByRole("button", { name: "Refresh changes" }),
    ).toBeNull();
    openViewOptions();
    expect(
      screen.getByRole("menuitemradio", { name: "List view" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("menuitemradio", { name: "Tree view" }),
    ).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByRole("treeitem", {
        name: "src/features/changes/ChangesPanel.tsx M",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "src" })).toBeNull();
  });

  it("shows grouped paths as an expanded, collapsible tree", () => {
    render(<ChangesPanel worktreeId="w1" />);
    selectTreeView();

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
    selectTreeView();

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
    selectTreeView();
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

  it("filters by path and hides section-wide actions while filtering", () => {
    render(<ChangesPanel worktreeId="w1" />);
    fireEvent.click(screen.getByRole("button", { name: "Filter changes" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Filter changes" }), {
      target: { value: "README" },
    });

    expect(
      screen.queryByRole("treeitem", {
        name: "src/features/changes/ChangesPanel.tsx M",
      }),
    ).toBeNull();
    expect(screen.getByRole("treeitem", { name: "README.md U" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Stage all" })).toBeNull();
  });

  it("runs a row action without opening its diff", () => {
    render(<ChangesPanel worktreeId="w1" />);
    const row = screen.getByRole("treeitem", { name: "README.md U" });
    fireEvent.click(within(row).getByRole("button", { name: "Stage" }));

    expect(stageChanges).toHaveBeenCalledWith(
      "w1",
      expect.arrayContaining([
        expect.objectContaining({
          change: expect.objectContaining({ path: "README.md" }),
        }),
      ]),
    );
    expect(useEditorStore.getState().views.w1).toBeUndefined();
  });

  it("collapses sections and exposes destructive confirmation", () => {
    render(<ChangesPanel worktreeId="w1" />);
    const heading = screen.getByRole("button", { name: "CHANGES2" });
    fireEvent.click(heading);
    expect(heading).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("treeitem", { name: "src/main.tsx M" }),
    ).toBeNull();
    fireEvent.click(heading);
    const row = screen.getByRole("treeitem", { name: "src/main.tsx M" });
    fireEvent.click(within(row).getByRole("button", { name: "Discard" }));
    const dialog = screen.getByRole("dialog", { name: "Discard changes?" });
    expect(dialog).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Discard" }));
    expect(discardChanges).toHaveBeenCalledWith(
      "w1",
      expect.arrayContaining([
        expect.objectContaining({
          change: expect.objectContaining({ path: "src/main.tsx" }),
        }),
      ]),
    );
  });

  it("commits a staged change with the platform keyboard shortcut", () => {
    useChangesStore.setState({
      byWorktree: {
        w1: {
          snapshot: {
            ...snapshot,
            changes: [
              {
                path: "staged.ts",
                status: "M.",
                staged: true,
                unstaged: false,
                untracked: false,
              },
            ],
          },
          loading: false,
          staleError: null,
          generation: 1,
        },
      },
    });
    render(<ChangesPanel worktreeId="w1" />);
    const message = screen.getByRole("textbox", { name: "Commit message" });
    fireEvent.change(message, { target: { value: "ship it" } });
    fireEvent.keyDown(message, { key: "Enter", metaKey: true });
    expect(commitChanges).toHaveBeenCalledWith("w1", "ship it");
  });

  it("keeps status groups separate in tree mode", () => {
    render(<ChangesPanel worktreeId="w1" />);
    selectTreeView();

    const groups = screen.getAllByRole("region");
    expect(within(groups[0]).getByText("CHANGES")).toBeInTheDocument();
    expect(within(groups[1]).getByText("UNTRACKED FILES")).toBeInTheDocument();
  });
});
