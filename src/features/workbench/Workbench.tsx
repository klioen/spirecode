import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  RiFolder3Line,
  RiGitCommitLine,
  RiLayoutLeftLine,
  RiLayoutRightLine,
  RiSettings3Line,
} from "@remixicon/react";
import { SpireCodeMark } from "../../components/SpireCodeMark";
import { Tooltip } from "../../components/Tooltip";
import { useTranslation } from "../../i18n";
import { ChangesPanel } from "../changes/ChangesPanel";
import { refreshChanges } from "../changes/changesRefresh";
import { useChangesStore } from "../changes/changesStore";
import { EditorPane } from "../editor/EditorPane";
import { useEditorStore } from "../editor/editorStore";
import { FileTree } from "../files/FileTree";
import { ProjectRail } from "../projects/ProjectRail";
import { useProjectsStore } from "../projects/projectsStore";
import { settingsApi } from "../settings/settingsApi";
import {
  SettingsDialog,
  type SettingsSection,
} from "../settings/SettingsDialog";
import { ThemeToggle } from "../theme/ThemeToggle";
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
          <ThemeToggle />
          <Tooltip label={t("workbench.settings")}>
            <button
              aria-label={t("workbench.settings")}
              onClick={() => {
                setSettingsSection("extensions");
                setSettingsOpen(true);
              }}
            >
              <RiSettings3Line size={17} />
            </button>
          </Tooltip>
          <Tooltip label={t("workbench.toggleProjects")}>
            <button
              aria-label={t("workbench.toggleProjects")}
              onClick={workbench.toggleProjects}
            >
              <RiLayoutLeftLine size={17} />
            </button>
          </Tooltip>
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
      {settingsOpen && (
        <SettingsDialog
          worktreeId={activeWorktreeId}
          initialSection={settingsSection}
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
