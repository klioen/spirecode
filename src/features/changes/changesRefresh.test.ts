import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands } from "../../bindings";
import { useEditorStore } from "../editor/editorStore";
import { useProjectsStore } from "../projects/projectsStore";
import { handleGitChanged, refreshChanges } from "./changesRefresh";
import { useChangesStore } from "./changesStore";

const status = {
  branch: "main",
  upstream: null,
  ahead: 0,
  behind: 0,
  changes: [],
};

beforeEach(() => {
  useProjectsStore.setState({ activeProjectId: "p1" });
  useChangesStore.setState({ byProject: {} });
  useEditorStore.setState({ diffGenerationByProject: {} });
  vi.restoreAllMocks();
});

describe("Git invalidation", () => {
  it("refreshes status and invalidates open diffs for the active project", async () => {
    vi.spyOn(commands, "gitStatus").mockResolvedValue(status);
    handleGitChanged({ projectId: "p1" });
    await vi.waitFor(() =>
      expect(useChangesStore.getState().byProject.p1.snapshot).toEqual(status),
    );
    expect(useEditorStore.getState().diffGenerationByProject.p1).toBe(1);
  });

  it("prevents a slower manual refresh from overwriting a newer one", async () => {
    let resolveOlder: (value: typeof status) => void = () => undefined;
    vi.spyOn(commands, "gitStatus")
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOlder = resolve;
        }),
      )
      .mockResolvedValueOnce({ ...status, branch: "new" });
    const older = refreshChanges("p1");
    await refreshChanges("p1");
    resolveOlder({ ...status, branch: "old" });
    await older;
    expect(useChangesStore.getState().byProject.p1.snapshot?.branch).toBe(
      "new",
    );
  });
});
