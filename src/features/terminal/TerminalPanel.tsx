import { RiAddLine, RiCloseLine, RiTerminalBoxLine } from "@remixicon/react";
import { commands } from "../../bindings";
import { commandError } from "../../lib/errors";
import { TerminalInstance } from "./TerminalInstance";
import { terminalStream } from "./terminalStream";
import { useTerminalStore } from "./terminalStore";

export function TerminalPanel({ projectId }: { projectId: string }) {
  const tabs = useTerminalStore(
    (state) => state.tabsByProject[projectId] ?? [],
  );
  const active = useTerminalStore((state) => state.activeByProject[projectId]);
  const createTerminal = async () => {
    try {
      const terminal = await commands.terminalCreate(projectId);
      await commands.terminalAttach(terminal.terminalId, terminalStream.push);
      useTerminalStore.getState().add({
        terminalId: terminal.terminalId,
        projectId,
        title: `shell ${tabs.length + 1}`,
        status: "running",
      });
    } catch (error) {
      console.error(commandError(error).message);
    }
  };
  const close = async (terminalId: string) => {
    if (!window.confirm("Close this terminal and its running process?")) return;
    await commands.terminalClose(terminalId, true);
    terminalStream.close(terminalId);
    useTerminalStore.getState().remove(projectId, terminalId);
  };
  return (
    <section className="terminal-panel">
      <div className="terminal-header">
        <span>
          <RiTerminalBoxLine size={15} /> TERMINAL
        </span>
        <div className="terminal-tabs">
          {tabs.map((tab) => (
            <button
              className={tab.terminalId === active ? "active" : ""}
              key={tab.terminalId}
              onClick={() =>
                useTerminalStore.getState().activate(projectId, tab.terminalId)
              }
            >
              <i className={`terminal-status ${tab.status}`} />
              {tab.title}
              <span
                onClick={(event) => {
                  event.stopPropagation();
                  void close(tab.terminalId);
                }}
              >
                <RiCloseLine size={13} />
              </span>
            </button>
          ))}
        </div>
        <button
          className="terminal-add"
          title="New terminal"
          onClick={() => void createTerminal()}
        >
          <RiAddLine size={17} />
        </button>
      </div>
      <div className="terminal-body">
        {active ? (
          tabs.map((tab) => (
            <div
              className={
                tab.terminalId === active
                  ? "terminal-slot active"
                  : "terminal-slot"
              }
              key={tab.terminalId}
            >
              <TerminalInstance
                projectId={projectId}
                terminalId={tab.terminalId}
              />
            </div>
          ))
        ) : (
          <button
            className="new-terminal"
            onClick={() => void createTerminal()}
          >
            <RiTerminalBoxLine size={18} /> New terminal
          </button>
        )}
      </div>
    </section>
  );
}
