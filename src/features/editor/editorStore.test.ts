import { beforeEach, describe, expect, it } from "vitest";
import { fileResourceId, useEditorStore } from "./editorStore";

const tab = (path: string) => ({
  id: fileResourceId("p1", path),
  projectId: "p1",
  type: "file" as const,
  relativePath: path,
  preview: true,
});
beforeEach(() =>
  useEditorStore.setState({ views: {}, navigationGeneration: 0 }),
);

describe("preview and keep tabs", () => {
  it("replaces the current preview", () => {
    useEditorStore.getState().open(tab("a.ts"));
    useEditorStore.getState().open(tab("b.ts"));
    expect(
      useEditorStore.getState().views.p1.tabs.map((item) => item.relativePath),
    ).toEqual(["b.ts"]);
  });
  it("keeps a pinned tab and deduplicates the same resource", () => {
    useEditorStore.getState().open(tab("a.ts"), true);
    useEditorStore.getState().open(tab("b.ts"));
    useEditorStore.getState().open(tab("a.ts"));
    const tabs = useEditorStore.getState().views.p1.tabs;
    expect(tabs).toHaveLength(2);
    expect(tabs.find((item) => item.relativePath === "a.ts")?.preview).toBe(
      false,
    );
  });
});
