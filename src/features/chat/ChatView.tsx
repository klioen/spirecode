import { useEffect } from "react";
import type { ChatApi } from "./chatApi";
import { chatRuntime, type ChatRuntime, useChatSession } from "./chatRuntime";
import { ChatComposer } from "./ChatComposer";
import { ChatMessage } from "./ChatMessage";
import { RiArrowDownLine } from "@remixicon/react";
import { ProcessFlow } from "./ProcessFlow";
import { projectChatTimeline } from "./chatDisplayItems";
import { toChatError } from "./sessionReducer";
import { useChatScrollController } from "./useChatScrollController";

export interface ChatViewProps {
  worktreeId: string;
  sessionId: string;
  api: ChatApi;
  runtime?: ChatRuntime;
  emptyLabel?: string;
  onError?: (error: ReturnType<typeof toChatError>) => void;
}

function ChatViewContent({
  worktreeId,
  sessionId,
  api,
  runtime,
  emptyLabel,
  onError,
}: Required<Pick<ChatViewProps, "worktreeId" | "sessionId" | "api">> &
  Pick<ChatViewProps, "emptyLabel" | "onError"> & { runtime: ChatRuntime }) {
  const state = useChatSession(sessionId, runtime);
  const running = state.status === "streaming";
  const { transcriptRef, scrollToBottom, showScrollToBottom } =
    useChatScrollController(sessionId, state.sequence, running);

  useEffect(() => {
    let active = true;
    let detach: (() => void) | undefined;
    if (runtime.getSnapshot(sessionId).status === "loading")
      runtime.setStatus(sessionId, "loading");
    void api
      .attach(worktreeId, sessionId, (event) => runtime.push(event))
      .then((attachment) => {
        if (!active) {
          attachment.detach();
          return;
        }
        detach = attachment.detach;
        runtime.hydrate(attachment.snapshot);
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
  }, [api, onError, runtime, sessionId, worktreeId]);

  const send = async (text: string) => {
    await api.send(worktreeId, sessionId, text);
  };

  const stop = async () => {
    const response = await api.abort(worktreeId, sessionId);
    return response.restored;
  };

  return (
    <section className="chat-view" aria-label="Chat session">
      <div className="chat-transcript-shell">
        <div ref={transcriptRef} className="chat-transcript" aria-live="polite">
          {state.status === "loading" && <div>Loading conversation…</div>}
          {state.status === "reconnecting" && <div>Reconnecting…</div>}
          {(state.status === "failed" || state.status === "auth-required") &&
            !state.items.some(
              (item) => item.type === "notice" && item.kind === "error",
            ) && (
              <div role="alert">
                {state.error?.message ?? "Chat unavailable"}
              </div>
            )}
          {state.status !== "loading" && state.items.length === 0 && (
            <div>{emptyLabel ?? "Start a conversation with pi"}</div>
          )}
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
              case "notice":
                return (
                  <div
                    key={`notice:${item.id}`}
                    className={`chat-notice chat-notice-${item.kind}`}
                    role={item.kind === "error" ? "alert" : "status"}
                  >
                    {item.text}
                  </div>
                );
            }
          })}
        </div>
        {showScrollToBottom && (
          <button
            type="button"
            className="chat-scroll-bottom"
            aria-label="Scroll to latest message"
            title="Scroll to latest message"
            onClick={scrollToBottom}
          >
            <RiArrowDownLine aria-hidden="true" />
          </button>
        )}
      </div>
      <ChatComposer
        running={running}
        queue={state.queue}
        disabled={
          state.status === "loading" ||
          state.status === "reconnecting" ||
          state.status === "failed" ||
          state.status === "auth-required"
        }
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
  emptyLabel,
  onError,
}: ChatViewProps) {
  runtime.ensure(sessionId, worktreeId);
  return (
    <ChatViewContent
      worktreeId={worktreeId}
      sessionId={sessionId}
      api={api}
      runtime={runtime}
      emptyLabel={emptyLabel}
      onError={onError}
    />
  );
}
