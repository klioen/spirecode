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
import { useWorkbenchStore } from "./workbenchStore";

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
  const project = useProjectsStore((state) =>
    state.projects.find(({ id }) => id === state.activeProjectId),
  );
  const error = useProjectsStore((state) => state.error);
  const workbench = useWorkbenchStore();
  return (
    <div
      className={`workbench ${workbench.rightCollapsed ? "right-collapsed" : ""} ${workbench.terminalCollapsed ? "terminal-collapsed" : ""}`}
    >
      <ProjectRail />
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
