import {
  RiBookOpenLine,
  RiCloseLine,
  RiComputerLine,
  RiExternalLinkLine,
  RiFileList3Line,
  RiRobot2Line,
  RiSettings3Line,
  RiTerminalBoxLine,
} from "@remixicon/react";
import { useEffect, useState, type ReactNode } from "react";
import {
  formatNumber,
  setLanguage,
  useTranslation,
  type AppLanguage,
  type TranslationKey,
} from "../../i18n";
import {
  commands,
  type AgentReadiness,
  type ExtensionSetting,
  type SkillSetting,
} from "../../bindings";
import { commandError } from "../../lib/errors";
import { useDialogFocus } from "../../lib/useDialogFocus";
import { useThemeStore, type ThemeMode } from "../theme/themeStore";
import { useSettingsStore } from "./settingsStore";
import { MemorySettings } from "./MemorySettings";
import { settingsApi } from "./settingsApi";

export type SettingsSection =
  | "general"
  | "agent"
  | "skills"
  | "memory"
  | "extensions"
  | "editor"
  | "terminal";

const sections: Array<{
  id: SettingsSection;
  label: TranslationKey;
  icon: ReactNode;
}> = [
  {
    id: "general",
    label: "settings.section.general",
    icon: <RiSettings3Line size={16} />,
  },
  {
    id: "agent",
    label: "settings.section.agent",
    icon: <RiRobot2Line size={16} />,
  },
  {
    id: "skills",
    label: "settings.section.skills",
    icon: <RiBookOpenLine size={16} />,
  },
  {
    id: "memory",
    label: "settings.section.memory",
    icon: <RiFileList3Line size={16} />,
  },
  {
    id: "extensions",
    label: "settings.section.extensions",
    icon: <RiExternalLinkLine size={16} />,
  },
  {
    id: "editor",
    label: "settings.section.editor",
    icon: <RiComputerLine size={16} />,
  },
  {
    id: "terminal",
    label: "settings.section.terminal",
    icon: <RiTerminalBoxLine size={16} />,
  },
];

export function SettingsDialog({
  worktreeId,
  onClose,
  initialSection = "extensions",
}: {
  worktreeId: string | null;
  onClose: () => void;
  initialSection?: SettingsSection;
}) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const { t } = useTranslation();
  const { dialogRef, trapFocus } = useDialogFocus<HTMLElement>();
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        ref={dialogRef}
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          trapFocus(event);
          if (event.key === "Escape") onClose();
        }}
      >
        <header className="settings-header">
          <h2 id="settings-title">{t("settings.title")}</h2>
          <button aria-label={t("settings.close")} onClick={onClose} autoFocus>
            <RiCloseLine size={18} />
          </button>
        </header>
        <div className="settings-body">
          <nav
            className="settings-nav"
            aria-label={t("settings.sections.label")}
          >
            {sections.map((item) => (
              <button
                key={item.id}
                className={section === item.id ? "active" : ""}
                onClick={() => setSection(item.id)}
              >
                {item.icon}
                {t(item.label)}
              </button>
            ))}
          </nav>
          <main className="settings-content">
            {section === "general" && <GeneralSettings />}
            {section === "agent" && <AgentSettings />}
            {section === "skills" && <SkillsSettings worktreeId={worktreeId} />}
            {section === "memory" && <MemorySettings worktreeId={worktreeId} />}
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
  const [error, setError] = useState<string | null>(null);
  const [languageSaving, setLanguageSaving] = useState(false);
  const { language, t } = useTranslation();
  const changeLanguage = async (next: AppLanguage) => {
    if (next === language) return;
    setLanguageSaving(true);
    setError(null);
    try {
      setLanguage(await settingsApi.setLanguage(next));
    } catch (caught) {
      setError(commandError(caught).message);
    } finally {
      setLanguageSaving(false);
    }
  };
  return (
    <section>
      <h3>{t("settings.section.general")}</h3>
      <p className="settings-description">
        {t("settings.general.description")}
      </p>
      <div className="setting-row">
        <div>
          <b>{t("settings.general.theme.label")}</b>
          <small>{t("settings.general.theme.description")}</small>
        </div>
        <select
          aria-label={t("settings.general.theme.label")}
          value={mode}
          onChange={(event) => setMode(event.target.value as ThemeMode)}
        >
          <option value="system">{t("settings.general.theme.system")}</option>
          <option value="light">{t("settings.general.theme.light")}</option>
          <option value="dark">{t("settings.general.theme.dark")}</option>
        </select>
      </div>
      <div className="setting-row">
        <div>
          <b>{t("settings.general.language.label")}</b>
          <small>{t("settings.general.language.description")}</small>
        </div>
        <select
          aria-label={t("settings.general.language.label")}
          value={language}
          disabled={languageSaving}
          onChange={(event) =>
            void changeLanguage(event.target.value as AppLanguage)
          }
        >
          <option value="en">{t("settings.general.language.english")}</option>
          <option value="zh-CN">
            {t("settings.general.language.chinese")}
          </option>
        </select>
      </div>
      <div className="setting-row">
        <div>
          <b>{t("settings.general.feedback.label")}</b>
          <small>{t("settings.general.feedback.description")}</small>
        </div>
        <button
          type="button"
          onClick={() =>
            void commands
              .feedbackOpen()
              .catch((caught) => setError(commandError(caught).message))
          }
        >
          {t("settings.general.feedback.action")}
        </button>
      </div>
      {error && <div className="dialog-error">{error}</div>}
    </section>
  );
}

