import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "../editor/editorStore";
import { useProjectsStore } from "../projects/projectsStore";
import { handleFilesystemChanged } from "./filesystemEvents";
import { directoryKey, useFileTreeStore } from "./fileTreeStore";

beforeEach(() => {
  useProjectsStore.setState({
    projects: [],
    activeProjectId: "current",
    loading: false,
    error: null,
  });
  useFileTreeStore.setState({
    directories: {
      [directoryKey("current", "")]: { status: "ready", entries: [] },
      [directoryKey("other", "")]: { status: "ready", entries: [] },
    },
    generationByProject: {},
    expandedByProject: {},
  });
  useEditorStore.setState({ resourceGenerationByProject: {} });
});

describe("filesystem invalidation", () => {
  it("invalidates the active project tree and open-file generation", () => {
    handleFilesystemChanged({
      projectId: "current",
      paths: ["src/a.ts"],
      truncated: false,
    });
    expect(
      useFileTreeStore.getState().directories[directoryKey("current", "")],
    ).toBeUndefined();
    expect(
      useFileTreeStore.getState().directories[directoryKey("other", "")],
    ).toBeDefined();
    expect(useFileTreeStore.getState().generationByProject.current).toBe(1);
    expect(useEditorStore.getState().resourceGenerationByProject.current).toBe(
      1,
    );
  });

  it("ignores events for a background project", () => {
    handleFilesystemChanged({ projectId: "other", paths: [], truncated: true });
    expect(
      useFileTreeStore.getState().generationByProject.other,
    ).toBeUndefined();
    expect(
      useEditorStore.getState().resourceGenerationByProject.other,
    ).toBeUndefined();
  });

  it("rejects a stale directory response after invalidation", () => {
    const store = useFileTreeStore.getState();
    store.invalidateProject("current");
    store.setDirectory("current", directoryKey("current", ""), 0, {
      status: "ready",
      entries: [],
    });
    expect(
      useFileTreeStore.getState().directories[directoryKey("current", "")],
    ).toBeUndefined();
  });
});
