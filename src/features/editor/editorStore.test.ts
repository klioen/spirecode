import { beforeEach, describe, expect, it } from "vitest";
import {
  fileResourceId,
  terminalResourceId,
  useEditorStore,
} from "./editorStore";

const tab = (path: string) => ({
  id: fileResourceId("p1", path),
  projectId: "p1",
  type: "file" as const,
  relativePath: path,
  preview: true,
});
beforeEach(() =>
  useEditorStore.setState({
    views: {},
    navigationGeneration: 0,
    terminalSequenceByProject: {},
  }),
);

describe("preview and keep tabs", () => {
  it("replaces the current preview", () => {
    useEditorStore.getState().open(tab("a.ts"));
    useEditorStore.getState().open(tab("b.ts"));
    expect(
      useEditorStore
        .getState()
        .views.p1.tabs.filter((item) => item.type !== "terminal")
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
        (item) => item.type !== "terminal" && item.relativePath === "a.ts",
      )?.preview,
    ).toBe(false);
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
