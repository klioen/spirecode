import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
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
import { commandError } from "../../lib/errors";
import { ResourceCache } from "../../lib/resourceCache";
import { chatRuntime, ChatHistory, ChatView, hostChatApi } from "../chat";
import { useChangesStore } from "../changes/changesStore";
import { useProjectsStore } from "../projects/projectsStore";
import { defineMonacoTheme, monacoThemeName } from "../theme/themeColors";
import { useThemeStore } from "../theme/themeStore";
import { TerminalInstance } from "../terminal/TerminalInstance";
import { terminalStream } from "../terminal/terminalStream";
import {
  chatResourceId,
  useEditorStore,
  type ResourceTab,
} from "./editorStore";

const MonacoEditor = lazy(() =>
  import("@monaco-editor/react").then((module) => ({
    default: module.default,
  })),
);
const MonacoDiffEditor = lazy(() =>
  import("@monaco-editor/react").then((module) => ({
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
type LoadState =
  | { status: "loading" }
  | { status: "ready"; value: FileContent | GitDiff }
  | { status: "error"; error: CommandError };

type DocumentTab = Extract<ResourceTab, { type: "file" | "diff" }>;

function ResourceView({ tab }: { tab: DocumentTab }) {
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
        Loading resource…
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
  const resolvedTheme = useThemeStore((theme) => theme.resolved);
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

  useEffect(() => {
    const save = async () => {
      if (!dirty || saving || conflictAction || saveError) return;
      setSaving(true);
      setSaveError(null);
      try {
        const saved = await commands.fsWriteFile(
          tab.worktreeId,
          tab.relativePath,
          content,
          version,
        );
        cache.set(tab.id, {
          generation: resourceGeneration,
          value: saved,
        });
        onSaved(saved);
        setContent(saved.content);
        setSavedContent(saved.content);
        setVersion(saved.version);
        fileDrafts.delete(tab.id);
      } catch (error) {
        setSaveError(commandError(error));
      } finally {
        setSaving(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey && event.key.toLowerCase() === "s")) return;
      event.preventDefault();
      void save();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    conflictAction,
    content,
    dirty,
    onSaved,
    resourceGeneration,
    saving,
    tab.id,
    tab.relativePath,
    tab.worktreeId,
    version,
  ]);

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
                {conflictAction === "reload" ? "Loading…" : "Reload"}
              </button>
              <button
                type="button"
                disabled={conflictAction !== null || saving}
                onClick={() => void compareWithDisk()}
              >
                {conflictAction === "compare" ? "Loading…" : "Compare"}
              </button>
              <button
                type="button"
                disabled={conflictAction !== null || saving}
                onClick={() => void overwriteDisk()}
              >
                {conflictAction === "overwrite" ? "Loading…" : "Overwrite"}
              </button>
            </div>
          )}
        </div>
      )}
      {compareContent !== null && (
        <div
          className="file-conflict-compare"
          role="region"
          aria-label="Disk version"
        >
          <b>Disk version</b>
          <pre>{compareContent}</pre>
        </div>
      )}
      <Suspense fallback={<div className="viewer-state">Loading editor…</div>}>
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
            fontSize: 13,
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
  const resolvedTheme = useThemeStore((theme) => theme.resolved);
  const diffMode = useChangesStore((store) => store.diffMode);
  const setDiffMode = useChangesStore((store) => store.setDiffMode);
  return (
    <div className="diff-source-view">
      <div className="diff-source-note">
        <span>File comparison</span>
        <div className="diff-mode-toggle" role="group" aria-label="Diff layout">
          <button
            className={diffMode === "unified" ? "active" : ""}
            onClick={() => setDiffMode("unified")}
          >
            Inline
          </button>
          <button
            className={diffMode === "split" ? "active" : ""}
            onClick={() => setDiffMode("split")}
          >
            Split
          </button>
        </div>
      </div>
      <Suspense
        fallback={<div className="viewer-state">Loading diff viewer…</div>}
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
  return (
    <main className="editor-pane">
      <div className="editor-tabs">
        <div className="editor-tab-list">
          {(view?.tabs ?? []).map((tab) => (
            <button
              className={`editor-tab ${tab.id === view.activeTabId ? "active" : ""}`}
              key={tab.id}
              onClick={() => {
                useEditorStore.getState().beginNavigation();
                useEditorStore.getState().activate(worktreeId, tab.id);
              }}
              onDoubleClick={() =>
                useEditorStore.getState().keep(worktreeId, tab.id)
              }
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
                {tab.type === "terminal" || tab.type === "chat"
                  ? tab.title
                  : tab.relativePath.split("/").slice(-1)[0]}
              </span>
              {tab.type === "file" && tab.dirty && (
                <span className="tab-dirty" aria-label="Unsaved changes">
                  ●
                </span>
              )}
              {tab.type === "terminal" && tab.status !== "running" && (
                <span className={`tab-status tab-status-${tab.status}`}>
                  {tab.status}
                </span>
              )}
              <span
                className="tab-close"
                role="button"
                aria-label={`Close ${
                  tab.type === "terminal" || tab.type === "chat"
                    ? tab.title
                    : tab.relativePath.split("/").slice(-1)[0]
                }`}
                onClick={(event) => {
                  event.stopPropagation();
                  if (
                    tab.type === "file" &&
                    tab.dirty &&
                    !window.confirm(
                      `Discard unsaved changes to ${tab.relativePath}?`,
                    )
                  )
                    return;
                  void closeTab(tab);
                }}
              >
                <RiCloseLine size={14} />
              </span>
            </button>
          ))}
        </div>
        <div className="editor-resource-actions">
          <button
            ref={historyTriggerRef}
            title="Chat history"
            aria-label="Chat history"
            aria-expanded={historyOpen}
            aria-controls={historyOpen ? historyId : undefined}
            onClick={() => setHistoryOpen((open) => !open)}
          >
            <RiChatHistoryLine size={16} />
          </button>
          <button
            title="New chat"
            aria-label="New chat"
            onClick={() => void createChat()}
          >
            <RiChatNewLine size={16} />
          </button>
          <button
            title="New terminal"
            aria-label="New terminal"
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
                      ? "Process failed."
                      : "Process exited."}
                  </span>
                  <button
                    type="button"
                    className="terminal-status-restart"
                    onClick={() => void restartTerminal(active)}
                  >
                    Restart
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
            <h2>Your code, in focus.</h2>
            <p>Select a file to edit, or a change to preview its diff.</p>
            <div>
              <RiTerminalBoxLine size={14} />
              <span>Open a terminal from the tab header</span>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
