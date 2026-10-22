import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  RiFolder3Line,
  RiGitCommitLine,
  RiLayoutLeftLine,
  RiLayoutRightLine,
} from "@remixicon/react";
import { SpireCodeMark } from "../../components/SpireCodeMark";
import { commands } from "../../bindings";
import { Tooltip } from "../../components/Tooltip";
import { useTranslation } from "../../i18n";
import { commandError } from "../../lib/errors";
import { ChangesPanel } from "../changes/ChangesPanel";
import { refreshChanges } from "../changes/changesRefresh";
import { useChangesStore } from "../changes/changesStore";
import { EditorPane } from "../editor/EditorPane";
import { useEditorStore } from "../editor/editorStore";
import { FileTree } from "../files/FileTree";
import { ProjectRail } from "../projects/ProjectRail";
import { projectsApi } from "../projects/projectsApi";
import { useProjectsStore } from "../projects/projectsStore";
import { TaskPage } from "../tasks/TaskPage";
import type { TaskProjectOption } from "../tasks/TaskForm";
import { tasksApi } from "../tasks/tasksApi";
import { useTasksStore } from "../tasks/tasksStore";
import { settingsApi } from "../settings/settingsApi";
import { SettingsPage, type SettingsSection } from "../settings/SettingsPage";
import { BreadcrumbSwitcher } from "./BreadcrumbSwitcher";
import { PanelResizeHandle } from "./PanelResizeHandle";
import { PANEL_LIMITS, useWorkbenchStore } from "./workbenchStore";

const MIN_EDITOR_WIDTH = 340;
const PANEL_GAP = 16;

function EmptyWorkbench() {
  const { t } = useTranslation();
  const openProject = () =>
    document
      .querySelector<HTMLButtonElement>('[data-action="open-project"]')
      ?.click();
  return (
    <div className="empty-workbench">
      <SpireCodeMark className="empty-logo" />
      <h1>SpireCode</h1>
      <p className="product-slogan">{t("workbench.slogan")}</p>
      <p>{t("workbench.empty.description")}</p>
      <button onClick={openProject}>{t("workbench.openProject")}</button>
    </div>
  );
}

