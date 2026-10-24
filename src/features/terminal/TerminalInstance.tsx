import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";
import { commands } from "../../bindings";
import { useEditorStore } from "../editor/editorStore";
import { terminalTheme } from "../theme/themeColors";
import { useThemeStore } from "../theme/themeStore";
import { useSettingsStore } from "../settings/settingsStore";
import { terminalRegistry } from "./terminalRegistry";
import { attachTerminalSession } from "./terminalReplay";

export function TerminalInstance({
  worktreeId,
  terminalId,
}: {
  worktreeId: string;
  terminalId: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const resolvedTheme = useThemeStore((theme) => theme.resolved);
  const terminalFontSize = useSettingsStore(
    (settings) => settings.terminalFontSize,
  );
  const terminalScrollback = useSettingsStore(
    (settings) => settings.terminalScrollback,
  );
  useEffect(() => {
    const terminal = terminalRegistry.get(terminalId);
    if (terminal) {
      terminal.options.theme = terminalTheme();
      terminal.options.fontSize = terminalFontSize;
      terminal.options.scrollback = terminalScrollback;
    }
  }, [resolvedTheme, terminalFontSize, terminalScrollback, terminalId]);
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
          fontSize: terminalFontSize,
          scrollback: terminalScrollback,
          theme: terminalTheme(),
        });
        const fit = new FitAddon();
        terminal.loadAddon(fit);
        terminal.open(host.current);
        fit.fit();
        terminal.focus();
        terminalRegistry.set(terminalId, terminal);
        const session = attachTerminalSession(
          terminalId,
          terminal,
          (data) => {
            void commands.terminalWrite(terminalId, data);
          },
          (message) => {
            useEditorStore
              .getState()
              .setTerminalStatus(
                worktreeId,
                terminalId,
                message.type === "exit" ? "exited" : "error",
              );
          },
        );
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
          session.dispose();
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
