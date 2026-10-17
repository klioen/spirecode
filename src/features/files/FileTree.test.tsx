import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands } from "../../bindings";
import { useEditorStore } from "../editor/editorStore";
import { FileTree } from "./FileTree";
import { directoryKey, useFileTreeStore } from "./fileTreeStore";

vi.mock("../../bindings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../bindings")>();
  return {
    ...actual,
    commands: {
      ...actual.commands,
      fsReadDir: vi.fn(),
      fsCreateFile: vi.fn(),
      fsCreateDirectory: vi.fn(),
      fsRename: vi.fn(),
      fsMove: vi.fn(),
      fsCopy: vi.fn(),
      fsTrash: vi.fn(),
      fsReveal: vi.fn(),
    },
  };
});

beforeEach(() => {
  vi.mocked(commands.fsReadDir).mockReset();
  vi.mocked(commands.fsReadDir).mockResolvedValue([]);
  vi.mocked(commands.fsCreateFile).mockReset();
  vi.mocked(commands.fsCreateDirectory).mockReset();
  vi.mocked(commands.fsRename).mockReset();
  vi.mocked(commands.fsMove).mockReset();
  vi.mocked(commands.fsCopy).mockReset();
  vi.mocked(commands.fsTrash).mockReset();
  vi.mocked(commands.fsReveal).mockReset();
  useFileTreeStore.setState({
    expandedByWorktree: { w1: ["src"] },
    generationByWorktree: { w1: 0 },
    directories: {
      [directoryKey("w1", "")]: {
        status: "ready",
        entries: [
          { name: "src", relativePath: "src", kind: "directory" },
          { name: "README.md", relativePath: "README.md", kind: "file" },
        ],
      },
      [directoryKey("w1", "src")]: {
        status: "ready",
        entries: [
          { name: "main.tsx", relativePath: "src/main.tsx", kind: "file" },
        ],
      },
    },
  });
  useEditorStore.setState({ views: {}, navigationGeneration: 0 });
});

describe("FileTree accessibility", () => {
  it("exposes tree semantics and one roving tab stop", async () => {
    render(<FileTree worktreeId="w1" />);

    expect(screen.getByRole("tree")).toBeInTheDocument();
    const items = screen.getAllByRole("treeitem");
    await waitFor(() => expect(items[0]).toHaveAttribute("tabindex", "0"));
    expect(items.slice(1)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tabIndex: -1 }),
        expect.objectContaining({ tabIndex: -1 }),
      ]),
    );
    expect(screen.getByRole("treeitem", { name: "src" })).toHaveAttribute(
      "aria-level",
      "1",
    );
    expect(screen.getByRole("treeitem", { name: "src" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("treeitem", { name: "main.tsx" })).toHaveAttribute(
      "aria-level",
      "2",
    );
  });

  it("supports visible-item navigation, collapse, expand, and default actions", async () => {
    render(<FileTree worktreeId="w1" />);
    const src = screen.getByRole("treeitem", { name: "src" });
    await waitFor(() => expect(src).toHaveAttribute("tabindex", "0"));
    src.focus();

    fireEvent.keyDown(src, { key: "ArrowDown" });
    expect(screen.getByRole("treeitem", { name: "main.tsx" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(screen.getByRole("treeitem", { name: "README.md" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(src).toHaveFocus();
    fireEvent.keyDown(src, { key: "ArrowRight" });
    expect(screen.getByRole("treeitem", { name: "main.tsx" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(src).toHaveFocus();
    fireEvent.keyDown(src, { key: "ArrowLeft" });
    expect(src).toHaveAttribute("aria-expanded", "false");
    fireEvent.keyDown(src, { key: "ArrowRight" });
    expect(src).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(src, { key: " " });
    expect(src).toHaveAttribute("aria-expanded", "false");
    fireEvent.keyDown(src, { key: "Enter" });
    expect(src).toHaveAttribute("aria-expanded", "true");

    const readme = screen.getByRole("treeitem", { name: "README.md" });
    fireEvent.keyDown(readme, { key: "Enter" });
    expect(useEditorStore.getState().views.w1.activeTabId).toBe(
      "file:w1:README.md",
    );
  });

  it("keeps the previous entries visible while watcher invalidation refreshes in the background", async () => {
    let resolveRead!: (
      entries: Awaited<ReturnType<typeof commands.fsReadDir>>,
    ) => void;
    vi.mocked(commands.fsReadDir).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
    );
    useFileTreeStore.setState({
      expandedByWorktree: { w1: [] },
    });
    render(<FileTree worktreeId="w1" />);

    useFileTreeStore.getState().invalidateWorktree("w1");

    await waitFor(() =>
      expect(commands.fsReadDir).toHaveBeenCalledWith("w1", ""),
    );
    expect(screen.getByRole("treeitem", { name: "README.md" })).toBeVisible();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();

    resolveRead([
      { name: "updated.txt", relativePath: "updated.txt", kind: "file" },
    ]);
    expect(
      await screen.findByRole("treeitem", { name: "updated.txt" }),
    ).toBeVisible();
  });

  it("creates a file inline from the toolbar and opens it as a pinned tab", async () => {
    vi.mocked(commands.fsCreateFile).mockResolvedValue({
      operation: "create",
      kind: "file",
      destinationRelativePath: "new.ts",
    });
    render(<FileTree worktreeId="w1" />);

    fireEvent.click(screen.getByRole("button", { name: "New File" }));
    const input = screen.getByRole("textbox", { name: "New file name" });
    fireEvent.change(input, { target: { value: "new.ts" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(commands.fsCreateFile).toHaveBeenCalledWith("w1", "new.ts"),
    );
    expect(useEditorStore.getState().views.w1.activeTabId).toBe(
      "file:w1:new.ts",
    );
  });

  it("keeps inline creation open with an accessible error and cancels with Escape", async () => {
    vi.mocked(commands.fsCreateDirectory).mockRejectedValue({
      code: "EEXIST",
      message: "destination already exists",
    });
    render(<FileTree worktreeId="w1" />);

    fireEvent.click(screen.getByRole("button", { name: "New Folder" }));
    const input = screen.getByRole("textbox", { name: "New folder name" });
    fireEvent.change(input, { target: { value: "src" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "destination already exists",
    );
    expect(input).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(
      screen.queryByRole("textbox", { name: "New folder name" }),
    ).not.toBeInTheDocument();
  });

  it("falls back to the first visible item when the focused item disappears", async () => {
    const { rerender } = render(<FileTree worktreeId="w1" />);
    const readme = screen.getByRole("treeitem", { name: "README.md" });
    readme.focus();
    await waitFor(() => expect(readme).toHaveAttribute("tabindex", "0"));

    useFileTreeStore.setState({
      directories: {
        ...useFileTreeStore.getState().directories,
        [directoryKey("w1", "")]: {
          status: "ready",
          entries: [{ name: "src", relativePath: "src", kind: "directory" }],
        },
      },
    });
    rerender(<FileTree worktreeId="w1" />);

    await waitFor(() => {
      const fallback = screen.getByRole("treeitem", { name: "src" });
      expect(fallback).toHaveAttribute("tabindex", "0");
      expect(fallback).toHaveFocus();
    });
  });
});
