import {
  RiCloseLine,
  RiComputerLine,
  RiExternalLinkLine,
  RiFileList3Line,
  RiRobot2Line,
  RiSettings3Line,
  RiTerminalBoxLine,
} from "@remixicon/react";
import { useEffect, useState, type ReactNode } from "react";
import type { ExtensionSetting } from "../../bindings";
import { commandError } from "../../lib/errors";
import { useThemeStore } from "../theme/themeStore";
import { useSettingsStore } from "./settingsStore";
import { MemorySettings } from "./MemorySettings";
import { settingsApi } from "./settingsApi";

type Section =
  "general" | "agent" | "memory" | "extensions" | "editor" | "terminal";

const sections: Array<{ id: Section; label: string; icon: ReactNode }> = [
  { id: "general", label: "General", icon: <RiSettings3Line size={16} /> },
  { id: "agent", label: "Agent", icon: <RiRobot2Line size={16} /> },
  { id: "memory", label: "Memory", icon: <RiFileList3Line size={16} /> },
  {
    id: "extensions",
    label: "Extensions",
    icon: <RiExternalLinkLine size={16} />,
  },
  { id: "editor", label: "Editor", icon: <RiComputerLine size={16} /> },
  { id: "terminal", label: "Terminal", icon: <RiTerminalBoxLine size={16} /> },
];

