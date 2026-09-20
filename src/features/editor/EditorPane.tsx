import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  RiChatNewLine,
  RiChatHistoryLine,
  RiCloseLine,
  RiFileCodeLine,
  RiGitCommitLine,
  RiTerminalBoxLine,
} from "@remixicon/react";
import {
  commands,
  type CommandError,
  type FileContent,
  type GitDiff,
} from "../../bindings";
import { useTranslation } from "../../i18n";
import { commandError } from "../../lib/errors";
import { ResourceCache } from "../../lib/resourceCache";
import { chatRuntime, ChatHistory, ChatView, hostChatApi } from "../chat";
import { useChangesStore } from "../changes/changesStore";
import { useProjectsStore } from "../projects/projectsStore";
import { defineMonacoTheme, monacoThemeName } from "../theme/themeColors";
import { useThemeStore } from "../theme/themeStore";
import { useSettingsStore } from "../settings/settingsStore";
import { TerminalInstance } from "../terminal/TerminalInstance";
import { terminalStream } from "../terminal/terminalStream";
import {
  chatResourceId,
  useEditorStore,
  type ResourceTab,
} from "./editorStore";

const MonacoEditor = lazy(() =>
  import("./monacoEditors").then((module) => ({
    default: module.default,
  })),
);
const MonacoDiffEditor = lazy(() =>
  import("./monacoEditors").then((module) => ({
    default: module.DiffEditor,
  })),
);
interface CachedResource {
  generation: number;
  value: FileContent | GitDiff;
}

const cache = new ResourceCache<CachedResource>();
export const clearEditorResourceCache = () => cache.deletePrefix("");
interface FileDraft {
  content: string;
  savedContent: string;
  version: string;
}
const fileDrafts = new Map<string, FileDraft>();
export const clearEditorDrafts = () => fileDrafts.clear();
type LoadState =
  | { status: "loading" }
  | { status: "ready"; value: FileContent | GitDiff }
  | { status: "error"; error: CommandError };

type DocumentTab = Extract<ResourceTab, { type: "file" | "diff" }>;

function ResourceView({ tab }: { tab: DocumentTab }) {
  const { t } = useTranslation();
  const [state, setState] = useState<LoadState>(() => {
    const cached = cache.get(tab.id);
    return cached
      ? { status: "ready", value: cached.value }
      : { status: "loading" };
  });
  const navigationGeneration = useEditorStore(
    (store) => store.navigationGeneration,
  );
  const fileGeneration = useEditorStore(
    (store) => store.resourceGenerationByWorktree[tab.worktreeId] ?? 0,
  );
  const diffGeneration = useEditorStore(
    (store) => store.diffGenerationByWorktree[tab.worktreeId] ?? 0,
  );
  const resourceGeneration =
    tab.type === "file" ? fileGeneration : diffGeneration;
  useEffect(() => {
    const cached = cache.get(tab.id);
    if (cached?.generation === resourceGeneration) {
      setState({ status: "ready", value: cached.value });
      return;
    }
    if (cached) setState({ status: "ready", value: cached.value });
    else setState({ status: "loading" });
    const request =
      tab.type === "file"
        ? commands.fsReadFile(tab.worktreeId, tab.relativePath)
        : commands.gitDiffFile(tab.worktreeId, tab.relativePath, tab.scope);
    void request.then(
      (value) => {
        const latest = useEditorStore.getState();
        const latestGeneration =
          tab.type === "file"
            ? (latest.resourceGenerationByWorktree[tab.worktreeId] ?? 0)
            : (latest.diffGenerationByWorktree[tab.worktreeId] ?? 0);
        const resourceIsCurrent = latestGeneration === resourceGeneration;
        if (resourceIsCurrent)
          cache.set(tab.id, { generation: resourceGeneration, value });
        const openTab = latest.views[tab.worktreeId]?.tabs.find(
          (candidate) => candidate.id === tab.id,
        );
        if (
          latest.navigationGeneration === navigationGeneration &&
          resourceIsCurrent &&
          !(openTab?.type === "file" && openTab.dirty)
        )
          setState({ status: "ready", value });
      },
      (error) => {
        const latest = useEditorStore.getState();
        if (
          latest.navigationGeneration === navigationGeneration &&
          (tab.type === "file"
            ? (latest.resourceGenerationByWorktree[tab.worktreeId] ?? 0)
            : (latest.diffGenerationByWorktree[tab.worktreeId] ?? 0)) ===
            resourceGeneration
        )
          setState((current) =>
            current.status === "ready"
              ? current
              : { status: "error", error: commandError(error) },
          );
      },
    );
  }, [
    navigationGeneration,
    resourceGeneration,
    tab.id,
    tab.relativePath,
    tab.type === "diff" ? tab.scope : undefined,
    tab.type,
    tab.worktreeId,
  ]);
  if (state.status === "loading")
    return (
      <div className="viewer-state">
        <span className="spinner" />
        {t("editor.loadingResource")}
      </div>
    );
  if (state.status === "error")
    return (
      <div className="viewer-state error">
        <RiFileCodeLine size={28} />
        <b>{state.error.code}</b>
        <span>{state.error.message}</span>
      </div>
    );
  const language =
    "language" in state.value ? (state.value.language ?? undefined) : undefined;
  if (tab.type === "diff" && "scope" in state.value)
    return <DiffView diff={state.value} />;
  if (!("content" in state.value)) return null;
  return (
    <FileView
      file={state.value}
      language={language}
      resourceGeneration={resourceGeneration}
      tab={tab as Extract<ResourceTab, { type: "file" }>}
      onSaved={(saved) => setState({ status: "ready", value: saved })}
    />
  );
}

