import { useEffect, useRef, useState } from "react";
import {
  RiAddLine,
  RiArrowRightSLine,
  RiFolderOpenLine,
  RiGitBranchLine,
  RiGitRepositoryLine,
  RiMore2Fill,
} from "@remixicon/react";
import type { WorktreeSummary } from "../../bindings";
import { commandError } from "../../lib/errors";
import { projectsApi } from "./projectsApi";
import { useProjectsStore } from "./projectsStore";
import {
  DeleteWorktreeDialog,
  NewWorktreeDialog,
  RenameWorktreeDialog,
} from "./WorktreeDialog";

type DialogState =
  | { type: "new"; projectId: string; projectName: string }
  | { type: "rename"; worktree: WorktreeSummary }
  | { type: "delete"; worktree: WorktreeSummary }
  | null;

export function ProjectRail() {
  const store = useProjectsStore();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [menuWorktreeId, setMenuWorktreeId] = useState<string | null>(null);
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);
  const [projectActionPending, setProjectActionPending] = useState<
    string | null
  >(null);
  const openMenuRowRef = useRef<HTMLDivElement | null>(null);
  const projectMenuRef = useRef<HTMLDivElement | null>(null);
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(
    () => new Set(),
  );
  useEffect(() => {
    if (!menuWorktreeId && !menuProjectId) return;

    const closeMenuOnOutsidePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!openMenuRowRef.current?.contains(event.target))
        setMenuWorktreeId(null);
      if (!projectMenuRef.current?.contains(event.target))
        setMenuProjectId(null);
    };

    document.addEventListener("pointerdown", closeMenuOnOutsidePointerDown);
    return () =>
      document.removeEventListener(
        "pointerdown",
        closeMenuOnOutsidePointerDown,
      );
  }, [menuProjectId, menuWorktreeId]);
  const toggleProject = (projectId: string) => {
    setExpandedProjectIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
    setMenuWorktreeId(null);
    setMenuProjectId(null);
  };
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
  const select = async (worktreeId: string) => {
    try {
      await projectsApi.selectWorktree(worktreeId);
      store.selectWorktree(worktreeId);
    } catch (error) {
      store.setError(commandError(error));
    }
  };
  const reveal = async (worktreeId: string) => {
    try {
      await projectsApi.revealWorktree(worktreeId);
    } catch (error) {
      store.setError(commandError(error));
    }
  };
  const revealProject = async (projectId: string) => {
    setProjectActionPending(projectId);
    try {
      await projectsApi.reveal(projectId);
    } catch (error) {
      store.setError(commandError(error));
    } finally {
      setProjectActionPending(null);
      setMenuProjectId(null);
    }
  };
  const closeProject = async (projectId: string) => {
    setProjectActionPending(projectId);
    try {
      await projectsApi.close(projectId);
      store.removeProject(projectId);
      setMenuProjectId(null);
    } catch (error) {
      store.setError(commandError(error));
    } finally {
      setProjectActionPending(null);
    }
  };
  return (
    <aside className="project-rail" aria-label="Projects">
      <div className="brand">
        <span className="brand-mark">S</span>
        <span>SPIRECODE</span>
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
          const expanded = expandedProjectIds.has(project.id);
          return (
            <section className="project-group" key={project.id}>
              <div className="project-heading">
                <button
                  className="project-name"
                  title={project.path}
                  aria-label={`${expanded ? "Collapse" : "Expand"} ${project.name}`}
                  aria-expanded={expanded}
                  onClick={() => toggleProject(project.id)}
                >
                  <RiArrowRightSLine
                    className={`project-chevron ${expanded ? "expanded" : ""}`}
                    size={15}
                  />
                  <RiGitRepositoryLine size={15} />
                  <span>{project.name}</span>
                </button>
                <button
                  className="worktree-add"
                  aria-label={`Create worktree for ${project.name}`}
                  title={`Create worktree for ${project.name}`}
                  disabled={store.creatingProjectId === project.id}
                  onClick={() =>
                    setDialog({
                      type: "new",
                      projectId: project.id,
                      projectName: project.name,
                    })
                  }
                >
                  <RiAddLine size={15} />
                </button>
                <div
                  className="project-menu-container"
                  ref={
                    menuProjectId === project.id ? projectMenuRef : undefined
                  }
                >
                  <button
                    className="project-menu-button"
                    aria-label={`Manage ${project.name}`}
                    title={`Manage ${project.name}`}
                    aria-expanded={menuProjectId === project.id}
                    onClick={() => {
                      setMenuWorktreeId(null);
                      setMenuProjectId(
                        menuProjectId === project.id ? null : project.id,
                      );
                    }}
                  >
                    <RiMore2Fill size={15} />
                  </button>
                  {menuProjectId === project.id && (
                    <div className="project-menu" role="menu">
                      <button
                        role="menuitem"
                        disabled={projectActionPending === project.id}
                        onClick={() => void revealProject(project.id)}
                      >
                        Reveal in Finder
                      </button>

                      <button
                        role="menuitem"
                        className="danger-text"
                        disabled={projectActionPending === project.id}
                        onClick={() => void closeProject(project.id)}
                      >
                        Close project
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {expanded && (
                <div className="worktree-list">
                  {project.worktrees.map((worktree) => {
                    const active = worktree.id === store.activeWorktreeId;
                    const managed = worktree.kind === "managed";
                    return (
                      <div
                        className={`worktree-row ${active ? "active" : ""}`}
                        key={worktree.id}
                        ref={
                          menuWorktreeId === worktree.id
                            ? openMenuRowRef
                            : undefined
                        }
                        onContextMenu={(event) => {
                          if (!managed) return;
                          event.preventDefault();
                          setMenuWorktreeId(worktree.id);
                        }}
                      >
                        <button
                          className="worktree-name"
                          aria-current={active ? "page" : undefined}
                          aria-label={worktree.name}
                          title={`${worktree.path} · ${worktree.branch} · Double-click to reveal`}
                          onClick={() => void select(worktree.id)}
                          onDoubleClick={() => void reveal(worktree.id)}
                        >
                          <RiGitBranchLine size={14} />
                          <span>{worktree.name}</span>
                        </button>
                        {managed && (
                          <button
                            className="worktree-menu-button"
                            aria-label={`Manage ${worktree.name}`}
                            onClick={() =>
                              setMenuWorktreeId(
                                menuWorktreeId === worktree.id
                                  ? null
                                  : worktree.id,
                              )
                            }
                          >
                            <RiMore2Fill size={15} />
                          </button>
                        )}
                        {menuWorktreeId === worktree.id && (
                          <div className="worktree-menu" role="menu">
                            <button
                              role="menuitem"
                              onClick={() => {
                                setMenuWorktreeId(null);
                                setDialog({ type: "rename", worktree });
                              }}
                            >
                              Rename
                            </button>
                            <button
                              role="menuitem"
                              className="danger-text"
                              onClick={() => {
                                setMenuWorktreeId(null);
                                setDialog({ type: "delete", worktree });
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {store.creatingProjectId === project.id && (
                    <div className="worktree-progress">
                      <span className="spinner" />
                      Creating worktree…
                    </div>
                  )}
                </div>
              )}
            </section>
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
      {dialog?.type === "new" && (
        <NewWorktreeDialog
          projectId={dialog.projectId}
          projectName={dialog.projectName}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === "rename" && (
        <RenameWorktreeDialog
          worktree={dialog.worktree}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === "delete" && (
        <DeleteWorktreeDialog
          worktree={dialog.worktree}
          onClose={() => setDialog(null)}
        />
      )}
    </aside>
  );
}
