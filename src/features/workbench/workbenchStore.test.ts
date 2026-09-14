import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PANEL_SIZES,
  PANEL_LIMITS,
  loadPersistedWorkbench,
  resetWorkbenchStore,
  useWorkbenchStore,
} from "./workbenchStore";

beforeEach(() => {
  localStorage.clear();
  resetWorkbenchStore();
});

describe("workbench panel sizes", () => {
  it("migrates legacy panel state to the SpireCode key", () => {
    const legacyKey = ["pi", "app.workbench.v1"].join("-");
    localStorage.setItem(
      legacyKey,
      JSON.stringify({
        projectsWidth: 280,
        rightPanelWidth: 360,
        projectsCollapsed: true,
        rightCollapsed: false,
      }),
    );

    expect(loadPersistedWorkbench()).toEqual({
      projectsWidth: 280,
      rightPanelWidth: 360,
      projectsCollapsed: true,
      rightCollapsed: false,
    });
    expect(
      JSON.parse(localStorage.getItem("spirecode.workbench.v1") ?? "{}"),
    ).toMatchObject({ projectsWidth: 280, projectsCollapsed: true });
    expect(localStorage.getItem(legacyKey)).toBeNull();
  });

  it("clamps the side panel sizes to their supported ranges", () => {
    const store = useWorkbenchStore.getState();
    store.setProjectsWidth(10);
    store.setRightPanelWidth(900);

    expect(useWorkbenchStore.getState()).toMatchObject({
      projectsWidth: PANEL_LIMITS.projects.min,
      rightPanelWidth: PANEL_LIMITS.right.max,
    });
  });

  it("persists side sizes without retired terminal panel state", () => {
    const store = useWorkbenchStore.getState();
    store.setProjectsWidth(280);
    store.setRightPanelWidth(360);

    expect(
      JSON.parse(localStorage.getItem("spirecode.workbench.v1") ?? "{}"),
    ).toEqual({
      projectsWidth: 280,
      rightPanelWidth: 360,
      projectsCollapsed: false,
      rightCollapsed: false,
    });

    store.resetPanelSize("projects");
    expect(useWorkbenchStore.getState().projectsWidth).toBe(
      DEFAULT_PANEL_SIZES.projects,
    );
    expect(useWorkbenchStore.getState().rightPanelWidth).toBe(360);
  });

  it("persists the projects panel collapsed state without changing its width", () => {
    useWorkbenchStore.getState().setProjectsWidth(280);
    useWorkbenchStore.getState().toggleProjects();

    expect(useWorkbenchStore.getState()).toMatchObject({
      projectsWidth: 280,
      projectsCollapsed: true,
    });
    expect(
      JSON.parse(localStorage.getItem("spirecode.workbench.v1") ?? "{}"),
    ).toMatchObject({ projectsWidth: 280, projectsCollapsed: true });
  });
});
