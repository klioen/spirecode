import { create } from "zustand";
import type {
  CommandError,
  ProjectCatalog,
  ProjectSummary,
  WorktreeSummary,
} from "../../bindings";

interface ProjectsState {
  projects: ProjectSummary[];
  activeWorktreeId: string | null;
  loading: boolean;
  creatingProjectId: string | null;
  error: CommandError | null;
  setLoading: (loading: boolean) => void;
  setCreatingProject: (projectId: string | null) => void;
  setError: (error: CommandError | null) => void;
  setProjects: (projects: ProjectSummary[]) => void;
  hydrateCatalog: (catalog: ProjectCatalog) => void;
  setCatalog: (catalog: ProjectCatalog) => void;
  addProject: (project: ProjectSummary) => void;
  removeProject: (projectId: string) => void;
  selectWorktree: (worktreeId: string | null) => void;
  addWorktree: (worktree: WorktreeSummary) => void;
  updateWorktree: (worktree: WorktreeSummary) => void;
  removeWorktree: (worktreeId: string) => void;
}

const containsWorktree = (projects: ProjectSummary[], worktreeId: string) =>
  projects.some((project) =>
    project.worktrees.some((worktree) => worktree.id === worktreeId),
  );
const firstWorktreeId = (projects: ProjectSummary[]) =>
  projects[0]?.worktrees.find(({ kind }) => kind === "main")?.id ??
  projects[0]?.worktrees[0]?.id ??
  null;

export const useProjectsStore = create<ProjectsState>((set) => ({
  projects: [],
  activeWorktreeId: null,
  loading: false,
  creatingProjectId: null,
  error: null,
  setLoading: (loading) => set({ loading }),
  setCreatingProject: (creatingProjectId) => set({ creatingProjectId }),
  setError: (error) => set({ error }),
  setProjects: (projects) =>
    set((state) => ({
      projects,
      activeWorktreeId:
        state.activeWorktreeId &&
        containsWorktree(projects, state.activeWorktreeId)
          ? state.activeWorktreeId
          : firstWorktreeId(projects),
    })),
  hydrateCatalog: (catalog) =>
    set({
      projects: catalog.projects,
      activeWorktreeId:
        catalog.activeWorktreeId &&
        containsWorktree(catalog.projects, catalog.activeWorktreeId)
          ? catalog.activeWorktreeId
          : firstWorktreeId(catalog.projects),
    }),
  setCatalog: (catalog) =>
    set({
      projects: catalog.projects,
      activeWorktreeId:
        catalog.activeWorktreeId &&
        containsWorktree(catalog.projects, catalog.activeWorktreeId)
          ? catalog.activeWorktreeId
          : firstWorktreeId(catalog.projects),
    }),
  addProject: (project) =>
    set((state) => ({
      projects: [
        project,
        ...state.projects.filter(({ id }) => id !== project.id),
      ],
      activeWorktreeId:
        project.worktrees.find(({ kind }) => kind === "main")?.id ??
        project.worktrees[0]?.id ??
        state.activeWorktreeId,
      error: null,
    })),
  removeProject: (projectId) =>
    set((state) => {
      const removed = state.projects.find(({ id }) => id === projectId);
      const projects = state.projects.filter(({ id }) => id !== projectId);
      const activeWasRemoved = removed?.worktrees.some(
        ({ id }) => id === state.activeWorktreeId,
      );
      return {
        projects,
        activeWorktreeId: activeWasRemoved
          ? firstWorktreeId(projects)
          : state.activeWorktreeId,
      };
    }),
  selectWorktree: (activeWorktreeId) => set({ activeWorktreeId }),
  addWorktree: (worktree) =>
    set((state) => ({
      projects: state.projects.map((project) =>
        project.id === worktree.projectId
          ? {
              ...project,
              worktrees: [
                ...project.worktrees.filter(({ id }) => id !== worktree.id),
                worktree,
              ],
            }
          : project,
      ),
      activeWorktreeId: worktree.id,
      error: null,
    })),
  updateWorktree: (worktree) =>
    set((state) => ({
      projects: state.projects.map((project) =>
        project.id === worktree.projectId
          ? {
              ...project,
              worktrees: project.worktrees.map((current) =>
                current.id === worktree.id ? worktree : current,
              ),
            }
          : project,
      ),
      error: null,
    })),
  removeWorktree: (worktreeId) =>
    set((state) => {
      const owner = state.projects.find((project) =>
        project.worktrees.some(({ id }) => id === worktreeId),
      );
      const projects = state.projects.map((project) => ({
        ...project,
        worktrees: project.worktrees.filter(({ id }) => id !== worktreeId),
      }));
      const fallback = owner?.worktrees.find(({ kind }) => kind === "main")?.id;
      return {
        projects,
        activeWorktreeId:
          state.activeWorktreeId === worktreeId
            ? (fallback ?? firstWorktreeId(projects))
            : state.activeWorktreeId,
      };
    }),
}));
