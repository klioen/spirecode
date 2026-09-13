import { useEffect, useState, type CSSProperties } from "react";
import {
  RiArrowDownSLine,
  RiCommandLine,
  RiLayoutRightLine,
  RiTerminalBoxLine,
} from "@remixicon/react";
import { ChangesPanel } from "../changes/ChangesPanel";
import { EditorPane } from "../editor/EditorPane";
import { FileTree } from "../files/FileTree";
import { ProjectRail } from "../projects/ProjectRail";
import { useProjectsStore } from "../projects/projectsStore";
import { TerminalPanel } from "../terminal/TerminalPanel";
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
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  useEffect(() => {
    const updateViewport = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
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
    const available = viewport.width - right - MIN_EDITOR_WIDTH - PANEL_GAP;
    workbench.setProjectsWidth(Math.min(width, available));
  };
  const resizeRight = (width: number) => {
    const available =
      viewport.width - workbench.projectsWidth - MIN_EDITOR_WIDTH - PANEL_GAP;
    workbench.setRightPanelWidth(Math.min(width, available));
  };
  const terminalMax = Math.max(
    PANEL_LIMITS.terminal.min,
    Math.floor(viewport.height * 0.6),
  );
  const maxCombinedPanels = Math.max(
    0,
    viewport.width - MIN_EDITOR_WIDTH - PANEL_GAP,
  );
  const visibleProjectsWidth = Math.min(
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
    "--terminal-height": `${Math.min(workbench.terminalHeight, terminalMax)}px`,
  } as CSSProperties;
  return (
    <div
      className={`workbench ${workbench.rightCollapsed ? "right-collapsed" : ""} ${workbench.terminalCollapsed ? "terminal-collapsed" : ""}`}
      style={style}
    >
      <ProjectRail />
      <PanelResizeHandle
        label="Resize projects panel"
        edge="projects"
        orientation="vertical"
        value={workbench.projectsWidth}
        min={PANEL_LIMITS.projects.min}
        max={PANEL_LIMITS.projects.max}
        direction={1}
        onChange={resizeProjects}
        onReset={() => workbench.resetPanelSize("projects")}
      />
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
          <button title="Toggle terminal" onClick={workbench.toggleTerminal}>
            <RiTerminalBoxLine size={17} />
          </button>
          <button title="Toggle sidebar" onClick={workbench.toggleRight}>
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
          orientation="vertical"
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
      {!workbench.terminalCollapsed && (
        <PanelResizeHandle
          label="Resize terminal panel"
          edge="terminal"
          orientation="horizontal"
          value={Math.min(workbench.terminalHeight, terminalMax)}
          min={PANEL_LIMITS.terminal.min}
          max={terminalMax}
          direction={-1}
          onChange={(height) =>
            workbench.setTerminalHeight(Math.min(height, terminalMax))
          }
          onReset={() => workbench.resetPanelSize("terminal")}
        />
      )}
      <div className="bottom-panel">
        {project ? (
          <TerminalPanel projectId={project.id} />
        ) : (
          <div className="terminal-placeholder">
            <RiTerminalBoxLine size={15} /> TERMINAL
          </div>
        )}
      </div>
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
