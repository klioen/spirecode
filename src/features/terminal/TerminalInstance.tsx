import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";
import { commands, type TerminalMessage } from "../../bindings";
import { useEditorStore } from "../editor/editorStore";
import { terminalRegistry } from "./terminalRegistry";
import { decodeTerminalOutput, terminalStream } from "./terminalStream";

export function TerminalInstance({
  projectId,
  terminalId,
}: {
  projectId: string;
  terminalId: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | undefined;
    let cleanup = () => {};
    void Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]).then(
      ([{ Terminal }, { FitAddon }]) => {
        if (disposed || !host.current) return;
        const terminal = new Terminal({
          cursorBlink: true,
          fontFamily: "'JetBrains Mono', Menlo, monospace",
          fontSize: 12,
          scrollback: 5000,
          theme: {
            background: "#101114",
            foreground: "#c9cbd1",
            cursor: "#9ee493",
            selectionBackground: "#425047",
          },
        });
        const fit = new FitAddon();
        terminal.loadAddon(fit);
        terminal.open(host.current);
        fit.fit();
        terminal.focus();
        terminalRegistry.set(terminalId, terminal);
        const unsubscribe = terminalStream.subscribe(
          terminalId,
          (message: TerminalMessage) => {
            if (message.type === "output")
              terminal.write(decodeTerminalOutput(terminalId, message.data));
            else
              useEditorStore
                .getState()
                .setTerminalStatus(
                  projectId,
                  terminalId,
                  message.type === "exit" ? "exited" : "error",
                );
          },
        );
        const input = terminal.onData((data) => {
          void commands.terminalWrite(terminalId, data);
        });
        let resizeTimer = 0;
        observer = new ResizeObserver(() => {
          window.clearTimeout(resizeTimer);
          resizeTimer = window.setTimeout(() => {
            fit.fit();
            void commands.terminalResize(
              terminalId,
              terminal.cols,
              terminal.rows,
            );
          }, 80);
        });
        observer.observe(host.current);
        cleanup = () => {
          input.dispose();
          unsubscribe();
          window.clearTimeout(resizeTimer);
          terminalRegistry.delete(terminalId);
        };
      },
    );
    return () => {
      disposed = true;
      observer?.disconnect();
      cleanup();
    };
  }, [terminalId]);
  return <div className="terminal-instance" ref={host} />;
}