function FileView({
  file,
  language,
  resourceGeneration,
  tab,
  onSaved,
}: {
  file: FileContent;
  language: string | undefined;
  resourceGeneration: number;
  tab: Extract<ResourceTab, { type: "file" }>;
  onSaved: (saved: FileContent) => void;
}) {
  const { t } = useTranslation();
  const resolvedTheme = useThemeStore((theme) => theme.resolved);
  const editorFontSize = useSettingsStore(
    (settings) => settings.editorFontSize,
  );
  const wordWrap = useSettingsStore((settings) => settings.wordWrap);
  const initialDraft = fileDrafts.get(tab.id);
  const [content, setContent] = useState(initialDraft?.content ?? file.content);
  const [savedContent, setSavedContent] = useState(
    initialDraft?.savedContent ?? file.content,
  );
  const [version, setVersion] = useState(initialDraft?.version ?? file.version);
  const [saveError, setSaveError] = useState<CommandError | null>(null);
  const [compareContent, setCompareContent] = useState<string | null>(null);
  const [conflictAction, setConflictAction] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const skipNextFileSync = useRef(false);
  const dirty = content !== savedContent;
  const saveState = useRef({
    conflictAction,
    content,
    dirty,
    saveError,
    saving,
    version,
  });
  saveState.current = {
    conflictAction,
    content,
    dirty,
    saveError,
    saving,
    version,
  };

  useEffect(() => {
    if (skipNextFileSync.current) {
      skipNextFileSync.current = false;
      return;
    }
    if (dirty) return;
    setContent(file.content);
    setSavedContent(file.content);
    setVersion(file.version);
    fileDrafts.delete(tab.id);
  }, [dirty, file.content, file.version, tab.id]);

  useEffect(() => {
    useEditorStore.getState().setFileDirty(tab.worktreeId, tab.id, dirty);
  }, [dirty, tab.id, tab.worktreeId]);

  const reloadFromDisk = async () => {
    setConflictAction("reload");
    try {
      const latest = await commands.fsReadFile(
        tab.worktreeId,
        tab.relativePath,
      );
      cache.set(tab.id, { generation: resourceGeneration, value: latest });
      skipNextFileSync.current = true;
      setContent(latest.content);
      setSavedContent(latest.content);
      setVersion(latest.version);
      setCompareContent(null);
      fileDrafts.delete(tab.id);
      setSaveError(null);
      onSaved(latest);
    } catch (error) {
      setSaveError(commandError(error));
    } finally {
      setConflictAction(null);
    }
  };
  const compareWithDisk = async () => {
    setConflictAction("compare");
    try {
      const latest = await commands.fsReadFile(
        tab.worktreeId,
        tab.relativePath,
      );
      setCompareContent(latest.content);
    } catch (error) {
      setSaveError(commandError(error));
    } finally {
      setConflictAction(null);
    }
  };
  const overwriteDisk = async () => {
    setConflictAction("overwrite");
    try {
      const latest = await commands.fsReadFile(
        tab.worktreeId,
        tab.relativePath,
      );
      const saved = await commands.fsWriteFile(
        tab.worktreeId,
        tab.relativePath,
        content,
        latest.version,
      );
      cache.set(tab.id, { generation: resourceGeneration, value: saved });
      skipNextFileSync.current = true;
      setContent(saved.content);
      setSavedContent(saved.content);
      setVersion(saved.version);
      setCompareContent(null);
      fileDrafts.delete(tab.id);
      setSaveError(null);
      onSaved(saved);
    } catch (error) {
      setSaveError(commandError(error));
    } finally {
      setConflictAction(null);
    }
  };

  const saveFromShortcut = useRef<() => Promise<void>>(async () => undefined);
  saveFromShortcut.current = async () => {
    const latest = saveState.current;
    if (
      !latest.dirty ||
      latest.saving ||
      latest.conflictAction ||
      latest.saveError?.code === "FILE_CONFLICT"
    )
      return;
    saveState.current = { ...latest, saving: true, saveError: null };
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await commands.fsWriteFile(
        tab.worktreeId,
        tab.relativePath,
        latest.content,
        latest.version,
      );
      cache.set(tab.id, {
        generation: resourceGeneration,
        value: saved,
      });
      const contentAfterSave = saveState.current.content;
      const changedWhileSaving = contentAfterSave !== latest.content;
      saveState.current = {
        conflictAction: null,
        content: contentAfterSave,
        dirty: changedWhileSaving,
        saveError: null,
        saving: true,
        version: saved.version,
      };
      onSaved(saved);
      setContent(contentAfterSave);
      setSavedContent(saved.content);
      setVersion(saved.version);
      useEditorStore
        .getState()
        .setFileDirty(tab.worktreeId, tab.id, changedWhileSaving);
      if (changedWhileSaving) {
        fileDrafts.set(tab.id, {
          content: contentAfterSave,
          savedContent: saved.content,
          version: saved.version,
        });
      } else {
        fileDrafts.delete(tab.id);
      }
    } catch (error) {
      const nextError = commandError(error);
      saveState.current = { ...saveState.current, saveError: nextError };
      setSaveError(nextError);
    } finally {
      saveState.current = { ...saveState.current, saving: false };
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "s"
      ))
        return;
      event.preventDefault();
      void saveFromShortcut.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="editable-file-view">
      {saveError && (
        <div className="file-save-error" role="alert">
          <span>{saveError.message}</span>
          {saveError.code === "FILE_CONFLICT" && (
            <div className="file-conflict-actions">
              <button
                type="button"
                disabled={conflictAction !== null || saving}
                onClick={() => void reloadFromDisk()}
              >
                {conflictAction === "reload"
                  ? t("common.loading")
                  : t("editor.conflict.reload")}
              </button>
              <button
                type="button"
                disabled={conflictAction !== null || saving}
                onClick={() => void compareWithDisk()}
              >
                {conflictAction === "compare"
                  ? t("common.loading")
                  : t("editor.conflict.compare")}
              </button>
              <button
                type="button"
                disabled={conflictAction !== null || saving}
                onClick={() => void overwriteDisk()}
              >
                {conflictAction === "overwrite"
                  ? t("common.loading")
                  : t("editor.conflict.overwrite")}
              </button>
            </div>
          )}
        </div>
      )}
      {compareContent !== null && (
        <div
          className="file-conflict-compare"
          role="region"
          aria-label={t("editor.diskVersion")}
        >
          <b>{t("editor.diskVersion")}</b>
          <pre>{compareContent}</pre>
        </div>
      )}
      <Suspense
        fallback={
          <div className="viewer-state">{t("editor.loadingEditor")}</div>
        }
      >
        <MonacoEditor
          value={content}
          language={language}
          theme={monacoThemeName(resolvedTheme)}
          beforeMount={(monaco) => defineMonacoTheme(monaco, resolvedTheme)}
          onChange={(value) => {
            const nextContent = value ?? "";
            const nextDirty = nextContent !== savedContent;
            setContent(nextContent);
            setSaveError(null);
            useEditorStore
              .getState()
              .setFileDirty(tab.worktreeId, tab.id, nextDirty);
            if (!nextDirty) fileDrafts.delete(tab.id);
            else
              fileDrafts.set(tab.id, {
                content: nextContent,
                savedContent,
                version,
              });
          }}
          options={{
            readOnly: false,
            domReadOnly: false,
            minimap: { enabled: false },
            fontSize: editorFontSize,
            wordWrap,
            padding: { top: 16 },
          }}
        />
      </Suspense>
    </div>
  );
}

