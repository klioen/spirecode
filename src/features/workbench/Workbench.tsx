import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  RiFolder3Line,
  RiGitCommitLine,
  RiLayoutLeftLine,
  RiLayoutRightLine,
  RiSettings3Line,
} from "@remixicon/react";
import { useTranslation } from "../../i18n";
import { ChangesPanel } from "../changes/ChangesPanel";
import { refreshChanges } from "../changes/changesRefresh";
import { useChangesStore } from "../changes/changesStore";
import { EditorPane } from "../editor/EditorPane";
import { FileTree } from "../files/FileTree";
import { ProjectRail } from "../projects/ProjectRail";
import { useProjectsStore } from "../projects/projectsStore";
import { SettingsDialog } from "../settings/SettingsDialog";
import { ThemeToggle } from "../theme/ThemeToggle";
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
      <div className="empty-logo">S</div>
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
  useEffect(() => {
    const updateViewport = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);
  const projects = useProjectsStore((state) => state.projects);
  const activeWorktreeId = useProjectsStore((state) => state.activeWorktreeId);
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
    if (activeWorktreeId) void refreshChanges(activeWorktreeId);
  }, [activeWorktreeId]);
  const error = useProjectsStore((state) => state.error);
  const workbench = useWorkbenchStore();
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
  return (
    <div
      className={`workbench ${workbench.projectsCollapsed ? "projects-collapsed" : ""} ${workbench.rightCollapsed ? "right-collapsed" : ""}`}
      style={style}
    >
      {!workbench.projectsCollapsed && (
        <>
          <ProjectRail />
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
          {active ? (
            <>
              <b className="breadcrumb-level">{active.project.name}</b>
              <span className="breadcrumb-separator" aria-hidden="true">
                {" > "}
              </span>
              <span className="breadcrumb-level">{active.worktree.name}</span>
              <span className="breadcrumb-separator" aria-hidden="true">
                {" > "}
              </span>
              <span className="breadcrumb-level breadcrumb-level-fixed branch">
                {liveBranch ?? active.worktree.branch}
              </span>
            </>
          ) : (
            <span>{t("workbench.noProject")}</span>
          )}
        </nav>
        <div className="layout-actions">
          <ThemeToggle />
          <button
            title={t("workbench.settings")}
            aria-label={t("workbench.settings")}
            onClick={() => setSettingsOpen(true)}
          >
            <RiSettings3Line size={17} />
          </button>
          <button
            title={t("workbench.toggleProjects")}
            aria-label={t("workbench.toggleProjects")}
            onClick={workbench.toggleProjects}
          >
            <RiLayoutLeftLine size={17} />
          </button>
          <button
            title={t("workbench.toggleFiles")}
            aria-label={t("workbench.toggleFiles")}
            onClick={workbench.toggleRight}
          >
            <RiLayoutRightLine size={17} />
          </button>
        </div>
      </header>
      <div className="workspace-center">
        {active ? (
          <EditorPane worktreeId={active.worktree.id} />
        ) : (
          <EmptyWorkbench />
        )}
      </div>
      {!workbench.rightCollapsed && (
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
      <aside className="right-panel">
        <div className="right-tabs">
          <button
            className={workbench.rightView === "files" ? "active" : ""}
            aria-label={t("workbench.files")}
            title={t("workbench.files")}
            onClick={() => workbench.setRightView("files")}
          >
            <RiFolder3Line size={15} />
          </button>
          <button
            className={workbench.rightView === "changes" ? "active" : ""}
            aria-label={t("workbench.changes")}
            title={t("workbench.changes")}
            onClick={() => workbench.setRightView("changes")}
          >
            <RiGitCommitLine size={15} />
          </button>
        </div>
        {active ? (
          workbench.rightView === "files" ? (
            <FileTree worktreeId={active.worktree.id} />
          ) : (
            <ChangesPanel worktreeId={active.worktree.id} />
          )
        ) : (
          <div className="tree-state">{t("workbench.openToBrowse")}</div>
        )}
      </aside>
      {settingsOpen && (
        <SettingsDialog
          worktreeId={activeWorktreeId}
          onClose={() => setSettingsOpen(false)}
        />
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
