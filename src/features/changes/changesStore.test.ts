import { beforeEach, describe, expect, it } from "vitest";
import type { GitStatus } from "../../bindings";
import { useChangesStore } from "./changesStore";

const snapshot: GitStatus = {
  branch: "main",
  upstream: null,
  ahead: 0,
  behind: 0,
  changes: [
    {
      path: "a.ts",
      status: ".M",
      staged: false,
      unstaged: true,
      untracked: false,
    },
  ],
};
beforeEach(() =>
  useChangesStore.setState({
    byProject: {},
    mode: "list",
    diffMode: "unified",
  }),
);

describe("changes snapshot", () => {
  it("retains last-known-good data when refresh fails", () => {
    const store = useChangesStore.getState();
    const initial = store.startRefresh("p1");
    store.refreshSucceeded("p1", initial, snapshot);
    const refresh = store.startRefresh("p1");
    store.refreshFailed("p1", refresh, {
      code: "GIT_FAILED",
      message: "git failed",
    });
    expect(useChangesStore.getState().byProject.p1.snapshot).toBe(snapshot);
    expect(useChangesStore.getState().byProject.p1.staleError?.code).toBe(
      "GIT_FAILED",
    );
  });

  it("rejects an older concurrent refresh result", () => {
    const store = useChangesStore.getState();
    const older = store.startRefresh("p1");
    const newer = store.startRefresh("p1");
    store.refreshSucceeded("p1", newer, snapshot);
    store.refreshFailed("p1", older, {
      code: "GIT_FAILED",
      message: "old failure",
    });
    expect(useChangesStore.getState().byProject.p1.snapshot).toBe(snapshot);
    expect(useChangesStore.getState().byProject.p1.staleError).toBeNull();
  });

  it("stores the diff layout in the changes store", () => {
    useChangesStore.getState().setDiffMode("split");
    expect(useChangesStore.getState().diffMode).toBe("split");
  });
});
