import { create } from "zustand";
import type { CommandError, GitStatus } from "../../bindings";

interface SnapshotState {
  snapshot: GitStatus | null;
  loading: boolean;
  staleError: CommandError | null;
  generation: number;
}
interface ChangesState {
  byWorktree: Record<string, SnapshotState>;
  mode: "list" | "tree";
  diffMode: "unified" | "split";
  setMode: (mode: "list" | "tree") => void;
  setDiffMode: (mode: "unified" | "split") => void;
  startRefresh: (worktreeId: string) => number;
  invalidate: (worktreeId: string) => number;
  refreshSucceeded: (
    worktreeId: string,
    generation: number,
    snapshot: GitStatus,
  ) => void;
  refreshFailed: (
    worktreeId: string,
    generation: number,
    error: CommandError,
  ) => void;
  clearWorktree: (worktreeId: string) => void;
}
const blank: SnapshotState = {
  snapshot: null,
  loading: false,
  staleError: null,
  generation: 0,
};
export const useChangesStore = create<ChangesState>((set, get) => ({
  byWorktree: {},
  mode: "list",
  diffMode: "unified",
  setMode: (mode) => set({ mode }),
  setDiffMode: (diffMode) => set({ diffMode }),
  startRefresh: (worktreeId) => {
    const generation = (get().byWorktree[worktreeId]?.generation ?? 0) + 1;
    set((state) => ({
      byWorktree: {
        ...state.byWorktree,
        [worktreeId]: {
          ...(state.byWorktree[worktreeId] ?? blank),
          loading: true,
          generation,
        },
      },
    }));
    return generation;
  },
  invalidate: (worktreeId) => {
    const generation = (get().byWorktree[worktreeId]?.generation ?? 0) + 1;
    set((state) => ({
      byWorktree: {
        ...state.byWorktree,
        [worktreeId]: {
          ...(state.byWorktree[worktreeId] ?? blank),
          generation,
        },
      },
    }));
    return generation;
  },
  refreshSucceeded: (worktreeId, generation, snapshot) =>
    set((state) =>
      state.byWorktree[worktreeId]?.generation === generation
        ? {
            byWorktree: {
              ...state.byWorktree,
              [worktreeId]: {
                snapshot,
                loading: false,
                staleError: null,
                generation,
              },
            },
          }
        : state,
    ),
  refreshFailed: (worktreeId, generation, staleError) =>
    set((state) =>
      state.byWorktree[worktreeId]?.generation === generation
        ? {
            byWorktree: {
              ...state.byWorktree,
              [worktreeId]: {
                ...(state.byWorktree[worktreeId] ?? blank),
                loading: false,
                staleError,
                generation,
              },
            },
          }
        : state,
    ),
  clearWorktree: (worktreeId) =>
    set((state) => {
      const byWorktree = { ...state.byWorktree };
      delete byWorktree[worktreeId];
      return { byWorktree };
    }),
}));
