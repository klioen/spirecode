import { beforeEach, describe, expect, it } from "vitest";
import { useProjectsStore } from "./projectsStore";

const project = (id: string) => ({
  id,
  name: id,
  path: `/tmp/${id}`,
  lastOpenedAt: 1,
});
beforeEach(() =>
  useProjectsStore.setState({
    projects: [],
    activeProjectId: null,
    loading: false,
    error: null,
  }),
);

describe("project view restoration", () => {
  it("retains selection when refreshed project list still contains it", () => {
    useProjectsStore.getState().setProjects([project("one"), project("two")]);
    useProjectsStore.getState().selectProject("two");
    useProjectsStore.getState().setProjects([project("two"), project("one")]);
    expect(useProjectsStore.getState().activeProjectId).toBe("two");
  });
  it("selects the next project when active one closes", () => {
    useProjectsStore.getState().setProjects([project("one"), project("two")]);
    useProjectsStore.getState().removeProject("one");
    expect(useProjectsStore.getState().activeProjectId).toBe("two");
  });
});
