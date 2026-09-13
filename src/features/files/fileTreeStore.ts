import { create } from "zustand";
import type { CommandError, FileEntry } from "../../bindings";

export interface DirectoryState {
  status: "idle" | "loading" | "ready" | "error";
  entries: FileEntry[];
  error?: CommandError;
}
interface FileTreeState {
  expandedByProject: Record<string, string[]>;
  directories: Record<string, DirectoryState>;
  generationByProject: Record<string, number>;
  toggle: (projectId: string, path: string) => void;
  setDirectory: (
    projectId: string,
    key: string,
    generation: number,
    directory: DirectoryState,
  ) => void;
  invalidateProject: (projectId: string) => void;
}
export const directoryKey = (projectId: string, path: string) =>
  `${projectId}:${path}`;
export const useFileTreeStore = create<FileTreeState>((set) => ({
  expandedByProject: {},
  directories: {},
  generationByProject: {},
  toggle: (projectId, path) =>
    set((state) => {
      const expanded = state.expandedByProject[projectId] ?? [];
      return {
        expandedByProject: {
          ...state.expandedByProject,
          [projectId]: expanded.includes(path)
            ? expanded.filter((value) => value !== path)
            : [...expanded, path],
        },
      };
    }),
  setDirectory: (projectId, key, generation, directory) =>
    set((state) =>
      (state.generationByProject[projectId] ?? 0) === generation
        ? { directories: { ...state.directories, [key]: directory } }
        : state,
    ),
  invalidateProject: (projectId) =>
    set((state) => ({
      directories: Object.fromEntries(
        Object.entries(state.directories).filter(
          ([key]) => !key.startsWith(`${projectId}:`),
        ),
      ),
      generationByProject: {
        ...state.generationByProject,
        [projectId]: (state.generationByProject[projectId] ?? 0) + 1,
      },
    })),
}));
