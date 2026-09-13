import { create } from "zustand";
import type { CommandError, GitStatus } from "../../bindings";

interface SnapshotState {
  snapshot: GitStatus | null;
  loading: boolean;
  staleError: CommandError | null;
  generation: number;
}
interface ChangesState {
  byProject: Record<string, SnapshotState>;
  mode: "list" | "tree";
  diffMode: "unified" | "split";
  setMode: (mode: "list" | "tree") => void;
  setDiffMode: (mode: "unified" | "split") => void;
  startRefresh: (projectId: string) => number;
  invalidate: (projectId: string) => number;
  refreshSucceeded: (
    projectId: string,
    generation: number,
    snapshot: GitStatus,
  ) => void;
  refreshFailed: (
    projectId: string,
    generation: number,
    error: CommandError,
  ) => void;
}
const blank: SnapshotState = {
  snapshot: null,
  loading: false,
  staleError: null,
  generation: 0,
};
export const useChangesStore = create<ChangesState>((set, get) => ({
  byProject: {},
  mode: "list",
  diffMode: "unified",
  setMode: (mode) => set({ mode }),
  setDiffMode: (diffMode) => set({ diffMode }),
  startRefresh: (projectId) => {
    const generation = (get().byProject[projectId]?.generation ?? 0) + 1;
    set((state) => ({
      byProject: {
        ...state.byProject,
        [projectId]: {
          ...(state.byProject[projectId] ?? blank),
          loading: true,
          generation,
        },
      },
    }));
    return generation;
  },
  invalidate: (projectId) => {
    const generation = (get().byProject[projectId]?.generation ?? 0) + 1;
    set((state) => ({
      byProject: {
        ...state.byProject,
        [projectId]: { ...(state.byProject[projectId] ?? blank), generation },
      },
    }));
    return generation;
  },
  refreshSucceeded: (projectId, generation, snapshot) =>
    set((state) =>
      state.byProject[projectId]?.generation === generation
        ? {
            byProject: {
              ...state.byProject,
              [projectId]: {
                snapshot,
                loading: false,
                staleError: null,
                generation,
              },
            },
          }
        : state,
    ),
  refreshFailed: (projectId, generation, staleError) =>
    set((state) =>
      state.byProject[projectId]?.generation === generation
        ? {
            byProject: {
              ...state.byProject,
              [projectId]: {
                ...(state.byProject[projectId] ?? blank),
                loading: false,
                staleError,
                generation,
              },
            },
          }
        : state,
    ),
}));
