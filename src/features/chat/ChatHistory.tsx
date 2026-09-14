import { useEffect, useState } from "react";
import type { ChatApi } from "./chatApi";
import { toChatError } from "./sessionReducer";
import type { ChatError, ChatSessionSummary } from "./types";

export interface ChatHistoryProps {
  worktreeId: string;
  api: ChatApi;
  onOpen: (session: ChatSessionSummary) => void;
  emptyLabel?: string;
}

export function ChatHistory({
  worktreeId,
  api,
  onOpen,
  emptyLabel = "No chat history",
}: ChatHistoryProps) {
  const [sessions, setSessions] = useState<ChatSessionSummary[] | null>(null);
  const [error, setError] = useState<ChatError | null>(null);

  useEffect(() => {
    let active = true;
    setSessions(null);
    setError(null);
    void api
      .list(worktreeId)
      .then((next) => {
        if (active) setSessions(next);
      })
      .catch((caught: unknown) => {
        if (active) setError(toChatError(caught));
      });
    return () => {
      active = false;
    };
  }, [api, worktreeId]);

  return (
    <section className="chat-history" aria-label="Chat history">
      <h2>Chat history</h2>
      {sessions === null && !error && <div>Loading chats…</div>}
      {error && <div role="alert">{error.message}</div>}
      {sessions?.length === 0 && <div>{emptyLabel}</div>}
      {sessions && sessions.length > 0 && (
        <ul>
          {sessions.map((session) => (
            <li key={session.sessionId}>
              <button type="button" onClick={() => onOpen(session)}>
                <span>{session.title || "Untitled chat"}</span>
                {session.updatedAt !== undefined && (
                  <time dateTime={new Date(session.updatedAt).toISOString()}>
                    {new Date(session.updatedAt).toLocaleString()}
                  </time>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
