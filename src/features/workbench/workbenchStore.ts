import { create } from "zustand";

export type PanelName = "projects" | "right";

export const DEFAULT_PANEL_SIZES = {
  projects: 220,
  right: 292,
} as const;

export const PANEL_LIMITS = {
  projects: { min: 160, max: 360 },
  right: { min: 220, max: 520 },
} as const;

const STORAGE_KEY = "pi-app.workbench.v1";

interface PersistedWorkbench {
  projectsWidth: number;
  rightPanelWidth: number;
  rightCollapsed: boolean;
}

interface WorkbenchState extends PersistedWorkbench {
  rightView: "files" | "changes";
  setRightView: (view: "files" | "changes") => void;
  setProjectsWidth: (width: number) => void;
  setRightPanelWidth: (width: number) => void;
  resetPanelSize: (panel: PanelName) => void;
  toggleRight: () => void;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)));

const defaults = (): PersistedWorkbench => ({
  projectsWidth: DEFAULT_PANEL_SIZES.projects,
  rightPanelWidth: DEFAULT_PANEL_SIZES.right,
  rightCollapsed: false,
});

const normalized = (
  value: Partial<PersistedWorkbench> | null | undefined,
): PersistedWorkbench => ({
  projectsWidth: clamp(
    Number(value?.projectsWidth) || DEFAULT_PANEL_SIZES.projects,
    PANEL_LIMITS.projects.min,
    PANEL_LIMITS.projects.max,
  ),
  rightPanelWidth: clamp(
    Number(value?.rightPanelWidth) || DEFAULT_PANEL_SIZES.right,
    PANEL_LIMITS.right.min,
    PANEL_LIMITS.right.max,
  ),
  rightCollapsed: value?.rightCollapsed === true,
});

const load = (): PersistedWorkbench => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value
      ? normalized(JSON.parse(value) as Partial<PersistedWorkbench>)
      : defaults();
  } catch {
    return defaults();
  }
};

const persist = (state: PersistedWorkbench) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    return;
  }
};

const persisted = (state: WorkbenchState): PersistedWorkbench => ({
  projectsWidth: state.projectsWidth,
  rightPanelWidth: state.rightPanelWidth,
  rightCollapsed: state.rightCollapsed,
});

export const useWorkbenchStore = create<WorkbenchState>((set) => ({
  ...load(),
  rightView: "files",
  setRightView: (rightView) => set({ rightView }),
  setProjectsWidth: (projectsWidth) =>
    set((state) => {
      const next = {
        ...state,
        projectsWidth: clamp(
          projectsWidth,
          PANEL_LIMITS.projects.min,
          PANEL_LIMITS.projects.max,
        ),
      };
      persist(persisted(next));
      return { projectsWidth: next.projectsWidth };
    }),
  setRightPanelWidth: (rightPanelWidth) =>
    set((state) => {
      const next = {
        ...state,
        rightPanelWidth: clamp(
          rightPanelWidth,
          PANEL_LIMITS.right.min,
          PANEL_LIMITS.right.max,
        ),
      };
      persist(persisted(next));
      return { rightPanelWidth: next.rightPanelWidth };
    }),
  resetPanelSize: (panel) => {
    const setters = useWorkbenchStore.getState();
    if (panel === "projects")
      setters.setProjectsWidth(DEFAULT_PANEL_SIZES.projects);
    else setters.setRightPanelWidth(DEFAULT_PANEL_SIZES.right);
  },
  toggleRight: () =>
    set((state) => {
      const next = { ...state, rightCollapsed: !state.rightCollapsed };
      persist(persisted(next));
      return { rightCollapsed: next.rightCollapsed };
    }),
}));

export const resetWorkbenchStore = () => {
  useWorkbenchStore.setState({ ...defaults(), rightView: "files" });
};
