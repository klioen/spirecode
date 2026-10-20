import { useEffect, useRef, useState } from "react";
import {
  RiAddLine,
  RiArrowRightSLine,
  RiFolderAddLine,
  RiFolderLine,
  RiFolderOpenLine,
  RiGitBranchLine,
  RiGitRepositoryLine,
  RiLayoutLeftLine,
  RiMore2Fill,
  RiSettings3Line,
} from "@remixicon/react";
import type {
  ProjectGroupSummary,
  ProjectSummary,
  WorktreeSummary,
} from "../../bindings";
import { chatRuntime, useActiveChatWorktrees } from "../chat/chatRuntime";
import { SpireCodeMark } from "../../components/SpireCodeMark";
import { Tooltip } from "../../components/Tooltip";
import { useTranslation } from "../../i18n";
import { commandError } from "../../lib/errors";
import { projectsApi } from "./projectsApi";
import {
  CreateProjectGroupDialog,
  DeleteProjectGroupDialog,
  MoveProjectDialog,
  RenameProjectGroupDialog,
} from "./ProjectGroupDialog";
import { useProjectsStore } from "./projectsStore";
import {
  DeleteWorktreeDialog,
  NewWorktreeDialog,
  RenameWorktreeDialog,
} from "./WorktreeDialog";

type DialogState =
  | { type: "new-worktree"; projectId: string; projectName: string }
  | { type: "rename-worktree"; worktree: WorktreeSummary }
  | { type: "delete-worktree"; worktree: WorktreeSummary }
  | { type: "create-group" }
  | { type: "rename-group"; group: ProjectGroupSummary }
  | { type: "delete-group"; group: ProjectGroupSummary; projectCount: number }
  | { type: "move-project"; project: ProjectSummary }
  | null;

const UNGROUPED_ID = "__ungrouped__";

