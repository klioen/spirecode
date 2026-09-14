import { create } from "zustand";
import type { CommandError, FileEntry } from "../../bindings";

export interface DirectoryState {
  status: "idle" | "loading" | "ready" | "error";
  entries: FileEntry[];
  error?: CommandError;
}
interface FileTreeState {
  expandedByWorktree: Record<string, string[]>;
  directories: Record<string, DirectoryState>;
  generationByWorktree: Record<string, number>;
  toggle: (worktreeId: string, path: string) => void;
  setDirectory: (
    worktreeId: string,
    key: string,
    generation: number,
    directory: DirectoryState,
  ) => void;
  invalidateWorktree: (worktreeId: string) => void;
  clearWorktree: (worktreeId: string) => void;
}
export const directoryKey = (worktreeId: string, path: string) =>
  `${worktreeId}:${path}`;
export const useFileTreeStore = create<FileTreeState>((set) => ({
  expandedByWorktree: {},
  directories: {},
  generationByWorktree: {},
  toggle: (worktreeId, path) =>
    set((state) => {
      const expanded = state.expandedByWorktree[worktreeId] ?? [];
      return {
        expandedByWorktree: {
          ...state.expandedByWorktree,
          [worktreeId]: expanded.includes(path)
            ? expanded.filter((value) => value !== path)
            : [...expanded, path],
        },
      };
    }),
  setDirectory: (worktreeId, key, generation, directory) =>
    set((state) =>
      (state.generationByWorktree[worktreeId] ?? 0) === generation
        ? { directories: { ...state.directories, [key]: directory } }
        : state,
    ),
  invalidateWorktree: (worktreeId) =>
    set((state) => ({
      directories: Object.fromEntries(
        Object.entries(state.directories).filter(
          ([key]) => !key.startsWith(`${worktreeId}:`),
        ),
      ),
      generationByWorktree: {
        ...state.generationByWorktree,
        [worktreeId]: (state.generationByWorktree[worktreeId] ?? 0) + 1,
      },
    })),
  clearWorktree: (worktreeId) =>
    set((state) => {
      const expandedByWorktree = { ...state.expandedByWorktree };
      const generationByWorktree = { ...state.generationByWorktree };
      delete expandedByWorktree[worktreeId];
      delete generationByWorktree[worktreeId];
      return {
        expandedByWorktree,
        generationByWorktree,
        directories: Object.fromEntries(
          Object.entries(state.directories).filter(
            ([key]) => !key.startsWith(`${worktreeId}:`),
          ),
        ),
      };
    }),
}));
