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
  it("defaults to the flat list mode", () => {
    render(<ChangesPanel worktreeId="w1" />);

    expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Tree view" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      screen.getByRole("button", {
        name: "src/features/changes/ChangesPanel.tsx M",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "src" })).toBeNull();
  });

  it("shows grouped paths as an expanded, collapsible tree", () => {
    render(<ChangesPanel worktreeId="w1" />);
    fireEvent.click(screen.getByRole("button", { name: "Tree view" }));

    const src = screen.getByRole("button", { name: "src" });
    expect(src).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "features" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "ChangesPanel.tsx M" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "main.tsx M" })).toBeVisible();

    fireEvent.click(src);

    expect(screen.queryByRole("button", { name: "features" })).toBeNull();
    expect(screen.queryByRole("button", { name: "main.tsx M" })).toBeNull();
    expect(screen.getByRole("button", { name: "README.md U" })).toBeVisible();
  });

  it("opens the original path with the group scope from tree mode", () => {
    render(<ChangesPanel worktreeId="w1" />);
    fireEvent.click(screen.getByRole("button", { name: "Tree view" }));
    fireEvent.click(screen.getByRole("button", { name: "ChangesPanel.tsx M" }));

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
