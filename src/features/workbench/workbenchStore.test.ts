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
  it("clamps every panel size to its supported range", () => {
    const store = useWorkbenchStore.getState();
    store.setProjectsWidth(10);
    store.setRightPanelWidth(900);
    store.setTerminalHeight(40);

    expect(useWorkbenchStore.getState()).toMatchObject({
      projectsWidth: PANEL_LIMITS.projects.min,
      rightPanelWidth: PANEL_LIMITS.right.max,
      terminalHeight: PANEL_LIMITS.terminal.min,
    });
  });

  it("persists sizes and restores defaults independently", () => {
    const store = useWorkbenchStore.getState();
    store.setProjectsWidth(280);
    store.setRightPanelWidth(360);
    store.setTerminalHeight(300);

    expect(
      JSON.parse(localStorage.getItem("pi-app.workbench.v1") ?? "{}"),
    ).toMatchObject({
      projectsWidth: 280,
      rightPanelWidth: 360,
      terminalHeight: 300,
    });

    store.resetPanelSize("projects");
    expect(useWorkbenchStore.getState().projectsWidth).toBe(
      DEFAULT_PANEL_SIZES.projects,
    );
    expect(useWorkbenchStore.getState().rightPanelWidth).toBe(360);
  });
});
