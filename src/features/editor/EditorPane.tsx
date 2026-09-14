import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  RiChatNewLine,
  RiChatHistoryLine,
  RiCloseLine,
  RiCodeSSlashLine,
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
import { ChatHistory, ChatView, hostChatApi } from "../chat";
import { useChangesStore } from "../changes/changesStore";
import { useProjectsStore } from "../projects/projectsStore";
import { defineMonacoTheme, monacoThemeName } from "../theme/themeColors";
import { useThemeStore } from "../theme/themeStore";
import { TerminalInstance } from "../terminal/TerminalInstance";
import { terminalStream } from "../terminal/terminalStream";
import { useEditorStore, type ResourceTab } from "./editorStore";

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
const cache = new ResourceCache<FileContent | GitDiff>();
type LoadState =
  | { status: "loading" }
  | { status: "ready"; value: FileContent | GitDiff }
  | { status: "error"; error: CommandError };

type DocumentTab = Extract<ResourceTab, { type: "file" | "diff" }>;

function ResourceView({ tab }: { tab: DocumentTab }) {
  const resolvedTheme = useThemeStore((theme) => theme.resolved);
  const [state, setState] = useState<LoadState>(() => {
    const value = cache.get(tab.id);
    return value ? { status: "ready", value } : { status: "loading" };
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
    if (resourceGeneration > 0)
      cache.deletePrefix(`${tab.type}:${tab.worktreeId}:`);
    const cached = cache.get(tab.id);
    if (cached) {
      setState({ status: "ready", value: cached });
      return;
    }
    setState({ status: "loading" });
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
        if (resourceIsCurrent) cache.set(tab.id, value);
        if (
          latest.navigationGeneration === navigationGeneration &&
          resourceIsCurrent
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
          setState({ status: "error", error: commandError(error) });
      },
    );
  }, [navigationGeneration, resourceGeneration, tab]);
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
  const content = "content" in state.value ? state.value.content : "";
  return (
    <Suspense fallback={<div className="viewer-state">Loading editor…</div>}>
      <MonacoEditor
        value={content}
        language={language}
        theme={monacoThemeName(resolvedTheme)}
        beforeMount={(monaco) => defineMonacoTheme(monaco, resolvedTheme)}
        options={{
          readOnly: true,
          domReadOnly: true,
          minimap: { enabled: false },
          fontSize: 13,
          padding: { top: 16 },
        }}
      />
    </Suspense>
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
      useEditorStore.getState().close(worktreeId, tab.id);
      return;
    }
    try {
      await commands.terminalClose(tab.terminalId, true);
    } catch (error) {
      const failure = commandError(error);
      if (failure.code !== "TERMINAL_NOT_FOUND") {
        useProjectsStore.getState().setError(failure);
        return;
      }
    }
    terminalStream.close(tab.terminalId);
    useEditorStore.getState().close(worktreeId, tab.id);
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
            title="Chat history"
            aria-label="Chat history"
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
          <ChatHistory
            worktreeId={worktreeId}
            api={hostChatApi}
            onOpen={(session) => {
              useEditorStore
                .getState()
                .openChat(worktreeId, session.sessionId, session.title);
              setHistoryOpen(false);
            }}
          />
        )}
        {active ? (
          active.type === "terminal" ? (
            <TerminalInstance
              key={active.id}
              worktreeId={worktreeId}
              terminalId={active.terminalId}
            />
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
            <RiCodeSSlashLine size={42} />
            <h2>Your code, in focus.</h2>
            <p>Select a file or change to open a read-only preview.</p>
            <div>
              <kbd>⌘ P</kbd>
              <span>Quick open</span>
            </div>
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
