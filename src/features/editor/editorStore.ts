import { create } from "zustand";
import type { DiffScope } from "../../bindings";

export type ResourceTab =
  | {
      id: string;
      worktreeId: string;
      type: "file";
      relativePath: string;
      preview: boolean;
      dirty?: boolean;
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
      sequence: number;
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

export type PersistedEditorViews = Record<string, WorktreeEditorView>;

const EDITOR_STORAGE_KEY = "spirecode.editor-tabs.v1";
const DIFF_SCOPES = new Set<DiffScope>(["staged", "unstaged", "untracked"]);

const safeRelativePath = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  !value.startsWith("/") &&
  !value.split("/").some((part) => part === ".." || part === "");

const safeId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 256;

function restoreTab(value: unknown, worktreeId: string): ResourceTab | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.worktreeId !== worktreeId) return null;
  if (candidate.type === "file" && safeRelativePath(candidate.relativePath))
    return {
      id: fileResourceId(worktreeId, candidate.relativePath),
      worktreeId,
      type: "file",
      relativePath: candidate.relativePath,
      preview: candidate.preview === true,
    };
  if (
    candidate.type === "diff" &&
    safeRelativePath(candidate.relativePath) &&
    typeof candidate.scope === "string" &&
    DIFF_SCOPES.has(candidate.scope as DiffScope)
  )
    return {
      id: diffResourceId(
        worktreeId,
        candidate.scope as DiffScope,
        candidate.relativePath,
      ),
      worktreeId,
      type: "diff",
      relativePath: candidate.relativePath,
      scope: candidate.scope as DiffScope,
      preview: candidate.preview === true,
    };
  if (
    candidate.type === "chat" &&
    safeId(candidate.sessionId) &&
    typeof candidate.title === "string"
  )
    return {
      id: chatResourceId(worktreeId, candidate.sessionId),
      worktreeId,
      type: "chat",
      sessionId: candidate.sessionId,
      title:
        candidate.title === "New chat" ? "" : candidate.title.slice(0, 256),
      preview: false,
    };
  return null;
}

export function loadPersistedEditorViews(): PersistedEditorViews {
  if (typeof localStorage === "undefined") return {};
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(EDITOR_STORAGE_KEY) ?? "{}",
    );
    if (!parsed || typeof parsed !== "object") return {};
    const restored: PersistedEditorViews = {};
    for (const [worktreeId, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (!safeId(worktreeId) || !value || typeof value !== "object") continue;
      const candidate = value as Record<string, unknown>;
      const rawTabs = Array.isArray(candidate.tabs) ? candidate.tabs : [];
      const tabs = rawTabs
        .map((tab) => restoreTab(tab, worktreeId))
        .filter((tab): tab is ResourceTab => tab !== null);
      const requestedActive =
        typeof candidate.activeTabId === "string"
          ? candidate.activeTabId
          : null;
      restored[worktreeId] = {
        tabs,
        activeTabId: tabs.some((tab) => tab.id === requestedActive)
          ? requestedActive
          : (tabs[tabs.length - 1]?.id ?? null),
      };
    }
    return restored;
  } catch {
    return {};
  }
}

