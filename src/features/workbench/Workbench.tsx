import { useEffect, useState, type CSSProperties } from "react";
import {
  RiArrowDownSLine,
  RiCommandLine,
  RiLayoutLeftLine,
  RiLayoutRightLine,
} from "@remixicon/react";
import { ChangesPanel } from "../changes/ChangesPanel";
import { EditorPane } from "../editor/EditorPane";
import { FileTree } from "../files/FileTree";
import { ProjectRail } from "../projects/ProjectRail";
import { useProjectsStore } from "../projects/projectsStore";
import { PanelResizeHandle } from "./PanelResizeHandle";
import { PANEL_LIMITS, useWorkbenchStore } from "./workbenchStore";

const MIN_EDITOR_WIDTH = 340;
const PANEL_GAP = 16;

function EmptyWorkbench() {
  const open = () =>
    document
      .querySelector<HTMLButtonElement>('[title="Open project"]')
      ?.click();
  return (
    <div className="empty-workbench">
      <div className="empty-logo">π</div>
      <h1>Build without the noise.</h1>
      <p>
        Open a Git repository to explore files, review changes, and run
        commands.
      </p>
      <button onClick={open}>Open a project</button>
    </div>
  );
}

export function Workbench() {
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const updateViewport = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);
  const project = useProjectsStore((state) =>
    state.projects.find(({ id }) => id === state.activeProjectId),
  );
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
            label="Resize projects panel"
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
        <div className="project-crumb">
          <span className="traffic-spacer" />
          {project ? (
            <>
              <b>{project.name}</b>
              <RiArrowDownSLine size={15} />
              <span className="branch">Git repository</span>
            </>
          ) : (
            <span>No project open</span>
          )}
        </div>
        <button className="command-center">
          <RiCommandLine size={15} />
          <span>Search files and commands</span>
          <kbd>⌘ K</kbd>
        </button>
        <div className="layout-actions">
          <button
            title="Toggle projects panel"
            aria-label="Toggle projects panel"
            onClick={workbench.toggleProjects}
          >
            <RiLayoutLeftLine size={17} />
          </button>
          <button
            title="Toggle files panel"
            aria-label="Toggle files panel"
            onClick={workbench.toggleRight}
          >
            <RiLayoutRightLine size={17} />
          </button>
        </div>
      </header>
      <div className="workspace-center">
        {project ? <EditorPane projectId={project.id} /> : <EmptyWorkbench />}
      </div>
      {!workbench.rightCollapsed && (
        <PanelResizeHandle
          label="Resize files and changes panel"
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
            onClick={() => workbench.setRightView("files")}
          >
            FILES
          </button>
          <button
            className={workbench.rightView === "changes" ? "active" : ""}
            onClick={() => workbench.setRightView("changes")}
          >
            CHANGES
          </button>
        </div>
        {project ? (
          workbench.rightView === "files" ? (
            <FileTree projectId={project.id} />
          ) : (
            <ChangesPanel projectId={project.id} />
          )
        ) : (
          <div className="tree-state">Open a project to browse</div>
        )}
      </aside>
      {error && (
        <div className="toast">
          <b>{error.code}</b>
          <span>{error.message}</span>
          <button onClick={() => useProjectsStore.getState().setError(null)}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}