function languageForPath(path: string): string | undefined {
  const extension = path.split(".").pop()?.toLowerCase();
  return {
    css: "css",
    html: "html",
    js: "javascript",
    json: "json",
    jsx: "javascript",
    md: "markdown",
    py: "python",
    rs: "rust",
    ts: "typescript",
    tsx: "typescript",
  }[extension ?? ""];
}

function DiffView({ diff }: { diff: GitDiff }) {
  const { t } = useTranslation();
  const resolvedTheme = useThemeStore((theme) => theme.resolved);
  const diffMode = useChangesStore((store) => store.diffMode);
  const setDiffMode = useChangesStore((store) => store.setDiffMode);
  return (
    <div className="diff-source-view">
      <div className="diff-source-note">
        <span>{t("editor.fileComparison")}</span>
        <div
          className="diff-mode-toggle"
          role="group"
          aria-label={t("editor.diffLayout")}
        >
          <button
            className={diffMode === "unified" ? "active" : ""}
            onClick={() => setDiffMode("unified")}
          >
            {t("editor.diffInline")}
          </button>
          <button
            className={diffMode === "split" ? "active" : ""}
            onClick={() => setDiffMode("split")}
          >
            {t("editor.diffSplit")}
          </button>
        </div>
      </div>
      <Suspense
        fallback={<div className="viewer-state">{t("editor.loadingDiff")}</div>}
      >
        <MonacoDiffEditor
          original={diff.original ?? ""}
          modified={diff.modified ?? ""}
          originalLanguage={languageForPath(diff.path)}
          modifiedLanguage={languageForPath(diff.path)}
          theme={monacoThemeName(resolvedTheme)}
          beforeMount={(monaco) => defineMonacoTheme(monaco, resolvedTheme)}
          options={{
            readOnly: true,
            renderSideBySide: diffMode === "split",
            minimap: { enabled: false },
            fontSize: 13,
          }}
        />
      </Suspense>
    </div>
  );
}

