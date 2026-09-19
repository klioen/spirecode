import { useEffect, useState } from "react";
import { useTranslation, type TranslationKey } from "../../i18n";
import type { ChatApi } from "./chatApi";
import { chatRuntime, type ChatRuntime, useChatSession } from "./chatRuntime";
import { ChatComposer } from "./ChatComposer";
import { ChatMessage } from "./ChatMessage";
import { RiArrowDownLine } from "@remixicon/react";
import { ProcessFlow } from "./ProcessFlow";
import { TodoListCard } from "./TodoListCard";
import { projectChatTimeline } from "./chatDisplayItems";
import { toChatError } from "./sessionReducer";
import { useChatScrollController } from "./useChatScrollController";
import type {
  ChatNoticeFallback,
  ChatSessionConfig,
  ChatThinkingLevel,
} from "./types";

const NOTICE_KEYS: Record<ChatNoticeFallback, TranslationKey> = {
  "compaction-start": "chat.notice.compactionStart",
  "compaction-end": "chat.notice.compactionEnd",
  "retry-start": "chat.notice.retryStart",
  "retry-end": "chat.notice.retryEnd",
};

export interface ChatViewProps {
  worktreeId: string;
  sessionId: string;
  api: ChatApi;
  runtime?: ChatRuntime;
  onError?: (error: ReturnType<typeof toChatError>) => void;
}

function ChatViewContent({
  worktreeId,
  sessionId,
  api,
  runtime,
  onError,
}: Required<Pick<ChatViewProps, "worktreeId" | "sessionId" | "api">> &
  Pick<ChatViewProps, "onError"> & { runtime: ChatRuntime }) {
  const { t } = useTranslation();
  const state = useChatSession(sessionId, runtime);
  const running = state.status === "streaming";
  const [config, setConfig] = useState<ChatSessionConfig>();
  const [configError, setConfigError] = useState<string>();
  const [retryToken, setRetryToken] = useState(0);
  const { transcriptRef, scrollToBottom, showScrollToBottom } =
    useChatScrollController(sessionId, state.sequence, running);

  const retry = () => {
    runtime.setStatus(sessionId, "loading");
    setRetryToken((token) => token + 1);
  };

  useEffect(() => {
    let active = true;
    let detach: (() => void) | undefined;
    if (runtime.getSnapshot(sessionId).status === "loading")
      runtime.setStatus(sessionId, "loading");
    setConfig(undefined);
    setConfigError(undefined);
    void api
      .attach(worktreeId, sessionId, (event) => runtime.push(event))
      .then(async (attachment) => {
        if (!active) {
          attachment.detach();
          return;
        }
        detach = attachment.detach;
        runtime.hydrate(attachment.snapshot);
        try {
          const next = await api.config(worktreeId, sessionId);
          if (active) setConfig(next);
        } catch (caught: unknown) {
          if (active)
            setConfigError(
              caught instanceof Error ? caught.message : String(caught),
            );
        }
      })
      .catch((caught: unknown) => {
        if (!active) return;
        const error = toChatError(caught);
        onError?.(error);
        const current = runtime.getSnapshot(sessionId);
        runtime.push({
          sessionId,
          sequence: current.sequence + 1,
          event: { type: "session_error", error },
        });
      });
    return () => {
      active = false;
      detach?.();
    };
  }, [api, onError, retryToken, runtime, sessionId, worktreeId]);

  const send = async (text: string) => {
    await api.send(worktreeId, sessionId, text);
    if (text.startsWith("/model ") || text.startsWith("/thinking "))
      setConfig(await api.config(worktreeId, sessionId));
  };

  const setModel = async (provider: string, modelId: string) => {
    setConfig(await api.setModel(worktreeId, sessionId, provider, modelId));
  };

  const setThinkingLevel = async (level: ChatThinkingLevel) => {
    setConfig(await api.setThinkingLevel(worktreeId, sessionId, level));
  };

  const stop = async () => {
    const response = await api.abort(worktreeId, sessionId);
    return response.restored;
  };

  return (
    <section className="chat-view" aria-label={t("chat.session")}>
      <div className="chat-transcript-shell">
        <div ref={transcriptRef} className="chat-transcript" aria-live="polite">
          {state.status === "loading" && (
            <div>{t("chat.loadingConversation")}</div>
          )}
          {state.status === "reconnecting" && (
            <div>{t("chat.reconnecting")}</div>
          )}
          {configError && <div role="alert">{configError}</div>}
          {state.status === "failed" || state.status === "auth-required" ? (
            <div className="chat-error-banner" role="alert">
              <div className="chat-error-summary">
                {state.error && (
                  <b className="chat-error-code">{state.error.code}</b>
                )}
                <span>{state.error?.message ?? t("chat.unavailable")}</span>
              </div>
              {state.status === "auth-required" && (
                <small className="chat-error-guidance">
                  {t("chat.authGuidance")}
                </small>
              )}
              <button
                type="button"
                className="chat-error-retry"
                onClick={retry}
              >
                {t("chat.common.retry")}
              </button>
            </div>
          ) : null}
          {projectChatTimeline(state.items).map((item) => {
            switch (item.type) {
              case "message":
                return (
                  <ChatMessage key={`message:${item.id}`} message={item} />
                );
              case "process":
                return (
                  <ProcessFlow key={`process:${item.id}`} steps={item.steps} />
                );
              case "todo":
                return <TodoListCard key={`todo:${item.id}`} todo={item} />;
              case "notice":
                return (
                  <div
                    key={`notice:${item.id}`}
                    className={`chat-notice chat-notice-${item.kind}`}
                    role={item.kind === "error" ? "alert" : "status"}
                  >
                    {item.text ??
                      (item.fallback ? t(NOTICE_KEYS[item.fallback]) : "")}
                  </div>
                );
            }
          })}
        </div>
        {showScrollToBottom && (
          <button
            type="button"
            className="chat-scroll-bottom"
            aria-label={t("chat.scrollLatest")}
            title={t("chat.scrollLatest")}
            onClick={scrollToBottom}
          >
            <RiArrowDownLine aria-hidden="true" />
          </button>
        )}
      </div>
      {state.activity && (
        <div
          className="chat-agent-activity"
          role="status"
          aria-label={t("chat.agentActivity")}
        >
          <span className="chat-agent-activity-spinner" aria-hidden="true" />
          <span>{state.activity}</span>
        </div>
      )}
      <ChatComposer
        running={running}
        queue={state.queue}
        disabled={
          state.status === "loading" ||
          state.status === "reconnecting" ||
          state.status === "failed" ||
          state.status === "auth-required"
        }
        config={config}
        onModelChange={setModel}
        onThinkingLevelChange={setThinkingLevel}
        onSend={send}
        onStop={stop}
      />
    </section>
  );
}

export function ChatView({
  worktreeId,
  sessionId,
  api,
  runtime = chatRuntime,
  onError,
}: ChatViewProps) {
  runtime.ensure(sessionId, worktreeId);
  return (
    <ChatViewContent
      worktreeId={worktreeId}
      sessionId={sessionId}
      api={api}
      runtime={runtime}
      onError={onError}
    />
  );
}
