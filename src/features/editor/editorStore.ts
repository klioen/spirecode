import { create } from "zustand";
import type { DiffScope } from "../../bindings";

export type ResourceTab =
  | {
      id: string;
      worktreeId: string;
      type: "file";
      relativePath: string;
      preview: boolean;
    }
  | {
      id: string;
      worktreeId: string;
      type: "diff";
      relativePath: string;
      scope: DiffScope;
      preview: boolean;
    }
  | {
      id: string;
      worktreeId: string;
      type: "terminal";
      terminalId: string;
      title: string;
      status: "running" | "exited" | "error";
      preview: false;
    }
  | {
      id: string;
      worktreeId: string;
      type: "chat";
      sessionId: string;
      title: string;
      preview: false;
    };

export const fileResourceId = (worktreeId: string, relativePath: string) =>
  `file:${worktreeId}:${relativePath}`;
export const diffResourceId = (
  worktreeId: string,
  scope: DiffScope,
  relativePath: string,
) => `diff:${worktreeId}:${scope}:${relativePath}`;
export const terminalResourceId = (worktreeId: string, terminalId: string) =>
  `terminal:${worktreeId}:${terminalId}`;
export const chatResourceId = (worktreeId: string, sessionId: string) =>
  `chat:${worktreeId}:${sessionId}`;

interface WorktreeEditorView {
  tabs: ResourceTab[];
  activeTabId: string | null;
}
interface EditorState {
  views: Record<string, WorktreeEditorView>;
  navigationGeneration: number;
  resourceGenerationByWorktree: Record<string, number>;
  diffGenerationByWorktree: Record<string, number>;
  terminalSequenceByWorktree: Record<string, number>;
  open: (tab: ResourceTab, keep?: boolean) => void;
  openTerminal: (worktreeId: string, terminalId: string) => ResourceTab;
  openChat: (
    worktreeId: string,
    sessionId: string,
    title?: string,
  ) => ResourceTab;
  setTerminalStatus: (
    worktreeId: string,
    terminalId: string,
    status: "running" | "exited" | "error",
  ) => void;
  keep: (worktreeId: string, tabId: string) => void;
  close: (worktreeId: string, tabId: string) => void;
  activate: (worktreeId: string, tabId: string) => void;
  beginNavigation: () => number;
  invalidateFiles: (worktreeId: string) => void;
  invalidateDiffs: (worktreeId: string) => void;
  clearWorktree: (worktreeId: string) => void;
}
const emptyView = (): WorktreeEditorView => ({ tabs: [], activeTabId: null });

export const useEditorStore = create<EditorState>((set, get) => ({
  views: {},
  navigationGeneration: 0,
  resourceGenerationByWorktree: {},
  diffGenerationByWorktree: {},
  terminalSequenceByWorktree: {},
  open: (incoming, keep = false) =>
    set((state) => {
      const view = state.views[incoming.worktreeId] ?? emptyView();
      const existing = view.tabs.find((tab) => tab.id === incoming.id);
      let tabs: ResourceTab[];
      if (existing) {
        tabs = view.tabs.map((tab) =>
          tab.id === incoming.id && keep ? { ...tab, preview: false } : tab,
        );
      } else if (incoming.type === "terminal" || incoming.type === "chat") {
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
          [incoming.worktreeId]: { tabs, activeTabId: incoming.id },
        },
      };
    }),
  openTerminal: (worktreeId, terminalId) => {
    const sequence = (get().terminalSequenceByWorktree[worktreeId] ?? 0) + 1;
    const terminal: ResourceTab = {
      id: terminalResourceId(worktreeId, terminalId),
      worktreeId,
      type: "terminal",
      terminalId,
      title: `Terminal${sequence}`,
      status: "running",
      preview: false,
    };
    set((state) => {
      const view = state.views[worktreeId] ?? emptyView();
      return {
        terminalSequenceByWorktree: {
          ...state.terminalSequenceByWorktree,
          [worktreeId]: sequence,
        },
        views: {
          ...state.views,
          [worktreeId]: {
            tabs: [...view.tabs, terminal],
            activeTabId: terminal.id,
          },
        },
      };
    });
    return terminal;
  },
  openChat: (worktreeId, sessionId, title = "New chat") => {
    const chat: ResourceTab = {
      id: chatResourceId(worktreeId, sessionId),
      worktreeId,
      type: "chat",
      sessionId,
      title,
      preview: false,
    };
    get().open(chat, true);
    return chat;
  },
  setTerminalStatus: (worktreeId, terminalId, status) =>
    set((state) => {
      const view = state.views[worktreeId] ?? emptyView();
      return {
        views: {
          ...state.views,
          [worktreeId]: {
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
  keep: (worktreeId, tabId) =>
    set((state) => {
      const view = state.views[worktreeId] ?? emptyView();
      return {
        views: {
          ...state.views,
          [worktreeId]: {
            ...view,
            tabs: view.tabs.map((tab) =>
              tab.id === tabId ? { ...tab, preview: false } : tab,
            ),
          },
        },
      };
    }),
  close: (worktreeId, tabId) =>
    set((state) => {
      const view = state.views[worktreeId] ?? emptyView();
      const index = view.tabs.findIndex((tab) => tab.id === tabId);
      const tabs = view.tabs.filter((tab) => tab.id !== tabId);
      return {
        views: {
          ...state.views,
          [worktreeId]: {
            tabs,
            activeTabId:
              view.activeTabId === tabId
                ? (tabs[Math.max(0, index - 1)]?.id ?? tabs[0]?.id ?? null)
                : view.activeTabId,
          },
        },
      };
    }),
  activate: (worktreeId, activeTabId) =>
    set((state) => ({
      views: {
        ...state.views,
        [worktreeId]: {
          ...(state.views[worktreeId] ?? emptyView()),
          activeTabId,
        },
      },
    })),
  beginNavigation: () => {
    const navigationGeneration = get().navigationGeneration + 1;
    set({ navigationGeneration });
    return navigationGeneration;
  },
  invalidateFiles: (worktreeId) =>
    set((state) => ({
      resourceGenerationByWorktree: {
        ...state.resourceGenerationByWorktree,
        [worktreeId]: (state.resourceGenerationByWorktree[worktreeId] ?? 0) + 1,
      },
    })),
  invalidateDiffs: (worktreeId) =>
    set((state) => ({
      diffGenerationByWorktree: {
        ...state.diffGenerationByWorktree,
        [worktreeId]: (state.diffGenerationByWorktree[worktreeId] ?? 0) + 1,
      },
    })),
  clearWorktree: (worktreeId) =>
    set((state) => {
      const views = { ...state.views };
      const resourceGenerationByWorktree = {
        ...state.resourceGenerationByWorktree,
      };
      const diffGenerationByWorktree = { ...state.diffGenerationByWorktree };
      const terminalSequenceByWorktree = {
        ...state.terminalSequenceByWorktree,
      };
      delete views[worktreeId];
      delete resourceGenerationByWorktree[worktreeId];
      delete diffGenerationByWorktree[worktreeId];
      delete terminalSequenceByWorktree[worktreeId];
      return {
        views,
        resourceGenerationByWorktree,
        diffGenerationByWorktree,
        terminalSequenceByWorktree,
      };
    }),
}));
