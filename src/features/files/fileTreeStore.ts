import { create } from "zustand";
import type { CommandError, FileEntry } from "../../bindings";

export interface DirectoryState {
  status: "idle" | "loading" | "refreshing" | "ready" | "error";
  entries: FileEntry[];
  error?: CommandError;
}
interface FileTreeState {
  expandedByWorktree: Record<string, string[]>;
  directories: Record<string, DirectoryState>;
  generationByWorktree: Record<string, number>;
  toggle: (worktreeId: string, path: string) => void;
  expandAncestors: (worktreeId: string, path: string) => void;
  invalidateDirectories: (worktreeId: string, paths: string[]) => void;
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
  expandAncestors: (worktreeId, targetPath) =>
    set((state) => {
      const components = targetPath.split("/").filter(Boolean);
      const ancestors = components
        .slice(0, -1)
        .map((_, index) => components.slice(0, index + 1).join("/"));
      const current = state.expandedByWorktree[worktreeId] ?? [];
      const next = [...new Set([...current, ...ancestors])];
      if (next.length === current.length) return state;
      return {
        expandedByWorktree: {
          ...state.expandedByWorktree,
          [worktreeId]: next,
        },
      };
    }),
  invalidateDirectories: (worktreeId, paths) =>
    set((state) => ({
      directories: Object.fromEntries(
        Object.entries(state.directories).map(([key, directory]) => {
          if (!key.startsWith(`${worktreeId}:`)) return [key, directory];
          const cachedPath = key.slice(worktreeId.length + 1);
          return [
            key,
            paths.includes(cachedPath) ||
            directory.status === "loading" ||
            directory.status === "refreshing"
              ? { ...directory, status: "idle" as const }
              : directory,
          ];
        }),
      ),
      generationByWorktree: {
        ...state.generationByWorktree,
        [worktreeId]: (state.generationByWorktree[worktreeId] ?? 0) + 1,
      },
    })),
  setDirectory: (worktreeId, key, generation, directory) =>
    set((state) =>
      (state.generationByWorktree[worktreeId] ?? 0) === generation
        ? { directories: { ...state.directories, [key]: directory } }
        : state,
    ),
  invalidateWorktree: (worktreeId) =>
    set((state) => ({
      directories: Object.fromEntries(
        Object.entries(state.directories).map(([key, directory]) => [
          key,
          key.startsWith(`${worktreeId}:`)
            ? { ...directory, status: "idle" as const }
            : directory,
        ]),
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
