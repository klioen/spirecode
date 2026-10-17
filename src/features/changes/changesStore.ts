import { create } from "zustand";
import type { CommandError, GitStatus } from "../../bindings";

interface SnapshotState {
  snapshot: GitStatus | null;
  loading: boolean;
  staleError: CommandError | null;
  generation: number;
}
export interface GitOperationState {
  kind: "stage" | "unstage" | "discard" | "commit";
  paths: string[];
}

interface ChangesState {
  byWorktree: Record<string, SnapshotState>;
  mode: "list" | "tree";
  diffMode: "unified" | "split";
  commitDraftByWorktree: Record<string, string>;
  operationByWorktree: Record<string, GitOperationState | null>;
  operationErrorByWorktree: Record<string, CommandError | null>;
  setCommitDraft: (worktreeId: string, value: string) => void;
  beginOperation: (worktreeId: string, operation: GitOperationState) => boolean;
  finishOperation: (worktreeId: string) => void;
  failOperation: (worktreeId: string, error: CommandError) => void;
  clearOperationError: (worktreeId: string) => void;
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
  commitDraftByWorktree: {},
  operationByWorktree: {},
  operationErrorByWorktree: {},
  setCommitDraft: (worktreeId, value) =>
    set((state) => ({
      commitDraftByWorktree: {
        ...state.commitDraftByWorktree,
        [worktreeId]: value,
      },
    })),
  beginOperation: (worktreeId, operation) => {
    if (get().operationByWorktree[worktreeId]) return false;
    set((state) => ({
      operationByWorktree: {
        ...state.operationByWorktree,
        [worktreeId]: operation,
      },
      operationErrorByWorktree: {
        ...state.operationErrorByWorktree,
        [worktreeId]: null,
      },
    }));
    return true;
  },
  finishOperation: (worktreeId) =>
    set((state) => ({
      operationByWorktree: {
        ...state.operationByWorktree,
        [worktreeId]: null,
      },
      operationErrorByWorktree: {
        ...state.operationErrorByWorktree,
        [worktreeId]: null,
      },
    })),
  failOperation: (worktreeId, error) =>
    set((state) => ({
      operationByWorktree: {
        ...state.operationByWorktree,
        [worktreeId]: null,
      },
      operationErrorByWorktree: {
        ...state.operationErrorByWorktree,
        [worktreeId]: error,
      },
    })),
  clearOperationError: (worktreeId) =>
    set((state) => ({
      operationErrorByWorktree: {
        ...state.operationErrorByWorktree,
        [worktreeId]: null,
      },
    })),
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
      const commitDraftByWorktree = { ...state.commitDraftByWorktree };
      const operationByWorktree = { ...state.operationByWorktree };
      const operationErrorByWorktree = { ...state.operationErrorByWorktree };
      delete byWorktree[worktreeId];
      delete commitDraftByWorktree[worktreeId];
      delete operationByWorktree[worktreeId];
      delete operationErrorByWorktree[worktreeId];
      return {
        byWorktree,
        commitDraftByWorktree,
        operationByWorktree,
        operationErrorByWorktree,
      };
    }),
}));
