import {
  RiAddLine,
  RiCloseLine,
  RiFolderOpenLine,
  RiGitRepositoryLine,
  RiMore2Fill,
} from "@remixicon/react";
import { commandError } from "../../lib/errors";
import { projectsApi } from "./projectsApi";
import { useProjectsStore } from "./projectsStore";

export function ProjectRail() {
  const store = useProjectsStore();
  const open = async () => {
    store.setLoading(true);
    try {
      const project = await projectsApi.openDialog();
      if (project) store.addProject(project);
    } catch (error) {
      store.setError(commandError(error));
    } finally {
      store.setLoading(false);
    }
  };
  const runProjectAction = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      store.setError(commandError(error));
    }
  };
  const close = async (projectId: string) => {
    await runProjectAction(async () => {
      await projectsApi.close(projectId);
      store.removeProject(projectId);
    });
  };
  const activeProject = store.projects.find(
    ({ id }) => id === store.activeProjectId,
  );
  return (
    <aside className="project-rail" aria-label="Projects">
      <div className="brand">
        <span className="brand-mark">π</span>
        <span>PI</span>
      </div>
      <div className="rail-label">PROJECTS</div>
      <div className="project-list">
        {store.projects.map((project) => (
          <button
            className={`project-tile ${store.activeProjectId === project.id ? "active" : ""}`}
            key={project.id}
            onClick={() => store.selectProject(project.id)}
            onDoubleClick={() =>
              void runProjectAction(() => projectsApi.reveal(project.id))
            }
            title={`${project.path} · Double-click to reveal`}
          >
            <RiGitRepositoryLine size={18} />
            <span>{project.name.slice(0, 2).toUpperCase()}</span>
            <span className="project-dot" />
          </button>
        ))}
      </div>
      <div className="rail-spacer" />
      {store.activeProjectId && (
        <button
          className="rail-icon"
          title="Close project"
          onClick={() => void close(store.activeProjectId!)}
        >
          <RiCloseLine size={18} />
        </button>
      )}
      <button
        className="rail-icon"
        title="Open project"
        onClick={() => void open()}
        disabled={store.loading}
      >
        {store.loading ? <span className="spinner" /> : <RiAddLine size={20} />}
      </button>
      <button
        className="rail-icon muted"
        title="Copy project path"
        disabled={!activeProject}
        onClick={() =>
          activeProject &&
          void runProjectAction(() => projectsApi.copyPath(activeProject.id))
        }
      >
        <RiMore2Fill size={18} />
      </button>
      {store.projects.length === 0 && (
        <RiFolderOpenLine className="rail-watermark" size={22} />
      )}
    </aside>
  );
}