export function EditorPane({ worktreeId }: { worktreeId: string }) {
  const { t } = useTranslation();
  const view = useEditorStore((state) => state.views[worktreeId]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyConfirmOpen, setHistoryConfirmOpen] = useState(false);
  const historyId = useId();
  const historyTriggerRef = useRef<HTMLButtonElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const closeHistoryWithFocus = () => {
    setHistoryOpen(false);
    historyTriggerRef.current?.focus();
  };

  useEffect(() => {
    setHistoryOpen(false);
    setHistoryConfirmOpen(false);
  }, [worktreeId]);

  useEffect(() => {
    if (!historyOpen || historyConfirmOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const path = event.composedPath();
      if (
        !path.includes(historyRef.current as EventTarget) &&
        !path.includes(historyTriggerRef.current as EventTarget)
      )
        setHistoryOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setHistoryOpen(false);
      historyTriggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [historyConfirmOpen, historyOpen]);

  const createChat = async () => {
    const navigation = useEditorStore.getState().beginNavigation();
    try {
      const session = await hostChatApi.create(worktreeId);
      if (useEditorStore.getState().navigationGeneration === navigation)
        useEditorStore
          .getState()
          .openChat(worktreeId, session.sessionId, session.title);
    } catch (error) {
      useProjectsStore.getState().setError(commandError(error));
    }
  };
  const createTerminal = async () => {
    let terminalId: string | null = null;
    try {
      const terminal = await commands.terminalCreate(worktreeId);
      terminalId = terminal.terminalId;
      await commands.terminalAttach(terminal.terminalId, terminalStream.push);
      useEditorStore.getState().openTerminal(worktreeId, terminal.terminalId);
    } catch (error) {
      if (terminalId) {
        await commands.terminalClose(terminalId, true).catch(() => undefined);
        terminalStream.close(terminalId);
      }
      useProjectsStore.getState().setError(commandError(error));
    }
  };
  const closeTab = async (tab: ResourceTab) => {
    if (tab.type !== "terminal") {
      if (tab.type === "file") fileDrafts.delete(tab.id);
      useEditorStore.getState().close(worktreeId, tab.id);
      return;
    }
    await disposeTerminal(tab);
  };
  const disposeTerminal = async (
    tab: Extract<ResourceTab, { type: "terminal" }>,
  ): Promise<boolean> => {
    try {
      await commands.terminalClose(tab.terminalId, true);
    } catch (error) {
      const failure = commandError(error);
      if (failure.code !== "TERMINAL_NOT_FOUND") {
        useProjectsStore.getState().setError(failure);
        return false;
      }
    }
    terminalStream.close(tab.terminalId);
    useEditorStore.getState().close(worktreeId, tab.id);
    return true;
  };
  const restartTerminal = async (
    tab: Extract<ResourceTab, { type: "terminal" }>,
  ) => {
    if (await disposeTerminal(tab)) await createTerminal();
  };
  const active = useMemo(
    () => view?.tabs.find((tab) => tab.id === view.activeTabId),
    [view],
  );
  const activateTab = (tabId: string) => {
    useEditorStore.getState().beginNavigation();
    useEditorStore.getState().activate(worktreeId, tabId);
  };
  const onTabKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    tabId: string,
  ) => {
    const tabs = view?.tabs ?? [];
    const currentIndex = tabs.findIndex((tab) => tab.id === tabId);
    if (currentIndex < 0) return;
    let nextIndex: number | undefined;
    if (event.key === "ArrowLeft")
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === "ArrowRight")
      nextIndex = (currentIndex + 1) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    activateTab(nextTab.id);
    const tabElements = event.currentTarget
      .closest('[role="tablist"]')
      ?.querySelectorAll<HTMLElement>('[role="tab"]');
    tabElements?.[nextIndex]?.focus();
  };
  const tabName = (tab: ResourceTab) =>
    tab.type === "terminal"
      ? t("editor.terminalTitle", { number: tab.sequence })
      : tab.type === "chat"
        ? tab.title || t("editor.newChat")
        : tab.relativePath.split("/").slice(-1)[0];
  return (
    <main className="editor-pane">
      <div className="editor-tabs">
        <div className="editor-tab-list" role="tablist">
          {(view?.tabs ?? []).map((tab) => {
            const selected = tab.id === view.activeTabId;
            const name = tabName(tab);
            return (
              <div
                className={`editor-tab ${selected ? "active" : ""}`}
                key={tab.id}
              >
                <button
                  type="button"
                  className="editor-tab-activation"
                  role="tab"
                  aria-label={name}
                  aria-selected={selected}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => activateTab(tab.id)}
                  onDoubleClick={() =>
                    useEditorStore.getState().keep(worktreeId, tab.id)
                  }
                  onKeyDown={(event) => onTabKeyDown(event, tab.id)}
                >
                  {tab.type === "diff" ? (
                    <RiGitCommitLine size={14} />
                  ) : tab.type === "terminal" ? (
                    <RiTerminalBoxLine size={14} />
                  ) : tab.type === "chat" ? (
                    <RiChatNewLine size={14} />
                  ) : (
                    <RiFileCodeLine size={14} />
                  )}
                  <span className={tab.preview ? "preview-label" : ""}>
                    {name}
                  </span>
                  {tab.type === "file" && tab.dirty && (
                    <span
                      className="tab-dirty"
                      aria-label={t("editor.unsavedChanges")}
                    >
                      ●
                    </span>
                  )}
                  {tab.type === "terminal" && tab.status !== "running" && (
                    <span className={`tab-status tab-status-${tab.status}`}>
                      {t(`editor.terminal.${tab.status}`)}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className="tab-close"
                  aria-label={t("editor.closeTab", { name })}
                  onClick={() => {
                    const latestTab = useEditorStore
                      .getState()
                      .views[worktreeId]?.tabs.find(
                        (candidate) => candidate.id === tab.id,
                      );
                    if (
                      latestTab?.type === "file" &&
                      latestTab.dirty &&
                      !window.confirm(
                        t("editor.discardConfirm", {
                          path: latestTab.relativePath,
                        }),
                      )
                    )
                      return;
                    void closeTab(latestTab ?? tab);
                  }}
                >
                  <RiCloseLine size={14} />
                </button>
              </div>
            );
          })}
        </div>
        <div className="editor-resource-actions">
          <button
            ref={historyTriggerRef}
            title={t("editor.chatHistory")}
            aria-label={t("editor.chatHistory")}
            aria-expanded={historyOpen}
            aria-controls={historyOpen ? historyId : undefined}
            onClick={() => setHistoryOpen((open) => !open)}
          >
            <RiChatHistoryLine size={16} />
          </button>
          <button
            title={t("editor.newChat")}
            aria-label={t("editor.newChat")}
            onClick={() => void createChat()}
          >
            <RiChatNewLine size={16} />
          </button>
          <button
            title={t("editor.newTerminal")}
            aria-label={t("editor.newTerminal")}
            onClick={() => void createTerminal()}
          >
            <RiTerminalBoxLine size={16} />
          </button>
        </div>
      </div>
      <div className="editor-content">
        {historyOpen && (
          <div ref={historyRef} id={historyId} className="chat-history-popover">
            <ChatHistory
              worktreeId={worktreeId}
              api={hostChatApi}
              activeSessionId={
                active?.type === "chat" ? active.sessionId : undefined
              }
              onClose={closeHistoryWithFocus}
              onConfirmOpenChange={setHistoryConfirmOpen}
              onDeleteError={(error) =>
                useProjectsStore.getState().setError(error)
              }
              onDelete={(session) => {
                useEditorStore
                  .getState()
                  .close(
                    worktreeId,
                    chatResourceId(worktreeId, session.sessionId),
                  );
                chatRuntime.remove(session.sessionId);
              }}
              onOpen={(session) => {
                useEditorStore
                  .getState()
                  .openChat(worktreeId, session.sessionId, session.title);
                setHistoryOpen(false);
              }}
            />
          </div>
        )}
        {active ? (
          active.type === "terminal" ? (
            <div className="terminal-view">
              {active.status !== "running" && (
                <div className="terminal-status-banner" role="status">
                  <span>
                    {active.status === "error"
                      ? t("editor.terminal.processFailed")
                      : t("editor.terminal.processExited")}
                  </span>
                  <button
                    type="button"
                    className="terminal-status-restart"
                    onClick={() => void restartTerminal(active)}
                  >
                    {t("editor.terminal.restart")}
                  </button>
                </div>
              )}
              <TerminalInstance
                key={active.id}
                worktreeId={worktreeId}
                terminalId={active.terminalId}
              />
            </div>
          ) : active.type === "chat" ? (
            <ChatView
              key={active.id}
              worktreeId={worktreeId}
              sessionId={active.sessionId}
              api={hostChatApi}
              onError={(error) =>
                useProjectsStore.getState().setError(commandError(error))
              }
            />
          ) : (
            <ResourceView key={active.id} tab={active} />
          )
        ) : (
          <div className="editor-empty">
            <RiFileCodeLine size={42} />
            <h2>{t("editor.empty.title")}</h2>
            <p>{t("editor.empty.description")}</p>
            <div>
              <RiChatNewLine size={14} />
              <span>{t("editor.empty.chat")}</span>
            </div>
            <div>
              <RiTerminalBoxLine size={14} />
              <span>{t("editor.empty.terminal")}</span>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
