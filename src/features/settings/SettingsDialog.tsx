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
            {section === "memory" && <MemorySettings />}
            {section === "extensions" && (
              <ExtensionsSettings worktreeId={worktreeId} />
            )}
            {section !== "general" &&
              section !== "memory" &&
              section !== "extensions" && (
                <ComingSoon
                  title={sections.find(({ id }) => id === section)!.label}
                />
              )}
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

function ComingSoon({ title }: { title: string }) {
  return (
    <section>
      <h3>{title}</h3>
      <div className="settings-empty">
        More settings will be available here.
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
