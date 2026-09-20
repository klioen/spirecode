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
    commands: { ...actual.commands, fsReadDir: vi.fn() },
  };
});

beforeEach(() => {
  vi.mocked(commands.fsReadDir).mockReset();
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
