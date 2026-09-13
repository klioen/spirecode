import { create } from "zustand";
import type { CommandError, ProjectSummary } from "../../bindings";

interface ProjectsState {
  projects: ProjectSummary[];
  activeProjectId: string | null;
  loading: boolean;
  error: CommandError | null;
  setLoading: (loading: boolean) => void;
  setError: (error: CommandError | null) => void;
  setProjects: (projects: ProjectSummary[]) => void;
  addProject: (project: ProjectSummary) => void;
  removeProject: (projectId: string) => void;
  selectProject: (projectId: string | null) => void;
}

export const useProjectsStore = create<ProjectsState>((set) => ({
  projects: [],
  activeProjectId: null,
  loading: false,
  error: null,
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setProjects: (projects) =>
    set((state) => ({
      projects,
      activeProjectId:
        state.activeProjectId &&
        projects.some(({ id }) => id === state.activeProjectId)
          ? state.activeProjectId
          : (projects[0]?.id ?? null),
    })),
  addProject: (project) =>
    set((state) => ({
      projects: [
        project,
        ...state.projects.filter(({ id }) => id !== project.id),
      ],
      activeProjectId: project.id,
      error: null,
    })),
  removeProject: (projectId) =>
    set((state) => {
      const projects = state.projects.filter(({ id }) => id !== projectId);
      return {
        projects,
        activeProjectId:
          state.activeProjectId === projectId
            ? (projects[0]?.id ?? null)
            : state.activeProjectId,
      };
    }),
  selectProject: (activeProjectId) => set({ activeProjectId }),
}));
