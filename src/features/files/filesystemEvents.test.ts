import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "../editor/editorStore";
import { handleFilesystemChanged } from "./filesystemEvents";
import { directoryKey, useFileTreeStore } from "./fileTreeStore";

beforeEach(() => {
  useFileTreeStore.setState({
    directories: {
      [directoryKey("current", "")]: { status: "ready", entries: [] },
      [directoryKey("current", "src")]: { status: "ready", entries: [] },
      [directoryKey("current", "docs")]: { status: "ready", entries: [] },
      [directoryKey("other", "")]: { status: "ready", entries: [] },
    },
    generationByWorktree: {},
    expandedByWorktree: {},
  });
  useEditorStore.setState({ resourceGenerationByWorktree: {} });
});

describe("filesystem invalidation", () => {
  it("invalidates the active project tree and open-file generation", () => {
    handleFilesystemChanged({
      worktreeId: "current",
      paths: ["src/a.ts"],
      truncated: false,
    });
    expect(
      useFileTreeStore.getState().directories[directoryKey("current", "")],
    ).toMatchObject({ status: "idle", entries: [] });
    expect(
      useFileTreeStore.getState().directories[directoryKey("current", "src")],
    ).toMatchObject({ status: "idle" });
    expect(
      useFileTreeStore.getState().directories[directoryKey("current", "docs")],
    ).toMatchObject({ status: "ready" });
    expect(
      useFileTreeStore.getState().directories[directoryKey("other", "")],
    ).toBeDefined();
    expect(useFileTreeStore.getState().generationByWorktree.current).toBe(1);
    expect(useEditorStore.getState().resourceGenerationByWorktree.current).toBe(
      1,
    );
  });

  it("invalidates background worktrees so cached files are fresh when selected", () => {
    handleFilesystemChanged({
      worktreeId: "other",
      paths: [],
      truncated: true,
    });
    expect(useFileTreeStore.getState().generationByWorktree.other).toBe(1);
    expect(useEditorStore.getState().resourceGenerationByWorktree.other).toBe(
      1,
    );
  });

  it("rejects a stale directory response after invalidation", () => {
    const store = useFileTreeStore.getState();
    store.invalidateWorktree("current");
    store.setDirectory("current", directoryKey("current", ""), 0, {
      status: "ready",
      entries: [],
    });
    expect(
      useFileTreeStore.getState().directories[directoryKey("current", "")],
    ).toMatchObject({ status: "idle", entries: [] });
  });
});
