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
    };

export const fileResourceId = (projectId: string, relativePath: string) =>
  `file:${projectId}:${relativePath}`;
export const diffResourceId = (
  projectId: string,
  scope: DiffScope,
  relativePath: string,
) => `diff:${projectId}:${scope}:${relativePath}`;

interface ProjectEditorView {
  tabs: ResourceTab[];
  activeTabId: string | null;
}
interface EditorState {
  views: Record<string, ProjectEditorView>;
  navigationGeneration: number;
  resourceGenerationByProject: Record<string, number>;
  diffGenerationByProject: Record<string, number>;
  open: (tab: ResourceTab, keep?: boolean) => void;
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
  open: (incoming, keep = false) =>
    set((state) => {
      const view = state.views[incoming.projectId] ?? emptyView();
      const existing = view.tabs.find((tab) => tab.id === incoming.id);
      let tabs: ResourceTab[];
      if (existing) {
        tabs = view.tabs.map((tab) =>
          tab.id === incoming.id && keep ? { ...tab, preview: false } : tab,
        );
      } else {
        const next = { ...incoming, preview: !keep };
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
