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

const STORAGE_KEY = "spirecode.workbench.v1";
const LEGACY_STORAGE_KEY = "pi-app.workbench.v1";

interface PersistedWorkbench {
  projectsWidth: number;
  rightPanelWidth: number;
  projectsCollapsed: boolean;
  rightCollapsed: boolean;
}

interface WorkbenchState extends PersistedWorkbench {
  rightView: "files" | "changes";
  setRightView: (view: "files" | "changes") => void;
  setProjectsWidth: (width: number) => void;
  setRightPanelWidth: (width: number) => void;
  resetPanelSize: (panel: PanelName) => void;
  toggleProjects: () => void;
  toggleRight: () => void;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)));

const defaults = (): PersistedWorkbench => ({
  projectsWidth: DEFAULT_PANEL_SIZES.projects,
  rightPanelWidth: DEFAULT_PANEL_SIZES.right,
  projectsCollapsed: false,
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
  projectsCollapsed: value?.projectsCollapsed === true,
  rightCollapsed: value?.rightCollapsed === true,
});

export const loadPersistedWorkbench = (): PersistedWorkbench => {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current)
      return normalized(JSON.parse(current) as Partial<PersistedWorkbench>);

    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacy) return defaults();

    const migrated = normalized(
      JSON.parse(legacy) as Partial<PersistedWorkbench>,
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return migrated;
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
  projectsCollapsed: state.projectsCollapsed,
  rightCollapsed: state.rightCollapsed,
});

export const useWorkbenchStore = create<WorkbenchState>((set) => ({
  ...loadPersistedWorkbench(),
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
  toggleProjects: () =>
    set((state) => {
      const next = { ...state, projectsCollapsed: !state.projectsCollapsed };
      persist(persisted(next));
      return { projectsCollapsed: next.projectsCollapsed };
    }),
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