export function ProjectRail({
  onToggleProjects = () => undefined,
  onOpenSettings = () => undefined,
}: {
  onToggleProjects?: () => void;
  onOpenSettings?: () => void;
}) {
  const { t } = useTranslation();
  const store = useProjectsStore();
  const activeChatWorktrees = useActiveChatWorktrees();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [menuWorktreeId, setMenuWorktreeId] = useState<string | null>(null);
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);
  const [menuGroupId, setMenuGroupId] = useState<string | null>(null);
  const [projectActionPending, setProjectActionPending] = useState<
    string | null
  >(null);
  const openMenuRowRef = useRef<HTMLDivElement | null>(null);
  const projectMenuRef = useRef<HTMLDivElement | null>(null);
  const groupMenuRef = useRef<HTMLDivElement | null>(null);
  const dialogReturnFocusTargetRef = useRef<string | null>(null);
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    if (!menuWorktreeId && !menuProjectId && !menuGroupId) return;
    const closeMenuOnOutsidePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!openMenuRowRef.current?.contains(event.target))
        setMenuWorktreeId(null);
      if (!projectMenuRef.current?.contains(event.target))
        setMenuProjectId(null);
      if (!groupMenuRef.current?.contains(event.target)) setMenuGroupId(null);
    };
    document.addEventListener("pointerdown", closeMenuOnOutsidePointerDown);
    return () =>
      document.removeEventListener(
        "pointerdown",
        closeMenuOnOutsidePointerDown,
      );
  }, [menuGroupId, menuProjectId, menuWorktreeId]);

  const closeMenus = () => {
    setMenuWorktreeId(null);
    setMenuProjectId(null);
    setMenuGroupId(null);
  };
  const closeDialog = () => {
    const returnFocusTarget = dialogReturnFocusTargetRef.current;
    dialogReturnFocusTargetRef.current = null;
    setDialog(null);
    if (returnFocusTarget) {
      requestAnimationFrame(() => {
        const target = Array.from(
          document.querySelectorAll<HTMLButtonElement>(
            "[data-dialog-return-focus]",
          ),
        ).find(
          (element) => element.dataset.dialogReturnFocus === returnFocusTarget,
        );
        target?.focus();
      });
    }
  };
  const toggleProject = (projectId: string) => {
    setExpandedProjectIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
    closeMenus();
  };
  const toggleGroup = (groupId: string) => {
    setCollapsedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
    closeMenus();
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
      const project = store.projects.find(({ id }) => id === projectId);
      for (const worktree of project?.worktrees ?? [])
        chatRuntime.removeWorktree(worktree.id);
      store.removeProject(projectId);
      setMenuProjectId(null);
    } catch (error) {
      store.setError(commandError(error));
    } finally {
      setProjectActionPending(null);
    }
  };

  const renderProject = (project: ProjectSummary) => {
    const directory = project.kind === "directory";
    const expanded = !directory && expandedProjectIds.has(project.id);
    const primaryWorkspace =
      project.worktrees.find(({ kind }) => kind === "main") ??
      project.worktrees[0];
    const projectSessionActive = project.worktrees.some(({ id }) =>
      activeChatWorktrees.has(id),
    );
    return (
      <section className="project-entry" key={project.id}>
        <div className="project-heading">
          <button
            className="project-name"
            title={project.path}
            aria-label={t(
              directory
                ? "projects.open"
                : expanded
                  ? "projects.collapse"
                  : "projects.expand",
              { name: project.name },
            )}
            aria-expanded={directory ? undefined : expanded}
            onClick={() => {
              if (directory) {
                if (primaryWorkspace) void select(primaryWorkspace.id);
                return;
              }
              toggleProject(project.id);
            }}
          >
            {!directory && (
              <RiArrowRightSLine
                className={`project-chevron ${expanded ? "expanded" : ""}`}
                size={15}
              />
            )}
            {directory ? (
              <RiFolderLine size={15} />
            ) : (
              <RiGitRepositoryLine size={15} />
            )}
            <span>{project.name}</span>
            {projectSessionActive && (
              <span
                className="spinner project-session-spinner"
                aria-label={t("projects.sessionActive")}
              />
            )}
          </button>
          {!directory && (
            <button
              className="worktree-add"
              aria-label={t("projects.createWorktreeFor", {
                name: project.name,
              })}
              title={t("projects.createWorktreeFor", { name: project.name })}
              disabled={store.creatingProjectId === project.id}
              onClick={() =>
                setDialog({
                  type: "new-worktree",
                  projectId: project.id,
                  projectName: project.name,
                })
              }
            >
              <RiAddLine size={15} />
            </button>
          )}
          <div
            className="project-menu-container"
            ref={menuProjectId === project.id ? projectMenuRef : undefined}
          >
            <button
              className="project-menu-button"
              data-dialog-return-focus={`project:${project.id}`}
              aria-label={t("projects.manage", { name: project.name })}
              title={t("projects.manage", { name: project.name })}
              aria-expanded={menuProjectId === project.id}
              onClick={() => {
                setMenuWorktreeId(null);
                setMenuGroupId(null);
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
                  onClick={() => {
                    dialogReturnFocusTargetRef.current = `project:${project.id}`;
                    setMenuProjectId(null);
                    setDialog({ type: "move-project", project });
                  }}
                >
                  {t("projects.group.move")}
                </button>
                <button
                  role="menuitem"
                  disabled={projectActionPending === project.id}
                  onClick={() => void revealProject(project.id)}
                >
                  {t("projects.revealFinder")}
                </button>
                <button
                  role="menuitem"
                  className="danger-text"
                  disabled={projectActionPending === project.id}
                  onClick={() => void closeProject(project.id)}
                >
                  {t("projects.close")}
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
                    menuWorktreeId === worktree.id ? openMenuRowRef : undefined
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
                    title={t("projects.worktree.revealTitle", {
                      path: worktree.path,
                      branch: worktree.branch,
                    })}
                    onClick={() => void select(worktree.id)}
                    onDoubleClick={() => void reveal(worktree.id)}
                  >
                    <RiGitBranchLine size={14} />
                    <span>{worktree.name}</span>
                    {activeChatWorktrees.has(worktree.id) && (
                      <span
                        className="spinner project-session-spinner"
                        aria-label={t("projects.sessionActive")}
                      />
                    )}
                  </button>
                  {managed && (
                    <button
                      className="worktree-menu-button"
                      aria-label={t("projects.manage", { name: worktree.name })}
                      onClick={() =>
                        setMenuWorktreeId(
                          menuWorktreeId === worktree.id ? null : worktree.id,
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
                          setDialog({ type: "rename-worktree", worktree });
                        }}
                      >
                        {t("projects.worktree.rename")}
                      </button>
                      <button
                        role="menuitem"
                        className="danger-text"
                        onClick={() => {
                          setMenuWorktreeId(null);
                          setDialog({ type: "delete-worktree", worktree });
                        }}
                      >
                        {t("projects.worktree.delete")}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {store.creatingProjectId === project.id && (
              <div className="worktree-progress">
                <span className="spinner" />
                {t("projects.worktree.creating")}
              </div>
            )}
          </div>
        )}
      </section>
    );
  };

  const ungrouped = store.projects.filter(({ groupId }) => groupId === null);
  const sections = [
    ...store.groups.map((group) => ({
      id: group.id,
      name: group.name,
      group,
      projects: store.projects.filter(({ groupId }) => groupId === group.id),
    })),
    ...(ungrouped.length > 0
      ? [
          {
            id: UNGROUPED_ID,
            name: t("projects.group.ungrouped"),
            group: null,
            projects: ungrouped,
          },
        ]
      : []),
  ];

  return (
    <aside className="project-rail" aria-label={t("projects.label")}>
      <div className="brand">
        <SpireCodeMark className="brand-mark" />
        <span>SPIRECODE</span>
        <Tooltip label={t("workbench.toggleProjects")} align="end">
          <button
            className="project-panel-toggle"
            type="button"
            aria-label={t("workbench.toggleProjects")}
            onClick={onToggleProjects}
          >
            <RiLayoutLeftLine size={16} />
          </button>
        </Tooltip>
      </div>
      <div className="project-rail-heading">
        <span>{t("projects.heading")}</span>
        <div className="project-rail-actions">
          <button
            className="project-add"
            title={t("projects.group.create")}
            aria-label={t("projects.group.create")}
            onClick={() => setDialog({ type: "create-group" })}
          >
            <RiFolderAddLine size={16} />
          </button>
          <button
            className="project-add"
            data-action="open-project"
            title={t("workbench.openProject")}
            aria-label={t("workbench.openProject")}
            onClick={() => void open()}
            disabled={store.loading}
          >
            {store.loading ? (
              <span className="spinner" />
            ) : (
              <RiFolderOpenLine size={16} />
            )}
          </button>
        </div>
      </div>
      <div className="project-list">
        {sections.map((section) => {
          const expanded = !collapsedGroupIds.has(section.id);
          const sessionActive = section.projects.some((project) =>
            project.worktrees.some(({ id }) => activeChatWorktrees.has(id)),
          );
          return (
            <section className="project-section" key={section.id}>
              <div className="project-group-heading">
                <button
                  className="project-group-name"
                  aria-expanded={expanded}
                  aria-label={t(
                    expanded
                      ? "projects.group.collapse"
                      : "projects.group.expand",
                    { name: section.name },
                  )}
                  onClick={() => toggleGroup(section.id)}
                >
                  <RiArrowRightSLine
                    className={`project-chevron ${expanded ? "expanded" : ""}`}
                    size={15}
                  />
                  <RiFolderLine size={14} />
                  <span>{section.name}</span>
                  {sessionActive && (
                    <span
                      className="spinner project-session-spinner"
                      aria-label={t("projects.sessionActive")}
                    />
                  )}
                </button>
                {section.group && (
                  <div
                    className="project-menu-container"
                    ref={menuGroupId === section.id ? groupMenuRef : undefined}
                  >
                    <button
                      className="project-group-menu-button"
                      data-dialog-return-focus={`group:${section.id}`}
                      aria-label={t("projects.group.manage", {
                        name: section.name,
                      })}
                      aria-expanded={menuGroupId === section.id}
                      onClick={() => {
                        setMenuProjectId(null);
                        setMenuWorktreeId(null);
                        setMenuGroupId(
                          menuGroupId === section.id ? null : section.id,
                        );
                      }}
                    >
                      <RiMore2Fill size={15} />
                    </button>
                    {menuGroupId === section.id && (
                      <div
                        className="project-menu project-group-menu"
                        role="menu"
                      >
                        <button
                          role="menuitem"
                          onClick={() => {
                            dialogReturnFocusTargetRef.current = `group:${section.id}`;
                            setMenuGroupId(null);
                            setDialog({
                              type: "rename-group",
                              group: section.group!,
                            });
                          }}
                        >
                          {t("projects.group.rename")}
                        </button>
                        <button
                          role="menuitem"
                          className="danger-text"
                          onClick={() => {
                            dialogReturnFocusTargetRef.current = `group:${section.id}`;
                            setMenuGroupId(null);
                            setDialog({
                              type: "delete-group",
                              group: section.group!,
                              projectCount: section.projects.length,
                            });
                          }}
                        >
                          {t("projects.group.delete")}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {expanded && (
                <div className="project-group-projects">
                  {section.projects.map(renderProject)}
                </div>
              )}
            </section>
          );
        })}
      </div>
      {store.projects.length === 0 && (
        <button className="project-empty" onClick={() => void open()}>
          <RiFolderOpenLine size={20} />
          <span>{t("projects.empty")}</span>
          <small>{t("projects.empty.action")}</small>
        </button>
      )}
      <div className="project-rail-footer">
        <button type="button" onClick={onOpenSettings}>
          <RiSettings3Line size={15} />
          <span>{t("workbench.settings")}</span>
        </button>
      </div>
      {dialog?.type === "new-worktree" && (
        <NewWorktreeDialog
          projectId={dialog.projectId}
          projectName={dialog.projectName}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === "rename-worktree" && (
        <RenameWorktreeDialog
          worktree={dialog.worktree}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === "delete-worktree" && (
        <DeleteWorktreeDialog
          worktree={dialog.worktree}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === "create-group" && (
        <CreateProjectGroupDialog onClose={closeDialog} />
      )}
      {dialog?.type === "rename-group" && (
        <RenameProjectGroupDialog group={dialog.group} onClose={closeDialog} />
      )}
      {dialog?.type === "delete-group" && (
        <DeleteProjectGroupDialog
          group={dialog.group}
          projectCount={dialog.projectCount}
          onClose={closeDialog}
        />
      )}
      {dialog?.type === "move-project" && (
        <MoveProjectDialog project={dialog.project} onClose={closeDialog} />
      )}
    </aside>
  );
}
