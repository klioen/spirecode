import { describe, expect, it } from "vitest";
import type { ProjectSummary } from "../../bindings";
import {
  groupDropId,
  previewProjectMove,
  projectDragId,
  projectMoveIntent,
  resolveProjectDropTarget,
  staticProjectSortingStrategy,
} from "./projectDnd";

const project = (id: string, groupId: string | null): ProjectSummary => ({
  id,
  kind: "directory",
  name: id,
  path: `/${id}`,
  lastOpenedAt: 1,
  worktrees: [],
  nextWorktreeSequence: 1,
  groupId,
});

describe("projectDnd", () => {
  it("keeps non-dragged project rows stationary while the overlay moves", () => {
    expect(staticProjectSortingStrategy({} as never)).toBeNull();
  });

  it("uses stable project and group identifiers", () => {
    expect(resolveProjectDropTarget(projectDragId("p1"))).toEqual({
      type: "project",
      projectId: "p1",
    });
    expect(resolveProjectDropTarget(groupDropId("g1"))).toEqual({
      type: "group",
      groupId: "g1",
    });
    expect(resolveProjectDropTarget(groupDropId(null))).toEqual({
      type: "group",
      groupId: null,
    });
  });

  it("resolves before and after positions in a destination group", () => {
    const projects = [
      project("a", "g1"),
      project("b", "g2"),
      project("c", "g2"),
    ];
    expect(
      projectMoveIntent(projects, "a", { type: "project", projectId: "b" }),
    ).toEqual({ projectId: "a", targetGroupId: "g2", beforeProjectId: "b" });
    expect(
      projectMoveIntent(
        projects,
        "a",
        { type: "project", projectId: "b" },
        true,
      ),
    ).toEqual({ projectId: "a", targetGroupId: "g2", beforeProjectId: "c" });
  });

  it("previews same-group ordering and appends into empty or ungrouped groups", () => {
    const projects = [
      project("a", "g1"),
      project("b", "g1"),
      project("c", null),
    ];
    expect(
      previewProjectMove(projects, {
        projectId: "a",
        targetGroupId: "g1",
        beforeProjectId: null,
      }).map(({ id }) => id),
    ).toEqual(["b", "a", "c"]);
    expect(
      previewProjectMove(projects, {
        projectId: "a",
        targetGroupId: null,
        beforeProjectId: null,
      }).map(({ id }) => id),
    ).toEqual(["b", "c", "a"]);
    expect(
      previewProjectMove(projects, {
        projectId: "a",
        targetGroupId: "empty",
        beforeProjectId: null,
      }).map(({ id }) => id),
    ).toEqual(["b", "c", "a"]);
  });
});
