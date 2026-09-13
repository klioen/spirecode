import {
  RiAddLine,
  RiCloseLine,
  RiFileCopyLine,
  RiFolderOpenLine,
  RiGitRepositoryLine,
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
  return (
    <aside className="project-rail" aria-label="Projects">
      <div className="brand">
        <span className="brand-mark">π</span>
        <span>PI APP</span>
      </div>
      <div className="project-rail-heading">
        <span>PROJECTS</span>
        <button
          className="project-add"
          title="Open project"
          aria-label="Open project"
          onClick={() => void open()}
          disabled={store.loading}
        >
          {store.loading ? (
            <span className="spinner" />
          ) : (
            <RiAddLine size={16} />
          )}
        </button>
      </div>
      <div className="project-list">
        {store.projects.map((project) => {
          const active = store.activeProjectId === project.id;
          return (
            <div
              className={`project-row ${active ? "active" : ""}`}
              key={project.id}
            >
              <button
                className="project-name"
                aria-current={active ? "page" : undefined}
                aria-label={project.name}
                onClick={() => store.selectProject(project.id)}
                onDoubleClick={() =>
                  void runProjectAction(() => projectsApi.reveal(project.id))
                }
                title={`${project.path} · Double-click to reveal`}
              >
                <RiGitRepositoryLine size={15} />
                <span>{project.name}</span>
              </button>
              {active && (
                <div className="project-actions">
                  <button
                    title="Copy project path"
                    aria-label={`Copy ${project.name} path`}
                    onClick={() =>
                      void runProjectAction(() =>
                        projectsApi.copyPath(project.id),
                      )
                    }
                  >
                    <RiFileCopyLine size={14} />
                  </button>
                  <button
                    title="Close project"
                    aria-label={`Close ${project.name}`}
                    onClick={() => void close(project.id)}
                  >
                    <RiCloseLine size={14} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {store.projects.length === 0 && (
        <button className="project-empty" onClick={() => void open()}>
          <RiFolderOpenLine size={20} />
          <span>No projects</span>
          <small>Open a Git repository</small>
        </button>
      )}
    </aside>
  );
}
