import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands } from "../../bindings";
import { useEditorStore } from "../editor/editorStore";
import { commitChanges, discardChanges, stageChanges } from "./changesActions";
import type { ProjectedChange } from "./changesProjection";
import { refreshChanges } from "./changesRefresh";
import { useChangesStore } from "./changesStore";

vi.mock("./changesRefresh", () => ({ refreshChanges: vi.fn() }));
vi.mock("../editor/EditorPane", () => ({
  discardEditorDocuments: vi.fn(),
}));

const row: ProjectedChange = {
  key: "unstaged:a.ts",
  section: "unstaged",
  scope: "unstaged",
  status: "M",
  canStage: true,
  canUnstage: false,
  canDiscard: true,
  change: {
    path: "a.ts",
    status: ".M",
    staged: false,
    unstaged: true,
    untracked: false,
  },
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(refreshChanges).mockResolvedValue();
  useChangesStore.setState({
    byWorktree: {},
    commitDraftByWorktree: {},
    operationByWorktree: {},
    operationErrorByWorktree: {},
  });
  useEditorStore.setState({
    views: {},
    diffGenerationByWorktree: {},
    documentResetById: {},
  });
});

describe("changes actions", () => {
  it("single-flights a mutation and refreshes status and diffs", async () => {
    let finish!: () => void;
    const command = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const stage = vi.spyOn(commands, "gitStage").mockReturnValue(command);

    const first = stageChanges("w1", [row]);
    const second = await stageChanges("w1", [row]);
    expect(second).toBe(false);
    expect(stage).toHaveBeenCalledOnce();
    finish();
    expect(await first).toBe(true);
    expect(refreshChanges).toHaveBeenCalledWith("w1");
    expect(useEditorStore.getState().diffGenerationByWorktree.w1).toBe(1);
    expect(useChangesStore.getState().operationByWorktree.w1).toBeNull();
  });

  it("preserves editor state when discard fails", async () => {
    vi.spyOn(commands, "gitDiscard").mockRejectedValue({
      code: "GIT_FAILED",
      message: "discard failed",
    });
    useEditorStore.getState().open(
      {
        id: "file:w1:a.ts",
        worktreeId: "w1",
        type: "file",
        relativePath: "a.ts",
        preview: false,
        dirty: true,
      },
      true,
    );

    expect(await discardChanges("w1", [row])).toBe(false);
    expect(
      useEditorStore
        .getState()
        .views.w1.tabs.find(({ id }) => id === "file:w1:a.ts"),
    ).toMatchObject({ dirty: true });
    expect(
      useChangesStore.getState().operationErrorByWorktree.w1,
    ).toMatchObject({
      code: "GIT_FAILED",
    });
  });

  it("clears only the commit draft that was actually submitted", async () => {
    let finish!: () => void;
    vi.spyOn(commands, "gitCommit").mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    useChangesStore.getState().setCommitDraft("w1", "first");
    const committing = commitChanges("w1", "first");
    useChangesStore.getState().setCommitDraft("w1", "second");
    finish();

    expect(await committing).toBe(true);
    expect(useChangesStore.getState().commitDraftByWorktree.w1).toBe("second");
  });
});
