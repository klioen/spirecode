import { create } from "zustand";
interface WorkbenchState {
  rightView: "files" | "changes";
  rightCollapsed: boolean;
  terminalCollapsed: boolean;
  setRightView: (view: "files" | "changes") => void;
  toggleRight: () => void;
  toggleTerminal: () => void;
}
export const useWorkbenchStore = create<WorkbenchState>((set) => ({
  rightView: "files",
  rightCollapsed: false,
  terminalCollapsed: false,
  setRightView: (rightView) => set({ rightView }),
  toggleRight: () =>
    set((state) => ({ rightCollapsed: !state.rightCollapsed })),
  toggleTerminal: () =>
    set((state) => ({ terminalCollapsed: !state.terminalCollapsed })),
}));
