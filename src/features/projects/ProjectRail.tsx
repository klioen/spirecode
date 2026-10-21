import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  RiAddLine,
  RiArrowRightSLine,
  RiFolderAddLine,
  RiFolderLine,
  RiFolderOpenLine,
  RiGitBranchLine,
  RiDraggable,
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
import { TaskNavItem } from "../tasks/TaskNavItem";
import { useTasksStore } from "../tasks/tasksStore";
import { ProjectSessionList } from "./ProjectSessionList";
import { projectsApi } from "./projectsApi";
import {
  groupDropId,
  previewProjectMove,
  projectDragId,
  projectMoveIntent,
  resolveProjectDropTarget,
  staticProjectSortingStrategy,
} from "./projectDnd";
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

function SortableProjectEntry({
  project,
  disabled,
  indicator,
  children,
}: {
  project: ProjectSummary;
  disabled: boolean;
  indicator: "before" | "after" | null;
  children: (handle: ReactNode) => ReactNode;
}) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: projectDragId(project.id),
    disabled,
    data: { type: "project", projectId: project.id },
  });
  return (
    <div
      ref={setNodeRef}
      className={`project-sortable ${isDragging ? "dragging" : ""} ${indicator ? `drop-${indicator}` : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {children(
        <button
          ref={setActivatorNodeRef}
          type="button"
          className="project-drag-handle"
          data-project-drag-handle={project.id}
          aria-label={t("projects.drag.handle", { name: project.name })}
          disabled={disabled}
          {...attributes}
          {...listeners}
        >
          <RiDraggable size={14} />
        </button>,
      )}
    </div>
  );
}

function ProjectDropSection({
  groupId,
  children,
}: {
  groupId: string | null;
  children: ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: groupDropId(groupId),
    data: { type: "group", groupId },
  });
  return (
    <section
      ref={setNodeRef}
      className={`project-section ${isOver ? "drag-over" : ""}`}
    >
      {children}
    </section>
  );
}

export function ProjectRail({
  onToggleProjects = () => undefined,
  onOpenSettings = () => undefined,
  onOpenTasks = () => undefined,
  tasksSelected = false,
}: {
  onToggleProjects?: () => void;
  onOpenSettings?: () => void;
  onOpenTasks?: () => void;
  tasksSelected?: boolean;
}) {
  const { t } = useTranslation();
  const store = useProjectsStore();
  const activeChatWorktrees = useActiveChatWorktrees();
  const incompleteTaskCount = useTasksStore((state) => state.incompleteCount);
  const activeTaskCount = useTasksStore((state) => state.activeCount);
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
  const selectionGenerationRef = useRef(0);
  const dragSnapshotRef = useRef<ProjectSummary[] | null>(null);
  const [activeDragProjectId, setActiveDragProjectId] = useState<string | null>(
    null,
  );
  const [movePending, setMovePending] = useState(false);
  const [dragStatus, setDragStatus] = useState("");
  const [dropIndicator, setDropIndicator] = useState<{
    projectId: string;
    edge: "before" | "after";
  } | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedSessionWorktreeIds, setExpandedSessionWorktreeIds] = useState<
    Set<string>
  >(() => new Set());
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(
    () => () => {
      selectionGenerationRef.current += 1;
    },
    [],
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
  const toggleWorktreeSessions = (worktreeId: string) => {
    setExpandedSessionWorktreeIds((current) => {
      const next = new Set(current);
      if (next.has(worktreeId)) next.delete(worktreeId);
      else next.add(worktreeId);
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
  const select = async (worktreeId: string): Promise<boolean> => {
    const generation = selectionGenerationRef.current + 1;
    selectionGenerationRef.current = generation;
    try {
      await projectsApi.selectWorktree(worktreeId);
      if (selectionGenerationRef.current !== generation) return false;
      store.selectWorktree(worktreeId);
      return true;
    } catch (error) {
      if (selectionGenerationRef.current === generation)
        store.setError(commandError(error));
      return false;
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
  const focusDragHandle = (projectId: string) => {
    requestAnimationFrame(() => {
      Array.from(
        document.querySelectorAll<HTMLButtonElement>(
          "[data-project-drag-handle]",
        ),
      )
        .find((element) => element.dataset.projectDragHandle === projectId)
        ?.focus();
    });
  };
  const resetDrag = (projectId: string | null) => {
    dragSnapshotRef.current = null;
    setDropIndicator(null);
    setActiveDragProjectId(null);
    if (projectId) focusDragHandle(projectId);
  };
  const handleDragStart = (event: DragStartEvent) => {
    if (movePending) return;
    const projectId = event.active.data.current?.projectId;
    if (typeof projectId !== "string") return;
    closeMenus();
    setDragStatus("");
    dragSnapshotRef.current = store.projects;
    setActiveDragProjectId(projectId);
  };
  const handleDragOver = (event: DragOverEvent) => {
    const snapshot = dragSnapshotRef.current;
    const draggedProjectId = event.active.data.current?.projectId;
    if (!snapshot || !event.over || typeof draggedProjectId !== "string")
      return;
    const target = resolveProjectDropTarget(String(event.over.id));
    if (!target) return;
    const translated = event.active.rect.current.translated;
    const placeAfter =
      target.type === "project" &&
      translated !== null &&
      translated.top + translated.height / 2 >
        event.over.rect.top + event.over.rect.height / 2;
    const intent = projectMoveIntent(
      snapshot,
      draggedProjectId,
      target,
      placeAfter,
    );
    if (!intent) {
      setDropIndicator(null);
      return;
    }
    setDropIndicator(
      target.type === "project"
        ? {
            projectId: target.projectId,
            edge: placeAfter ? "after" : "before",
          }
        : null,
    );
  };
  const handleDragCancel = () => {
    resetDrag(activeDragProjectId);
  };
  const handleDragEnd = (event: DragEndEvent) => {
    const draggedProjectId = event.active.data.current?.projectId;
    const projectId =
      typeof draggedProjectId === "string"
        ? draggedProjectId
        : activeDragProjectId;
    const snapshot = dragSnapshotRef.current;
    const target = event.over
      ? resolveProjectDropTarget(String(event.over.id))
      : null;
    const translated = event.active.rect.current.translated;
    const placeAfter =
      target?.type === "project" &&
      translated !== null &&
      translated.top + translated.height / 2 >
        event.over!.rect.top + event.over!.rect.height / 2;
    const intent =
      projectId && snapshot && target
        ? projectMoveIntent(snapshot, projectId, target, placeAfter)
        : null;
    if (!projectId || !snapshot || !intent) {
      resetDrag(projectId);
      return;
    }
    const optimistic = previewProjectMove(snapshot, intent);
    dragSnapshotRef.current = null;
    setDropIndicator(null);
    setActiveDragProjectId(null);
    setMovePending(true);
    store.setProjects(optimistic);
    void projectsApi
      .moveProject(
        intent.projectId,
        intent.targetGroupId,
        intent.beforeProjectId,
      )
      .then((catalog) => {
        store.setCatalog(catalog);
        setDragStatus(t("projects.drag.end"));
      })
      .catch((error: unknown) => {
        store.setProjects(snapshot);
        store.setError(commandError(error));
        setDragStatus(t("projects.drag.failed"));
      })
      .finally(() => {
        setMovePending(false);
        focusDragHandle(projectId);
      });
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

  const renderProject = (project: ProjectSummary, dragHandle: ReactNode) => {
    const directory = project.kind === "directory";
    const expanded = expandedProjectIds.has(project.id);
    const primaryWorkspace =
      project.worktrees.find(({ kind }) => kind === "main") ??
      project.worktrees[0];
    const projectSessionActive = project.worktrees.some(({ id }) =>
      activeChatWorktrees.has(id),
    );
    return (
      <section className="project-entry" key={project.id}>
        <div className="project-heading">
          {dragHandle}
          <button
            className="project-name"
            title={project.path}
            aria-label={t(expanded ? "projects.collapse" : "projects.expand", {
              name: project.name,
            })}
            aria-expanded={expanded}
            onClick={() => {
              if (directory && primaryWorkspace)
                void select(primaryWorkspace.id);
              toggleProject(project.id);
            }}
          >
            <RiArrowRightSLine
              className={`project-chevron ${expanded ? "expanded" : ""}`}
              size={15}
            />
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
              disabled={movePending}
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
        {expanded &&
          primaryWorkspace &&
          (directory ? (
            <ProjectSessionList
              worktreeId={primaryWorkspace.id}
              onSelectWorktree={select}
            />
          ) : (
            <div className="worktree-list">
              {project.worktrees.map((worktree) => {
                const active = worktree.id === store.activeWorktreeId;
                const managed = worktree.kind === "managed";
                const sessionsExpanded = expandedSessionWorktreeIds.has(
                  worktree.id,
                );
                return (
                  <div className="worktree-entry" key={worktree.id}>
                    <div
                      className={`worktree-row ${active ? "active" : ""}`}
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
                        type="button"
                        className="worktree-session-toggle"
                        aria-expanded={sessionsExpanded}
                        aria-label={t(
                          sessionsExpanded
                            ? "projects.sessions.collapse"
                            : "projects.sessions.expand",
                          { name: worktree.name },
                        )}
                        onClick={() => toggleWorktreeSessions(worktree.id)}
                      >
                        <RiArrowRightSLine
                          className={`project-chevron ${sessionsExpanded ? "expanded" : ""}`}
                          size={14}
                        />
                      </button>
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
                          aria-label={t("projects.manage", {
                            name: worktree.name,
                          })}
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
                    {sessionsExpanded && (
                      <ProjectSessionList
                        worktreeId={worktree.id}
                        onSelectWorktree={select}
                      />
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
          ))}
      </section>
    );
  };

  const displayedProjects = store.projects;
  const ungrouped = displayedProjects.filter(({ groupId }) => groupId === null);
  const sections = [
    ...store.groups.map((group) => ({
      id: group.id,
      name: group.name,
      group,
      projects: displayedProjects.filter(({ groupId }) => groupId === group.id),
    })),
    ...(displayedProjects.length > 0
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
      <TaskNavItem
        label={t("tasks.heading")}
        incompleteCount={incompleteTaskCount}
        activeCount={activeTaskCount}
        selected={tasksSelected}
        onSelect={onOpenTasks}
      />
      <div className="project-rail-heading">
        <span>{t("projects.heading")}</span>
        <div className="project-rail-actions">
          <button
            className="project-add"
            title={t("projects.group.create")}
            aria-label={t("projects.group.create")}
            onClick={() => setDialog({ type: "create-group" })}
            disabled={movePending}
          >
            <RiFolderAddLine size={16} />
          </button>
          <button
            className="project-add"
            data-action="open-project"
            title={t("workbench.openProject")}
            aria-label={t("workbench.openProject")}
            onClick={() => void open()}
            disabled={store.loading || movePending}
          >
            {store.loading ? (
              <span className="spinner" />
            ) : (
              <RiFolderOpenLine size={16} />
            )}
          </button>
        </div>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
        accessibility={{
          announcements: {
            onDragStart({ active }) {
              const project = displayedProjects.find(
                ({ id }) => projectDragId(id) === active.id,
              );
              return project
                ? t("projects.drag.start", { name: project.name })
                : undefined;
            },
            onDragOver({ over }) {
              if (!over) return t("projects.drag.outside");
              const target = resolveProjectDropTarget(String(over.id));
              if (!target) return undefined;
              if (target.type === "group") {
                const name =
                  target.groupId === null
                    ? t("projects.group.ungrouped")
                    : (store.groups.find(({ id }) => id === target.groupId)
                        ?.name ?? "");
                return t("projects.drag.overGroup", { name });
              }
              const project = displayedProjects.find(
                ({ id }) => id === target.projectId,
              );
              return project
                ? t("projects.drag.overProject", { name: project.name })
                : undefined;
            },
            onDragEnd() {
              return t("projects.drag.saving");
            },
            onDragCancel() {
              return t("projects.drag.cancel");
            },
          },
        }}
      >
        <div className="project-list">
          {sections.map((section) => {
            const expanded = !collapsedGroupIds.has(section.id);
            const sessionActive = section.projects.some((project) =>
              project.worktrees.some(({ id }) => activeChatWorktrees.has(id)),
            );
            return (
              <ProjectDropSection
                key={section.id}
                groupId={section.group?.id ?? null}
              >
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
                      ref={
                        menuGroupId === section.id ? groupMenuRef : undefined
                      }
                    >
                      <button
                        className="project-group-menu-button"
                        data-dialog-return-focus={`group:${section.id}`}
                        aria-label={t("projects.group.manage", {
                          name: section.name,
                        })}
                        aria-expanded={menuGroupId === section.id}
                        disabled={movePending}
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
                  <SortableContext
                    items={section.projects.map(({ id }) => projectDragId(id))}
                    strategy={staticProjectSortingStrategy}
                  >
                    <div className="project-group-projects">
                      {section.projects.map((project) => (
                        <SortableProjectEntry
                          key={project.id}
                          project={project}
                          disabled={movePending}
                          indicator={
                            dropIndicator?.projectId === project.id
                              ? dropIndicator.edge
                              : null
                          }
                        >
                          {(dragHandle) => renderProject(project, dragHandle)}
                        </SortableProjectEntry>
                      ))}
                    </div>
                  </SortableContext>
                )}
              </ProjectDropSection>
            );
          })}
        </div>
        <DragOverlay>
          {activeDragProjectId ? (
            <div className="project-drag-overlay">
              {displayedProjects.find(({ id }) => id === activeDragProjectId)
                ?.name ?? ""}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <div className="sr-only" role="status" aria-live="assertive">
        {dragStatus}
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