function AgentSettings() {
  const [copied, setCopied] = useState(false);
  const [readiness, setReadiness] = useState<AgentReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();
  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setReadiness(await settingsApi.getAgentReadiness());
    } catch (failure) {
      setError(commandError(failure).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  const copy = async () => {
    await navigator.clipboard.writeText("~/.pi/agent");
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  const ready =
    readiness?.resourcesHealthy &&
    readiness.defaultModelAvailable &&
    readiness.authenticatedModelCount > 0;
  return (
    <section>
      <h3>{t("settings.section.agent")}</h3>
      <p className="settings-description">{t("settings.agent.description")}</p>
      <div className="setting-row">
        <div>
          <b>{t("settings.agent.status")}</b>
          <small>
            {loading
              ? t("settings.agent.checking")
              : ready
                ? t("settings.agent.ready", {
                    count: readiness.authenticatedModelCount,
                  })
                : t("settings.agent.setupRequired")}
          </small>
        </div>
        <button type="button" disabled={loading} onClick={() => void refresh()}>
          {t("settings.agent.refresh")}
        </button>
      </div>
      {!loading && !ready && (
        <div className="settings-empty">
          {t("settings.agent.setupInstructions")}
        </div>
      )}
      {readiness && !readiness.resourcesHealthy && (
        <div className="dialog-error">
          {t("settings.agent.resourcesFailed")}
        </div>
      )}
      {error && <div className="dialog-error">{error}</div>}
      <div className="setting-row">
        <div>
          <b>{t("settings.agent.configuration")}</b>
          <small>{t("settings.agent.configuration.description")}</small>
        </div>
        <code>~/.pi/agent</code>
        <button type="button" onClick={() => void copy()}>
          {copied ? t("settings.agent.copied") : t("settings.agent.copyPath")}
        </button>
      </div>
      <p className="settings-description">{t("settings.agent.permissions")}</p>
    </section>
  );
}
function EditorSettings() {
  const fontSize = useSettingsStore((s) => s.editorFontSize);
  const wordWrap = useSettingsStore((s) => s.wordWrap);
  const set = useSettingsStore((s) => s.setSetting);
  const { t } = useTranslation();
  return (
    <section>
      <h3>{t("settings.section.editor")}</h3>
      <p className="settings-description">{t("settings.editor.description")}</p>
      <div className="setting-row">
        <div>
          <b>{t("settings.editor.fontSize")}</b>
        </div>
        <select
          aria-label={t("settings.editor.fontSize.aria")}
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
          <b>{t("settings.editor.wordWrap")}</b>
        </div>
        <select
          aria-label={t("settings.editor.wordWrap")}
          value={wordWrap}
          onChange={(e) => set("wordWrap", e.target.value as "off" | "on")}
        >
          <option value="off">{t("settings.common.off")}</option>
          <option value="on">{t("settings.common.on")}</option>
        </select>
      </div>
    </section>
  );
}
function TerminalSettings() {
  const { t } = useTranslation();
  const fontSize = useSettingsStore((s) => s.terminalFontSize);
  const scrollback = useSettingsStore((s) => s.terminalScrollback);
  const set = useSettingsStore((s) => s.setSetting);
  return (
    <section>
      <h3>{t("settings.section.terminal")}</h3>
      <p className="settings-description">
        {t("settings.terminal.description")}
      </p>
      <div className="setting-row">
        <div>
          <b>{t("settings.editor.fontSize")}</b>
        </div>
        <select
          aria-label={t("settings.terminal.fontSize.aria")}
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
          <b>{t("settings.terminal.scrollback")}</b>
        </div>
        <select
          aria-label={t("settings.terminal.scrollback.aria")}
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
              {formatNumber(v)}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}

function SkillsSettings({ worktreeId }: { worktreeId: string | null }) {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<SkillSetting[]>([]);
  const [loading, setLoading] = useState(Boolean(worktreeId));
  const [changing, setChanging] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    if (!worktreeId) {
      setSkills([]);
      setLoading(false);
      return;
    }
    setSkills([]);
    setLoading(true);
    settingsApi.listSkills(worktreeId).then(
      (items) => {
        if (!disposed) {
          setSkills(items);
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

  const toggle = async (skill: SkillSetting) => {
    if (!worktreeId) return;
    setChanging(skill.id);
    setError(null);
    try {
      setSkills(
        await settingsApi.setSkillEnabled(worktreeId, skill.id, !skill.enabled),
      );
    } catch (failure) {
      setError(commandError(failure).message);
    } finally {
      setChanging(null);
    }
  };

  const skillList = (items: SkillSetting[]) =>
    items.length > 0 ? (
      <div className="extension-list">
        {items.map((skill) => (
          <article className="extension-row" key={skill.id}>
            <div className="extension-details">
              <div className="extension-title">
                <b>{skill.name}</b>
                {skill.disableModelInvocation && (
                  <span>{t("settings.skills.explicitOnly")}</span>
                )}
              </div>
              <small className="skill-description">{skill.description}</small>
              <code title={skill.displayPath}>{skill.displayPath}</code>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                aria-label={t(
                  skill.enabled
                    ? "settings.skills.toggle.disable"
                    : "settings.skills.toggle.enable",
                  { name: skill.name },
                )}
                checked={skill.enabled}
                disabled={changing === skill.id}
                onChange={() => void toggle(skill)}
              />
              <span />
            </label>
          </article>
        ))}
      </div>
    ) : (
      <div className="settings-empty">{t("settings.skills.empty")}</div>
    );

  return (
    <section>
      <h3>{t("settings.section.skills")}</h3>
      <p className="settings-description">{t("settings.skills.description")}</p>
      {!worktreeId && (
        <div className="settings-empty">
          {t("settings.skills.projectRequired")}
        </div>
      )}
      {loading && (
        <div className="settings-empty">{t("settings.skills.loading")}</div>
      )}
      {error && <div className="dialog-error">{error}</div>}
      {!loading && worktreeId && (
        <div className="extension-sections">
          {(
            [
              [
                "builtin",
                "settings.skills.system",
                "settings.skills.system.description",
              ],
              [
                "user",
                "settings.skills.user",
                "settings.skills.user.description",
              ],
              [
                "project",
                "settings.skills.project",
                "settings.skills.project.description",
              ],
            ] as const
          ).map(([kind, heading, description]) => (
            <section className="extension-section" key={kind}>
              <h4>{t(heading)}</h4>
              <p>{t(description)}</p>
              {skillList(skills.filter((skill) => skill.kind === kind))}
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function ExtensionsSettings({ worktreeId }: { worktreeId: string | null }) {
  const { t } = useTranslation();
  const [extensions, setExtensions] = useState<ExtensionSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    setLoading(true);
    settingsApi.listExtensions(worktreeId ?? undefined).then(
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

  const extensionList = (items: ExtensionSetting[]) => (
    <div className="extension-list">
      {items.map((extension) => (
        <article className="extension-row" key={extension.id}>
          <div className="extension-details">
            <div className="extension-title">
              <b>{extension.name}</b>
              {extension.version && <span>v{extension.version}</span>}
              <span>{extension.source}</span>
            </div>
            <code title={extension.displayPath}>{extension.displayPath}</code>
            <small>
              {extension.enabled
                ? t("settings.extensions.status.enabled")
                : t("settings.extensions.status.disabled")}
            </small>
          </div>
        </article>
      ))}
    </div>
  );

  return (
    <section>
      <h3>{t("settings.section.extensions")}</h3>
      <p className="settings-description">
        {t("settings.extensions.description")}
      </p>
      {loading && (
        <div className="settings-empty">{t("settings.extensions.loading")}</div>
      )}
      {error && <div className="dialog-error">{error}</div>}
      {!loading && (
        <div className="extension-sections">
          <section className="extension-section">
            <h4>{t("settings.extensions.user")}</h4>
            <p>{t("settings.extensions.user.description")}</p>
            {extensions.length > 0 ? (
              extensionList(extensions)
            ) : (
              <div className="settings-empty">
                {t("settings.extensions.user.empty")}
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