function persistEditorViews(views: Record<string, WorktreeEditorView>): void {
  if (typeof localStorage === "undefined") return;
  const persisted: Record<string, WorktreeEditorView> = {};
  for (const [worktreeId, view] of Object.entries(views)) {
    const tabs: Array<Exclude<ResourceTab, { type: "terminal" }>> = [];
    for (const tab of view.tabs) {
      if (tab.type === "terminal") continue;
      if (tab.type === "file") {
        tabs.push({
          id: tab.id,
          worktreeId: tab.worktreeId,
          type: "file",
          relativePath: tab.relativePath,
          preview: tab.preview,
        });
      } else {
        tabs.push(tab);
      }
    }
    persisted[worktreeId] = {
      tabs,
      activeTabId: tabs.some((tab) => tab.id === view.activeTabId)
        ? view.activeTabId
        : (tabs[tabs.length - 1]?.id ?? null),
    };
  }
  try {
    localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    return;
  }
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
    title: string,
  ) => ResourceTab;
  setTerminalStatus: (
    worktreeId: string,
    terminalId: string,
    status: "running" | "exited" | "error",
  ) => void;
  setFileDirty: (worktreeId: string, tabId: string, dirty: boolean) => void;
  dirtyFileCount: () => number;
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
  views: loadPersistedEditorViews(),
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
      const views = {
        ...state.views,
        [incoming.worktreeId]: { tabs, activeTabId: incoming.id },
      };
      persistEditorViews(views);
      return { views };
    }),
  openTerminal: (worktreeId, terminalId) => {
    const sequence = (get().terminalSequenceByWorktree[worktreeId] ?? 0) + 1;
    const terminal: ResourceTab = {
      id: terminalResourceId(worktreeId, terminalId),
      worktreeId,
      type: "terminal",
      terminalId,
      sequence,
      status: "running",
      preview: false,
    };
    set((state) => {
      const view = state.views[worktreeId] ?? emptyView();
      const views = {
        ...state.views,
        [worktreeId]: {
          tabs: [...view.tabs, terminal],
          activeTabId: terminal.id,
        },
      };
      persistEditorViews(views);
      return {
        terminalSequenceByWorktree: {
          ...state.terminalSequenceByWorktree,
          [worktreeId]: sequence,
        },
        views,
      };
    });
    return terminal;
  },
  openChat: (worktreeId, sessionId, title) => {
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
  setFileDirty: (worktreeId, tabId, dirty) =>
    set((state) => {
      const view = state.views[worktreeId] ?? emptyView();
      const views = {
        ...state.views,
        [worktreeId]: {
          ...view,
          tabs: view.tabs.map((tab) =>
            tab.type === "file" && tab.id === tabId
              ? { ...tab, dirty, preview: dirty ? false : tab.preview }
              : tab,
          ),
        },
      };
      persistEditorViews(views);
      return { views };
    }),
  dirtyFileCount: () =>
    Object.values(get().views).reduce(
      (count, view) =>
        count +
        view.tabs.filter((tab) => tab.type === "file" && tab.dirty).length,
      0,
    ),
  keep: (worktreeId, tabId) =>
    set((state) => {
      const view = state.views[worktreeId] ?? emptyView();
      const views: Record<string, WorktreeEditorView> = {
        ...state.views,
        [worktreeId]: {
          ...view,
          tabs: view.tabs.map((tab): ResourceTab =>
            tab.id === tabId
              ? ({ ...tab, preview: false } as ResourceTab)
              : tab,
          ),
        },
      };
      persistEditorViews(views);
      return { views };
    }),
  close: (worktreeId, tabId) =>
    set((state) => {
      const view = state.views[worktreeId] ?? emptyView();
      const index = view.tabs.findIndex((tab) => tab.id === tabId);
      const tabs = view.tabs.filter((tab) => tab.id !== tabId);
      const views = {
        ...state.views,
        [worktreeId]: {
          tabs,
          activeTabId:
            view.activeTabId === tabId
              ? (tabs[Math.max(0, index - 1)]?.id ?? tabs[0]?.id ?? null)
              : view.activeTabId,
        },
      };
      persistEditorViews(views);
      return { views };
    }),
  activate: (worktreeId, activeTabId) =>
    set((state) => {
      const views = {
        ...state.views,
        [worktreeId]: {
          ...(state.views[worktreeId] ?? emptyView()),
          activeTabId,
        },
      };
      persistEditorViews(views);
      return { views };
    }),
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
      persistEditorViews(views);
      return {
        views,
        resourceGenerationByWorktree,
        diffGenerationByWorktree,
        terminalSequenceByWorktree,
      };
    }),
}));
