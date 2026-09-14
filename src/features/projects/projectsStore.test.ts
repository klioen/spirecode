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
  it("selects main when startup catalog has exactly one project", () => {
    const main = worktree("one", "one-main");
    const feature = worktree("one", "feature", "managed");
    useProjectsStore.getState().hydrateCatalog({
      version: 2,
      projects: [project("one", main, feature)],
      activeWorktreeId: "feature",
    });

    expect(useProjectsStore.getState().projects).toHaveLength(1);
    expect(useProjectsStore.getState().activeWorktreeId).toBe("one-main");
  });

  it("does not select when startup catalog has multiple projects", () => {
    useProjectsStore.getState().hydrateCatalog({
      version: 2,
      projects: [project("one"), project("two")],
      activeWorktreeId: "one-main",
    });

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
