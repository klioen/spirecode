import { useEffect, useRef, useState } from "react";
import { RiChat3Line, RiCloseLine, RiSearchLine } from "@remixicon/react";
import type { ChatApi } from "./chatApi";
import { toChatError } from "./sessionReducer";
import type { ChatError, ChatSessionSummary } from "./types";

export interface ChatHistoryProps {
  worktreeId: string;
  api: ChatApi;
  onOpen: (session: ChatSessionSummary) => void;
  onClose?: () => void;
  activeSessionId?: string;
  emptyLabel?: string;
}

function sessionDate(session: ChatSessionSummary): Date | null {
  if (session.updatedAt === undefined) return null;
  const date = new Date(session.updatedAt);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function ChatHistory({
  worktreeId,
  api,
  onOpen,
  onClose,
  activeSessionId,
  emptyLabel = "No chat history",
}: ChatHistoryProps) {
  const [sessions, setSessions] = useState<ChatSessionSummary[] | null>(null);
  const [error, setError] = useState<ChatError | null>(null);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    let active = true;
    setSessions(null);
    setError(null);
    setQuery("");
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

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = (sessions ?? [])
    .filter((session) =>
      (session.title || "Untitled chat")
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    )
    .map((session) => ({ session, date: sessionDate(session) }))
    .sort(
      (a, b) =>
        (b.date?.getTime() ?? -Infinity) - (a.date?.getTime() ?? -Infinity),
    );
  const now = new Date();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const yesterday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1,
  ).getTime();
  const groups = ["Today", "Yesterday", "Earlier"].map((label) => ({
    label,
    items: filtered.filter(({ date }) => {
      const group =
        date && date.getTime() >= today
          ? "Today"
          : date && date.getTime() >= yesterday
            ? "Yesterday"
            : "Earlier";
      return group === label;
    }),
  }));

  return (
    <section className="chat-history" aria-label="Chat history">
      <header className="chat-history-header">
        <h2>Chat history</h2>
        {sessions && (
          <span className="chat-history-count">{filtered.length}</span>
        )}
        {onClose && (
          <button
            type="button"
            className="chat-history-close"
            aria-label="Close chat history"
            title="Close chat history (Esc)"
            onClick={onClose}
          >
            <RiCloseLine size={16} aria-hidden="true" />
          </button>
        )}
      </header>
      <div className="chat-history-search">
        <RiSearchLine size={15} aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          aria-label="Search chats"
          placeholder="Search chats…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="chat-history-body">
        {sessions === null && !error && (
          <div className="chat-history-state" role="status">
            Loading chats…
          </div>
        )}
        {error && (
          <div className="chat-history-state chat-history-error" role="alert">
            {error.message}
          </div>
        )}
        {sessions && filtered.length === 0 && (
          <div className="chat-history-state" role="status">
            <RiChat3Line size={24} aria-hidden="true" />
            <span>
              {sessions.length === 0 ? emptyLabel : "No matching chats"}
            </span>
            <small>
              {sessions.length === 0
                ? "Your conversations will appear here."
                : "Try a different title."}
            </small>
          </div>
        )}
        {groups
          .filter((group) => group.items.length > 0)
          .map(({ label, items }) => (
            <div className="chat-history-group" key={label}>
              <h3>{label}</h3>
              <ul aria-label={label}>
                {items.map(({ session, date }) => (
                  <li key={session.sessionId}>
                    <button
                      type="button"
                      className="chat-history-item"
                      aria-current={
                        session.sessionId === activeSessionId
                          ? "true"
                          : undefined
                      }
                      onClick={() => onOpen(session)}
                    >
                      <RiChat3Line size={15} aria-hidden="true" />
                      <span
                        className="chat-history-title"
                        title={session.title || "Untitled chat"}
                      >
                        {session.title || "Untitled chat"}
                      </span>
                      {session.sessionId === activeSessionId ? (
                        <span className="chat-history-current">Current</span>
                      ) : (
                        date && (
                          <time
                            dateTime={date.toISOString()}
                            title={date.toLocaleString()}
                          >
                            {label === "Earlier"
                              ? date.toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  ...(date.getFullYear() !== now.getFullYear()
                                    ? { year: "numeric" }
                                    : {}),
                                })
                              : date.toLocaleTimeString(undefined, {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                          </time>
                        )
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
    </section>
  );
}
