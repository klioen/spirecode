import { create } from "zustand";

export interface TerminalTab {
  terminalId: string;
  projectId: string;
  title: string;
  status: "running" | "exited" | "error";
}
interface TerminalState {
  tabsByProject: Record<string, TerminalTab[]>;
  activeByProject: Record<string, string | null>;
  add: (tab: TerminalTab) => void;
  remove: (projectId: string, terminalId: string) => void;
  activate: (projectId: string, terminalId: string) => void;
  setStatus: (
    projectId: string,
    terminalId: string,
    status: TerminalTab["status"],
  ) => void;
}
const EMPTY_TERMINAL_TABS: TerminalTab[] = [];

export const selectTerminalTabs = (state: TerminalState, projectId: string) =>
  state.tabsByProject[projectId] ?? EMPTY_TERMINAL_TABS;

export const useTerminalStore = create<TerminalState>((set) => ({
  tabsByProject: {},
  activeByProject: {},
  add: (tab) =>
    set((state) => ({
      tabsByProject: {
        ...state.tabsByProject,
        [tab.projectId]: [...(state.tabsByProject[tab.projectId] ?? []), tab],
      },
      activeByProject: {
        ...state.activeByProject,
        [tab.projectId]: tab.terminalId,
      },
    })),
  remove: (projectId, terminalId) =>
    set((state) => {
      const tabs = (state.tabsByProject[projectId] ?? []).filter(
        (tab) => tab.terminalId !== terminalId,
      );
      return {
        tabsByProject: { ...state.tabsByProject, [projectId]: tabs },
        activeByProject: {
          ...state.activeByProject,
          [projectId]:
            state.activeByProject[projectId] === terminalId
              ? (tabs[tabs.length - 1]?.terminalId ?? null)
              : state.activeByProject[projectId],
        },
      };
    }),
  activate: (projectId, terminalId) =>
    set((state) => ({
      activeByProject: { ...state.activeByProject, [projectId]: terminalId },
    })),
  setStatus: (projectId, terminalId, status) =>
    set((state) => ({
      tabsByProject: {
        ...state.tabsByProject,
        [projectId]: (state.tabsByProject[projectId] ?? []).map((tab) =>
          tab.terminalId === terminalId ? { ...tab, status } : tab,
        ),
      },
    })),
}));
