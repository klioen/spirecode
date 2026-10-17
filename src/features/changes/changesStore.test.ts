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
    byWorktree: {},
    mode: "list",
    diffMode: "unified",
    commitDraftByWorktree: {},
    operationByWorktree: {},
    operationErrorByWorktree: {},
  }),
);

describe("changes snapshot", () => {
  it("uses list mode by default and supports switching to tree mode", () => {
    expect(useChangesStore.getState().mode).toBe("list");
    useChangesStore.getState().setMode("tree");
    expect(useChangesStore.getState().mode).toBe("tree");
  });

  it("retains last-known-good data when refresh fails", () => {
    const store = useChangesStore.getState();
    const initial = store.startRefresh("p1");
    store.refreshSucceeded("p1", initial, snapshot);
    const refresh = store.startRefresh("p1");
    store.refreshFailed("p1", refresh, {
      code: "GIT_FAILED",
      message: "git failed",
    });
    expect(useChangesStore.getState().byWorktree.p1.snapshot).toBe(snapshot);
    expect(useChangesStore.getState().byWorktree.p1.staleError?.code).toBe(
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
    expect(useChangesStore.getState().byWorktree.p1.snapshot).toBe(snapshot);
    expect(useChangesStore.getState().byWorktree.p1.staleError).toBeNull();
  });

  it("keeps commit drafts and operations isolated by worktree", () => {
    const store = useChangesStore.getState();
    store.setCommitDraft("w1", "first");
    store.setCommitDraft("w2", "second");
    expect(store.beginOperation("w1", { kind: "stage", paths: ["a.ts"] })).toBe(
      true,
    );
    expect(
      useChangesStore
        .getState()
        .beginOperation("w1", { kind: "commit", paths: [] }),
    ).toBe(false);
    expect(
      useChangesStore
        .getState()
        .beginOperation("w2", { kind: "commit", paths: [] }),
    ).toBe(true);
    useChangesStore.getState().clearWorktree("w1");
    expect(useChangesStore.getState().commitDraftByWorktree.w1).toBeUndefined();
    expect(useChangesStore.getState().commitDraftByWorktree.w2).toBe("second");
  });

  it("stores the diff layout in the changes store", () => {
    useChangesStore.getState().setDiffMode("split");
    expect(useChangesStore.getState().diffMode).toBe("split");
  });
});