export function Workbench() {
  const { t } = useTranslation();
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const taskSessionNavigationGeneration = useRef(0);
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("extensions");
  useEffect(() => {
    let disposed = false;
    void settingsApi.getAgentReadiness().then(
      (readiness) => {
        if (
          !disposed &&
          (!readiness.defaultModelAvailable || !readiness.resourcesHealthy)
        ) {
          taskSessionNavigationGeneration.current += 1;
          setSettingsSection("agent");
          setSettingsOpen(true);
        }
      },
      () => undefined,
    );
    return () => {
      disposed = true;
    };
  }, []);
  useEffect(() => {
    const updateViewport = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);
  const projects = useProjectsStore((state) => state.projects);
  const activeWorktreeId = useProjectsStore((state) => state.activeWorktreeId);
  useEffect(
    () =>
      useProjectsStore.subscribe((state, previous) => {
        if (state.activeWorktreeId !== previous.activeWorktreeId)
          taskSessionNavigationGeneration.current += 1;
      }),
    [],
  );
  useEffect(() => {
    if (!window.spire) return;
    void useTasksStore.getState().load(tasksApi);
    return tasksApi.subscribe((event) => {
      if (event.kind === "changed" || event.kind === "notification")
        void useTasksStore
          .getState()
          .invalidate(tasksApi, event.taskId, event.revision);
      if (
        event.kind === "notification" &&
        event.payload?.navigate &&
        event.taskId
      ) {
        taskSessionNavigationGeneration.current += 1;
        useTasksStore.getState().selectTask(event.taskId);
        setTasksOpen(true);
      }
    });
  }, []);
  const taskProjects = useMemo<TaskProjectOption[]>(
    () =>
      projects.map((project) => ({
        id: project.id,
        name: project.name,
        kind: project.kind,
        baseRefs: [],
        worktrees: project.worktrees.map((worktree) => ({
          id: worktree.id,
          name: worktree.name,
        })),
      })),
    [projects],
  );
  const loadTaskProject = useCallback(
    async (projectId: string): Promise<TaskProjectOption> => {
      const project = projects.find((item) => item.id === projectId);
      if (!project) throw new Error(t("tasks.projectUnavailable"));
      const branches =
        project.kind === "git"
          ? await commands.gitListOriginBranches(project.id)
          : { defaultRef: null, branches: [] };
      const worktrees = await Promise.all(
        project.worktrees.map(async (worktree) => {
          const status =
            project.kind === "git"
              ? await commands.gitStatus(worktree.id)
              : { changes: [] };
          return {
            id: worktree.id,
            name: worktree.name,
            dirty: status.changes.length > 0,
          };
        }),
      );
      return {
        id: project.id,
        name: project.name,
        kind: project.kind,
        defaultBaseRef: branches.defaultRef ?? undefined,
        baseRefs: branches.branches.map((branch) => ({
          value: branch.ref,
          label: branch.name,
        })),
        worktrees,
      };
    },
    [projects, t],
  );
  const active = useMemo(() => {
    for (const project of projects) {
      const worktree = project.worktrees.find(
        ({ id }) => id === activeWorktreeId,
      );
      if (worktree) return { project, worktree };
    }
    return null;
  }, [activeWorktreeId, projects]);
  const liveBranch = useChangesStore((state) =>
    activeWorktreeId
      ? state.byWorktree[activeWorktreeId]?.snapshot?.branch
      : null,
  );
  useEffect(() => {
    if (!active) return;
    if (active.project.kind === "git") {
      void refreshChanges(active.worktree.id);
      return;
    }
    useEditorStore.getState().clearDiffTabs(active.worktree.id);
  }, [active]);
  const error = useProjectsStore((state) => state.error);
  const workbench = useWorkbenchStore();
  const supportsGit = active?.project.kind === "git";
  const visibleRightView =
    !supportsGit && workbench.rightView === "changes"
      ? "files"
      : workbench.rightView;
  const resizeProjects = (width: number) => {
    const right = workbench.rightCollapsed ? 0 : workbench.rightPanelWidth;
    const available = viewportWidth - right - MIN_EDITOR_WIDTH - PANEL_GAP;
    workbench.setProjectsWidth(Math.min(width, available));
  };
  const resizeRight = (width: number) => {
    const projects = workbench.projectsCollapsed ? 0 : workbench.projectsWidth;
    const available = viewportWidth - projects - MIN_EDITOR_WIDTH - PANEL_GAP;
    workbench.setRightPanelWidth(Math.min(width, available));
  };
  const maxCombinedPanels = Math.max(
    0,
    viewportWidth - MIN_EDITOR_WIDTH - PANEL_GAP,
  );
  const visibleProjectsWidth = workbench.projectsCollapsed
    ? 0
    : Math.min(
        workbench.projectsWidth,
        Math.max(
          PANEL_LIMITS.projects.min,
          maxCombinedPanels -
            (workbench.rightCollapsed ? 0 : PANEL_LIMITS.right.min),
        ),
      );
  const visibleRightWidth = workbench.rightCollapsed
    ? 0
    : Math.min(
        workbench.rightPanelWidth,
        Math.max(
          PANEL_LIMITS.right.min,
          maxCombinedPanels - visibleProjectsWidth,
        ),
      );
  const style = {
    "--projects-width": `${visibleProjectsWidth}px`,
    "--right-panel-width": `${visibleRightWidth}px`,
  } as CSSProperties;
  if (settingsOpen)
    return (
      <SettingsPage
        worktreeId={activeWorktreeId}
        initialSection={settingsSection}
        onBack={() => setSettingsOpen(false)}
      />
    );
  return (
    <div
      className={`workbench ${workbench.projectsCollapsed ? "projects-collapsed" : ""} ${workbench.rightCollapsed || tasksOpen ? "right-collapsed" : ""} ${tasksOpen ? "tasks-open" : ""}`}
      style={style}
    >
      {!workbench.projectsCollapsed && (
        <>
          <ProjectRail
            onToggleProjects={workbench.toggleProjects}
            onOpenSettings={() => {
              taskSessionNavigationGeneration.current += 1;
              setSettingsSection("general");
              setSettingsOpen(true);
            }}
            onOpenTasks={() => {
              taskSessionNavigationGeneration.current += 1;
              setTasksOpen((open) => !open);
            }}
            onOpenSession={() => {
              taskSessionNavigationGeneration.current += 1;
              setTasksOpen(false);
            }}
            tasksSelected={tasksOpen}
          />
          <PanelResizeHandle
            label={t("workbench.resizeProjects")}
            edge="projects"
            value={workbench.projectsWidth}
            min={PANEL_LIMITS.projects.min}
            max={PANEL_LIMITS.projects.max}
            direction={1}
            onChange={resizeProjects}
            onReset={() => workbench.resetPanelSize("projects")}
          />
        </>
      )}
      <header className="topbar">
        <nav
          className="project-crumb"
          aria-label={t("workbench.projectContext")}
        >
          <span className="traffic-spacer" />
          {workbench.projectsCollapsed && (
            <Tooltip label={t("workbench.toggleProjects")} align="start">
              <button
                className="project-panel-reopen"
                aria-label={t("workbench.toggleProjects")}
                onClick={workbench.toggleProjects}
              >
                <RiLayoutLeftLine size={17} />
              </button>
            </Tooltip>
          )}
          {active ? (
            <BreadcrumbSwitcher
              activeProject={active.project}
              activeWorktree={active.worktree}
              branch={liveBranch ?? active.worktree.branch}
            />
          ) : (
            <span>{t("workbench.noProject")}</span>
          )}
        </nav>
        <div className="layout-actions">
          <Tooltip label={t("workbench.toggleFiles")} align="end">
            <button
              aria-label={t("workbench.toggleFiles")}
              onClick={workbench.toggleRight}
            >
              <RiLayoutRightLine size={17} />
            </button>
          </Tooltip>
        </div>
      </header>
      <div className="workspace-center">
        {tasksOpen ? (
          <TaskPage
            api={tasksApi}
            projects={taskProjects}
            preferredProjectId={active?.project.id}
            loadProject={loadTaskProject}
            onOpenChanges={async (worktreeId) => {
              const generation = ++taskSessionNavigationGeneration.current;
              try {
                const worktree = await projectsApi.selectWorktree(worktreeId);
                if (taskSessionNavigationGeneration.current !== generation)
                  return;
                useProjectsStore.getState().addWorktree(worktree);
                useWorkbenchStore.getState().setRightView("changes");
                if (useWorkbenchStore.getState().rightCollapsed)
                  useWorkbenchStore.getState().toggleRight();
                setTasksOpen(false);
              } catch (error) {
                if (taskSessionNavigationGeneration.current !== generation)
                  return;
                useProjectsStore.getState().setError(commandError(error));
                throw error;
              }
            }}
            onOpenSession={async (worktreeId, sessionId) => {
              const generation = ++taskSessionNavigationGeneration.current;
              try {
                const worktree = await projectsApi.selectWorktree(worktreeId);
                if (taskSessionNavigationGeneration.current !== generation)
                  return;
                useProjectsStore.getState().addWorktree(worktree);
                useEditorStore
                  .getState()
                  .openChat(worktreeId, sessionId, "Task");
                setTasksOpen(false);
              } catch (error) {
                if (taskSessionNavigationGeneration.current !== generation)
                  return;
                useProjectsStore.getState().setError(commandError(error));
                throw error;
              }
            }}
          />
        ) : active ? (
          <EditorPane worktreeId={active.worktree.id} />
        ) : (
          <EmptyWorkbench />
        )}
      </div>
      {!workbench.rightCollapsed && !tasksOpen && (
        <PanelResizeHandle
          label={t("workbench.resizeRight")}
          edge="right"
          value={workbench.rightPanelWidth}
          min={PANEL_LIMITS.right.min}
          max={PANEL_LIMITS.right.max}
          direction={-1}
          onChange={resizeRight}
          onReset={() => workbench.resetPanelSize("right")}
        />
      )}
      {!tasksOpen && (
        <aside className="right-panel">
          <div className="right-tabs">
            <Tooltip label={t("workbench.files")}>
              <button
                className={visibleRightView === "files" ? "active" : ""}
                aria-label={t("workbench.files")}
                onClick={() => workbench.setRightView("files")}
              >
                <RiFolder3Line size={15} />
              </button>
            </Tooltip>
            {supportsGit && (
              <Tooltip label={t("workbench.changes")}>
                <button
                  className={visibleRightView === "changes" ? "active" : ""}
                  aria-label={t("workbench.changes")}
                  onClick={() => workbench.setRightView("changes")}
                >
                  <RiGitCommitLine size={15} />
                </button>
              </Tooltip>
            )}
          </div>
          {active ? (
            visibleRightView === "files" ? (
              <FileTree worktreeId={active.worktree.id} />
            ) : (
              <ChangesPanel worktreeId={active.worktree.id} />
            )
          ) : (
            <div className="tree-state">{t("workbench.openToBrowse")}</div>
          )}
        </aside>
      )}
      {error && (
        <div className="toast">
          <b>{error.code}</b>
          <span>{error.message}</span>
          <button
            aria-label={t("workbench.dismissError")}
            onClick={() => useProjectsStore.getState().setError(null)}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
