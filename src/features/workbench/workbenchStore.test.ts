import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PANEL_SIZES,
  PANEL_LIMITS,
  resetWorkbenchStore,
  useWorkbenchStore,
} from "./workbenchStore";

beforeEach(() => {
  localStorage.clear();
  resetWorkbenchStore();
});

describe("workbench panel sizes", () => {
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
      JSON.parse(localStorage.getItem("pi-app.workbench.v1") ?? "{}"),
    ).toEqual({
      projectsWidth: 280,
      rightPanelWidth: 360,
      rightCollapsed: false,
    });

    store.resetPanelSize("projects");
    expect(useWorkbenchStore.getState().projectsWidth).toBe(
      DEFAULT_PANEL_SIZES.projects,
    );
    expect(useWorkbenchStore.getState().rightPanelWidth).toBe(360);
  });
});
