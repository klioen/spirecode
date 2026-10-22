import { beforeEach, expect, it, vi } from "vitest";
import {
  clearTaskDraft,
  readTaskDraft,
  resetTaskDrafts,
  saveTaskDraft,
  subscribeTaskDrafts,
  taskDraftCount,
} from "./taskDrafts";

beforeEach(resetTaskDrafts);
const draft = {
  title: "Draft",
  description: "Work",
  projectId: "project",
  workspaceMode: "existing" as const,
  worktreeId: "worktree",
  baseRef: "",
  automationEnabled: true,
};
it("keeps transient drafts and publishes close-guard metadata without dirty-workspace consent", () => {
  const changed = vi.fn();
  const stop = subscribeTaskDrafts(changed);
  saveTaskDraft("new", { ...draft, allowDirty: true } as typeof draft);
  expect(readTaskDraft("new")).toEqual(draft);
  expect(readTaskDraft("new")).not.toHaveProperty("allowDirty");
  expect(taskDraftCount()).toBe(1);
  clearTaskDraft("new");
  expect(taskDraftCount()).toBe(0);
  expect(changed).toHaveBeenCalledTimes(2);
  stop();
});
it("never evicts unsaved drafts when the session limit is reached", () => {
  for (let index = 0; index < 20; index++)
    expect(saveTaskDraft(String(index), draft)).toBe(true);
  expect(saveTaskDraft("overflow", draft)).toBe(false);
  expect(readTaskDraft("0")).toEqual(draft);
  expect(readTaskDraft("overflow")).toBeUndefined();
});
