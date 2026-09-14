import { beforeEach, describe, expect, it } from "vitest";
import type { ProjectSummary, WorktreeSummary } from "../../bindings";
import { useProjectsStore } from "./projectsStore";

const worktree = (
  projectId: string,
  id: string,
  kind: "main" | "managed" = "main",
): WorktreeSummary => ({
  id,
  projectId,
  name: id,
  path: `/tmp/${id}`,
  branch: id,
  baseRef: "origin/main",
  kind,
  lastOpenedAt: 1,
});
const project = (
  id: string,
  ...worktrees: WorktreeSummary[]
): ProjectSummary => ({
  id,
  name: id,
  path: `/tmp/${id}`,
  lastOpenedAt: 1,
  worktrees: worktrees.length ? worktrees : [worktree(id, `${id}-main`)],
});

beforeEach(() =>
  useProjectsStore.setState({
    projects: [],
    activeWorktreeId: null,
    loading: false,
    creatingProjectId: null,
    error: null,
  }),
);

describe("nested project worktree state", () => {
  it("hydrates projects without restoring a selected worktree", () => {
    useProjectsStore.getState().hydrateCatalog({
      version: 2,
      projects: [project("one")],
      activeWorktreeId: "one-main",
    });

    expect(useProjectsStore.getState().projects).toHaveLength(1);
    expect(useProjectsStore.getState().activeWorktreeId).toBeNull();
  });

  it("retains a selected worktree across catalog refreshes", () => {
    const main = worktree("one", "one-main");
    const feature = worktree("one", "feature", "managed");
    useProjectsStore.getState().setProjects([project("one", main, feature)]);
    useProjectsStore.getState().selectWorktree("feature");
    useProjectsStore.getState().setProjects([project("one", main, feature)]);
    expect(useProjectsStore.getState().activeWorktreeId).toBe("feature");
  });

  it("selects a newly created worktree and returns to main after deletion", () => {
    const main = worktree("one", "one-main");
    const feature = worktree("one", "feature", "managed");
    useProjectsStore.getState().setProjects([project("one", main)]);
    useProjectsStore.getState().addWorktree(feature);
    expect(useProjectsStore.getState().activeWorktreeId).toBe("feature");
    useProjectsStore.getState().removeWorktree("feature");
    expect(useProjectsStore.getState().activeWorktreeId).toBe("one-main");
  });

  it("updates a managed worktree without changing its selection", () => {
    const main = worktree("one", "one-main");
    const feature = worktree("one", "feature", "managed");
    useProjectsStore.getState().setProjects([project("one", main, feature)]);
    useProjectsStore.getState().selectWorktree("feature");
    useProjectsStore.getState().updateWorktree({ ...feature, name: "renamed" });
    expect(useProjectsStore.getState().projects[0]?.worktrees[1]?.name).toBe(
      "renamed",
    );
    expect(useProjectsStore.getState().activeWorktreeId).toBe("feature");
  });
});
