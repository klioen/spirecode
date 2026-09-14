import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "../editor/editorStore";
import { useProjectsStore } from "../projects/projectsStore";
import { handleFilesystemChanged } from "./filesystemEvents";
import { directoryKey, useFileTreeStore } from "./fileTreeStore";

beforeEach(() => {
  useProjectsStore.setState({
    projects: [],
    activeWorktreeId: "current",
    loading: false,
    error: null,
  });
  useFileTreeStore.setState({
    directories: {
      [directoryKey("current", "")]: { status: "ready", entries: [] },
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
    ).toBeUndefined();
    expect(
      useFileTreeStore.getState().directories[directoryKey("other", "")],
    ).toBeDefined();
    expect(useFileTreeStore.getState().generationByWorktree.current).toBe(1);
    expect(useEditorStore.getState().resourceGenerationByWorktree.current).toBe(
      1,
    );
  });

  it("ignores events for a background project", () => {
    handleFilesystemChanged({
      worktreeId: "other",
      paths: [],
      truncated: true,
    });
    expect(
      useFileTreeStore.getState().generationByWorktree.other,
    ).toBeUndefined();
    expect(
      useEditorStore.getState().resourceGenerationByWorktree.other,
    ).toBeUndefined();
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
    ).toBeUndefined();
  });
});
