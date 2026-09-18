import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  chatResourceId,
  fileResourceId,
  loadPersistedEditorViews,
  terminalResourceId,
  useEditorStore,
} from "./editorStore";

const tab = (path: string) => ({
  id: fileResourceId("p1", path),
  worktreeId: "p1",
  type: "file" as const,
  relativePath: path,
  preview: true,
});
const STORAGE_KEY = "spirecode.editor-tabs.v1";

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
  useEditorStore.setState({
    views: {},
    navigationGeneration: 0,
    terminalSequenceByWorktree: {},
  });
  vi.restoreAllMocks();
});

describe("preview and keep tabs", () => {
  it("replaces the current preview", () => {
    useEditorStore.getState().open(tab("a.ts"));
    useEditorStore.getState().open(tab("b.ts"));
    expect(
      useEditorStore
        .getState()
        .views.p1.tabs.filter(
          (item) => item.type === "file" || item.type === "diff",
        )
        .map((item) => item.relativePath),
    ).toEqual(["b.ts"]);
  });
  it("keeps a pinned tab and deduplicates the same resource", () => {
    useEditorStore.getState().open(tab("a.ts"), true);
    useEditorStore.getState().open(tab("b.ts"));
    useEditorStore.getState().open(tab("a.ts"));
    const tabs = useEditorStore.getState().views.p1.tabs;
    expect(tabs).toHaveLength(2);
    expect(
      tabs.find(
        (item) =>
          (item.type === "file" || item.type === "diff") &&
          item.relativePath === "a.ts",
      )?.preview,
    ).toBe(false);
  });

  it("tracks dirty metadata for file tabs and clears it after save", () => {
    useEditorStore.getState().open(tab("a.ts"));
    const store = useEditorStore.getState() as ReturnType<
      typeof useEditorStore.getState
    > & {
      setFileDirty: (worktreeId: string, tabId: string, dirty: boolean) => void;
    };

    store.setFileDirty("p1", fileResourceId("p1", "a.ts"), true);
    expect(useEditorStore.getState().views.p1.tabs[0]).toMatchObject({
      type: "file",
      dirty: true,
    });
    expect(useEditorStore.getState().dirtyFileCount()).toBe(1);
    store.setFileDirty("p1", fileResourceId("p1", "a.ts"), false);
    expect(useEditorStore.getState().views.p1.tabs[0]).toMatchObject({
      type: "file",
      dirty: false,
    });
    expect(useEditorStore.getState().dirtyFileCount()).toBe(0);
  });

  it("opens numbered terminal tabs without replacing file previews", () => {
    useEditorStore.getState().open(tab("a.ts"));
    const first = useEditorStore.getState().openTerminal("p1", "terminal-a");
    useEditorStore.getState().close("p1", first.id);
    const second = useEditorStore.getState().openTerminal("p1", "terminal-b");

    expect(first).toMatchObject({
      id: terminalResourceId("p1", "terminal-a"),
      type: "terminal",
      title: "Terminal1",
      preview: false,
    });
    expect(second.type === "terminal" ? second.title : null).toBe("Terminal2");
    expect(
      useEditorStore.getState().views.p1.tabs.map((item) => item.type),
    ).toEqual(["file", "terminal"]);
  });

  it("opens and deduplicates chat tabs without replacing previews", () => {
    useEditorStore.getState().open(tab("a.ts"));
    const first = useEditorStore
      .getState()
      .openChat("p1", "session-a", "Chat A");
    const reopened = useEditorStore
      .getState()
      .openChat("p1", "session-a", "Renamed");

    expect(first).toMatchObject({
      id: chatResourceId("p1", "session-a"),
      type: "chat",
      title: "Chat A",
      preview: false,
    });
    expect(reopened.id).toBe(first.id);
    expect(useEditorStore.getState().views.p1.tabs).toHaveLength(2);
    expect(useEditorStore.getState().views.p1.activeTabId).toBe(first.id);
  });

  it("persists file, diff, and chat metadata but never terminal tabs", () => {
    useEditorStore.getState().open(tab("a.ts"), true);
    useEditorStore.getState().open(
      {
        id: "diff:p1:unstaged:b.ts",
        worktreeId: "p1",
        type: "diff",
        relativePath: "b.ts",
        scope: "unstaged",
        preview: false,
      },
      true,
    );
    useEditorStore.getState().openChat("p1", "session-a", "Chat A");
    useEditorStore.getState().openTerminal("p1", "terminal-a");

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    expect(stored.p1.tabs).toEqual([
      expect.objectContaining({ type: "file", relativePath: "a.ts" }),
      expect.objectContaining({ type: "diff", relativePath: "b.ts" }),
      expect.objectContaining({ type: "chat", sessionId: "session-a" }),
    ]);
    expect(
      stored.p1.tabs.some((item: { type: string }) => item.type === "terminal"),
    ).toBe(false);
    expect(stored.p1.activeTabId).toBe(chatResourceId("p1", "session-a"));
  });

  it("restores valid metadata and drops invalid or terminal tabs", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        p1: {
          tabs: [
            {
              id: "file:p1:a.ts",
              worktreeId: "p1",
              type: "file",
              relativePath: "a.ts",
              preview: true,
              dirty: true,
            },
            {
              id: "terminal:p1:old",
              worktreeId: "p1",
              type: "terminal",
              terminalId: "old",
              title: "Terminal1",
              status: "running",
              preview: false,
            },
            {
              id: "file:p1:bad",
              worktreeId: "p1",
              type: "file",
              relativePath: "../secret",
              preview: false,
            },
            {
              id: "chat:p1:s1",
              worktreeId: "p1",
              type: "chat",
              sessionId: "s1",
              title: "Chat",
            },
          ],
          activeTabId: "terminal:p1:old",
        },
      }),
    );
    vi.resetModules();
    // The parser is exported for deterministic validation without reloading the singleton store.
    const restored = loadPersistedEditorViews();
    expect(restored.p1.tabs).toHaveLength(2);
    expect(restored.p1.tabs[0]).toMatchObject({ type: "file" });
    expect(restored.p1.tabs[0]).not.toHaveProperty("dirty");
    expect(restored.p1.activeTabId).toBe("chat:p1:s1");
  });

  it("clears a worktree from memory and persistence", () => {
    useEditorStore.getState().open(tab("a.ts"), true);
    expect(localStorage.getItem(STORAGE_KEY)).toContain("a.ts");
    useEditorStore.getState().clearWorktree("p1");
    expect(useEditorStore.getState().views.p1).toBeUndefined();
    expect(localStorage.getItem(STORAGE_KEY)).not.toContain("a.ts");
  });

  it("tracks terminal exit status in the central resource tab", () => {
    const terminal = useEditorStore.getState().openTerminal("p1", "terminal-a");
    useEditorStore.getState().setTerminalStatus("p1", "terminal-a", "exited");

    expect(
      useEditorStore
        .getState()
        .views.p1.tabs.find((item) => item.id === terminal.id),
    ).toMatchObject({ status: "exited" });
  });
});