export function SettingsDialog({
  worktreeId,
  onClose,
}: {
  worktreeId: string | null;
  onClose: () => void;
}) {
  const [section, setSection] = useState<Section>("extensions");
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.key === "Escape" && onClose()}
      >
        <header className="settings-header">
          <h2 id="settings-title">Settings</h2>
          <button aria-label="Close settings" onClick={onClose} autoFocus>
            <RiCloseLine size={18} />
          </button>
        </header>
        <div className="settings-body">
          <nav className="settings-nav" aria-label="Settings sections">
            {sections.map((item) => (
              <button
                key={item.id}
                className={section === item.id ? "active" : ""}
                onClick={() => setSection(item.id)}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>
          <main className="settings-content">
            {section === "general" && <GeneralSettings />}
            {section === "agent" && <AgentSettings />}
            {section === "memory" && <MemorySettings />}
            {section === "extensions" && (
              <ExtensionsSettings worktreeId={worktreeId} />
            )}
            {section === "editor" && <EditorSettings />}
            {section === "terminal" && <TerminalSettings />}
          </main>
        </div>
      </section>
    </div>
  );
}

function GeneralSettings() {
  const mode = useThemeStore((state) => state.mode);
  const setMode = useThemeStore((state) => state.setMode);
  return (
    <section>
      <h3>General</h3>
      <p className="settings-description">Application appearance.</p>
      <div className="setting-row">
        <div>
          <b>Theme</b>
          <small>Choose the interface color theme.</small>
        </div>
        <select
          aria-label="Theme"
          value={mode}
          onChange={(event) => setMode(event.target.value as "light" | "dark")}
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>
    </section>
  );
}

function AgentSettings() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText("~/.pi/agent");
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <section>
      <h3>Agent</h3>
      <p className="settings-description">
        SpireCode uses your existing pi configuration.
      </p>
      <div className="setting-row">
        <div>
          <b>Pi configuration</b>
          <small>Authentication and models are managed by pi.</small>
        </div>
        <code>~/.pi/agent</code>
        <button type="button" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy path"}
        </button>
      </div>
      <p className="settings-description">
        Agent tools and extensions run with the current user permissions.
      </p>
    </section>
  );
}
function EditorSettings() {
  const fontSize = useSettingsStore((s) => s.editorFontSize);
  const wordWrap = useSettingsStore((s) => s.wordWrap);
  const set = useSettingsStore((s) => s.setSetting);
  return (
    <section>
      <h3>Editor</h3>
      <p className="settings-description">Configure source editing.</p>
      <div className="setting-row">
        <div>
          <b>Font size</b>
        </div>
        <select
          aria-label="Editor font size"
          value={fontSize}
          onChange={(e) =>
            set("editorFontSize", Number(e.target.value) as 13 | 14 | 16 | 18)
          }
        >
          {[13, 14, 16, 18].map((v) => (
            <option key={v} value={v}>
              {v}px
            </option>
          ))}
        </select>
      </div>
      <div className="setting-row">
        <div>
          <b>Word wrap</b>
        </div>
        <select
          aria-label="Word wrap"
          value={wordWrap}
          onChange={(e) => set("wordWrap", e.target.value as "off" | "on")}
        >
          <option value="off">Off</option>
          <option value="on">On</option>
        </select>
      </div>
    </section>
  );
}
function TerminalSettings() {
  const fontSize = useSettingsStore((s) => s.terminalFontSize);
  const scrollback = useSettingsStore((s) => s.terminalScrollback);
  const set = useSettingsStore((s) => s.setSetting);
  return (
    <section>
      <h3>Terminal</h3>
      <p className="settings-description">Configure terminal rendering.</p>
      <div className="setting-row">
        <div>
          <b>Font size</b>
        </div>
        <select
          aria-label="Terminal font size"
          value={fontSize}
          onChange={(e) =>
            set("terminalFontSize", Number(e.target.value) as 12 | 13 | 14 | 16)
          }
        >
          {[12, 13, 14, 16].map((v) => (
            <option key={v} value={v}>
              {v}px
            </option>
          ))}
        </select>
      </div>
      <div className="setting-row">
        <div>
          <b>Scrollback</b>
        </div>
        <select
          aria-label="Terminal scrollback"
          value={scrollback}
          onChange={(e) =>
            set(
              "terminalScrollback",
              Number(e.target.value) as 1000 | 5000 | 10000 | 20000,
            )
          }
        >
          {[1000, 5000, 10000, 20000].map((v) => (
            <option key={v} value={v}>
              {v.toLocaleString()}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}

function ExtensionsSettings({ worktreeId }: { worktreeId: string | null }) {
  const [extensions, setExtensions] = useState<ExtensionSetting[]>([]);
  const [loading, setLoading] = useState(Boolean(worktreeId));
  const [changing, setChanging] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    if (!worktreeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    settingsApi.listExtensions(worktreeId).then(
      (items) => {
        if (!disposed) {
          setExtensions(items);
          setError(null);
          setLoading(false);
        }
      },
      (failure) => {
        if (!disposed) {
          setError(commandError(failure).message);
          setLoading(false);
        }
      },
    );
    return () => {
      disposed = true;
    };
  }, [worktreeId]);

  const toggle = async (extension: ExtensionSetting) => {
    if (!worktreeId) return;
    setChanging(extension.id);
    setError(null);
    try {
      setExtensions(
        await settingsApi.setExtensionEnabled(
          worktreeId,
          extension.id,
          !extension.enabled,
        ),
      );
    } catch (failure) {
      setError(commandError(failure).message);
    } finally {
      setChanging(null);
    }
  };

  return (
    <section>
      <h3>Extensions</h3>
      <p className="settings-description">
        Extensions run local code with your permissions. Changes apply to new
        Agent sessions.
      </p>
      {!worktreeId && (
        <div className="settings-empty">
          Open a project to manage extensions.
        </div>
      )}
      {loading && <div className="settings-empty">Loading extensions…</div>}
      {error && <div className="dialog-error">{error}</div>}
      {!loading && worktreeId && extensions.length === 0 && (
        <div className="settings-empty">
          No extensions found in .spirecode or .pi.
        </div>
      )}
      <div className="extension-list">
        {extensions.map((extension) => (
          <article className="extension-row" key={extension.id}>
            <div className="extension-details">
              <div className="extension-title">
                <b>{extension.name}</b>
                <span>{extension.source}</span>
                <span>{extension.scope}</span>
              </div>
              <code title={extension.displayPath}>{extension.displayPath}</code>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                aria-label={`${extension.enabled ? "Disable" : "Enable"} ${extension.name}`}
                checked={extension.enabled}
                disabled={changing === extension.id}
                onChange={() => void toggle(extension)}
              />
              <span />
            </label>
          </article>
        ))}
      </div>
    </section>
  );
}
