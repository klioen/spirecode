import { create } from "zustand";
import type { DiffScope } from "../../bindings";

export type ResourceTab =
  | {
      id: string;
      projectId: string;
      type: "file";
      relativePath: string;
      preview: boolean;
    }
  | {
      id: string;
      projectId: string;
      type: "diff";
      relativePath: string;
      scope: DiffScope;
      preview: boolean;
    }
  | {
      id: string;
      projectId: string;
      type: "terminal";
      terminalId: string;
      title: string;
      status: "running" | "exited" | "error";
      preview: false;
    };

export const fileResourceId = (projectId: string, relativePath: string) =>
  `file:${projectId}:${relativePath}`;
export const diffResourceId = (
  projectId: string,
  scope: DiffScope,
  relativePath: string,
) => `diff:${projectId}:${scope}:${relativePath}`;
export const terminalResourceId = (projectId: string, terminalId: string) =>
  `terminal:${projectId}:${terminalId}`;

interface ProjectEditorView {
  tabs: ResourceTab[];
  activeTabId: string | null;
}
interface EditorState {
  views: Record<string, ProjectEditorView>;
  navigationGeneration: number;
  resourceGenerationByProject: Record<string, number>;
  diffGenerationByProject: Record<string, number>;
  terminalSequenceByProject: Record<string, number>;
  open: (tab: ResourceTab, keep?: boolean) => void;
  openTerminal: (projectId: string, terminalId: string) => ResourceTab;
  setTerminalStatus: (
    projectId: string,
    terminalId: string,
    status: "running" | "exited" | "error",
  ) => void;
  keep: (projectId: string, tabId: string) => void;
  close: (projectId: string, tabId: string) => void;
  activate: (projectId: string, tabId: string) => void;
  beginNavigation: () => number;
  invalidateFiles: (projectId: string) => void;
  invalidateDiffs: (projectId: string) => void;
}
const emptyView = (): ProjectEditorView => ({ tabs: [], activeTabId: null });

export const useEditorStore = create<EditorState>((set, get) => ({
  views: {},
  navigationGeneration: 0,
  resourceGenerationByProject: {},
  diffGenerationByProject: {},
  terminalSequenceByProject: {},
  open: (incoming, keep = false) =>
    set((state) => {
      const view = state.views[incoming.projectId] ?? emptyView();
      const existing = view.tabs.find((tab) => tab.id === incoming.id);
      let tabs: ResourceTab[];
      if (existing) {
        tabs = view.tabs.map((tab) =>
          tab.id === incoming.id && keep ? { ...tab, preview: false } : tab,
        );
      } else if (incoming.type === "terminal") {
        tabs = [...view.tabs, incoming];
      } else {
        const next: ResourceTab = { ...incoming, preview: !keep };
        tabs = next.preview
          ? [...view.tabs.filter((tab) => !tab.preview), next]
          : [...view.tabs, next];
      }
      return {
        views: {
          ...state.views,
          [incoming.projectId]: { tabs, activeTabId: incoming.id },
        },
      };
    }),
  openTerminal: (projectId, terminalId) => {
    const sequence = (get().terminalSequenceByProject[projectId] ?? 0) + 1;
    const terminal: ResourceTab = {
      id: terminalResourceId(projectId, terminalId),
      projectId,
      type: "terminal",
      terminalId,
      title: `Terminal${sequence}`,
      status: "running",
      preview: false,
    };
    set((state) => {
      const view = state.views[projectId] ?? emptyView();
      return {
        terminalSequenceByProject: {
          ...state.terminalSequenceByProject,
          [projectId]: sequence,
        },
        views: {
          ...state.views,
          [projectId]: {
            tabs: [...view.tabs, terminal],
            activeTabId: terminal.id,
          },
        },
      };
    });
    return terminal;
  },
  setTerminalStatus: (projectId, terminalId, status) =>
    set((state) => {
      const view = state.views[projectId] ?? emptyView();
      return {
        views: {
          ...state.views,
          [projectId]: {
            ...view,
            tabs: view.tabs.map((tab) =>
              tab.type === "terminal" && tab.terminalId === terminalId
                ? { ...tab, status }
                : tab,
            ),
          },
        },
      };
    }),
  keep: (projectId, tabId) =>
    set((state) => {
      const view = state.views[projectId] ?? emptyView();
      return {
        views: {
          ...state.views,
          [projectId]: {
            ...view,
            tabs: view.tabs.map((tab) =>
              tab.id === tabId ? { ...tab, preview: false } : tab,
            ),
          },
        },
      };
    }),
  close: (projectId, tabId) =>
    set((state) => {
      const view = state.views[projectId] ?? emptyView();
      const index = view.tabs.findIndex((tab) => tab.id === tabId);
      const tabs = view.tabs.filter((tab) => tab.id !== tabId);
      return {
        views: {
          ...state.views,
          [projectId]: {
            tabs,
            activeTabId:
              view.activeTabId === tabId
                ? (tabs[Math.max(0, index - 1)]?.id ?? tabs[0]?.id ?? null)
                : view.activeTabId,
          },
        },
      };
    }),
  activate: (projectId, activeTabId) =>
    set((state) => ({
      views: {
        ...state.views,
        [projectId]: {
          ...(state.views[projectId] ?? emptyView()),
          activeTabId,
        },
      },
    })),
  beginNavigation: () => {
    const navigationGeneration = get().navigationGeneration + 1;
    set({ navigationGeneration });
    return navigationGeneration;
  },
  invalidateFiles: (projectId) =>
    set((state) => ({
      resourceGenerationByProject: {
        ...state.resourceGenerationByProject,
        [projectId]: (state.resourceGenerationByProject[projectId] ?? 0) + 1,
      },
    })),
  invalidateDiffs: (projectId) =>
    set((state) => ({
      diffGenerationByProject: {
        ...state.diffGenerationByProject,
        [projectId]: (state.diffGenerationByProject[projectId] ?? 0) + 1,
      },
    })),
}));
