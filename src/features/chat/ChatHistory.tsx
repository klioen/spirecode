import { useEffect, useRef, useState } from "react";
import { RiChat3Line, RiCloseLine, RiSearchLine } from "@remixicon/react";
import { formatNumber, useTranslation, type TranslationKey } from "../../i18n";
import type { ChatApi } from "./chatApi";
import { SessionRenameDialog } from "./SessionRenameDialog";
import { toChatError } from "./sessionReducer";
import type { ChatError, ChatSessionSummary } from "./types";

type HistoryGroup = "today" | "yesterday" | "earlier";

const GROUP_KEYS: Record<HistoryGroup, TranslationKey> = {
  today: "chat.history.today",
  yesterday: "chat.history.yesterday",
  earlier: "chat.history.earlier",
};

export interface ChatHistoryProps {
  worktreeId: string;
  api: ChatApi;
  onOpen: (session: ChatSessionSummary) => void;
  onClose?: () => void;
  onRename?: (session: ChatSessionSummary) => void;
  onDelete?: (session: ChatSessionSummary) => void;
  onDeleteError?: (error: ChatError) => void;
  onDialogOpenChange?: (open: boolean) => void;
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
  onRename,
  onDelete,
  onDeleteError,
  onDialogOpenChange,
  activeSessionId,
  emptyLabel,
}: ChatHistoryProps) {
  const { language, t } = useTranslation();
  const locale = language === "zh-CN" ? "zh-CN" : "en-US";
  const resolvedEmptyLabel = emptyLabel ?? t("chat.history.empty");
  const [sessions, setSessions] = useState<ChatSessionSummary[] | null>(null);
  const [error, setError] = useState<ChatError | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [query, setQuery] = useState("");
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<ChatSessionSummary | null>(
    null,
  );
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set());
  const [mutationError, setMutationError] = useState<ChatError | null>(null);
  const deletingIdsRef = useRef(new Set<string>());
  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    let active = true;
    setSessions(null);
    setError(null);
    setQuery("");
    setMenuSessionId(null);
    setRenameTarget(null);
    setMutationError(null);
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
  }, [api, retryToken, worktreeId]);

  useEffect(() => {
    if (!menuSessionId) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const closeOnOutsidePress = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node))
        setMenuSessionId(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const sessionId = menuSessionId;
      setMenuSessionId(null);
      rowRefs.current.get(sessionId)?.focus();
    };
    document.addEventListener("mousedown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuSessionId]);

  const deleteSession = async (session: ChatSessionSummary) => {
    if (deletingIdsRef.current.has(session.sessionId)) return;
    deletingIdsRef.current.add(session.sessionId);
    setDeletingIds((current) => new Set(current).add(session.sessionId));
    setMenuSessionId(null);
    setMutationError(null);
    try {
      await api.delete(worktreeId, session.sessionId);
      setSessions(
        (current) =>
          current?.filter(({ sessionId }) => sessionId !== session.sessionId) ??
          null,
      );
      onDelete?.(session);
    } catch (caught: unknown) {
      const nextError = toChatError(caught);
      setMutationError(nextError);
      onDeleteError?.(nextError);
      requestAnimationFrame(() =>
        rowRefs.current.get(session.sessionId)?.focus(),
      );
    } finally {
      deletingIdsRef.current.delete(session.sessionId);
      setDeletingIds((current) => {
        const next = new Set(current);
        next.delete(session.sessionId);
        return next;
      });
    }
  };

  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const untitled = t("chat.history.untitled");
  const sessionTitle = (session: ChatSessionSummary) =>
    session.title ||
    (session.kind === "task-intake" ? t("editor.newTask") : untitled);
  const filtered = (sessions ?? [])
    .filter((session) =>
      sessionTitle(session).toLocaleLowerCase(locale).includes(normalizedQuery),
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
  const groups: Array<{ group: HistoryGroup; items: typeof filtered }> = [
    "today",
    "yesterday",
    "earlier",
  ].map((group) => ({
    group: group as HistoryGroup,
    items: filtered.filter(({ date }) => {
      const dateGroup: HistoryGroup =
        date && date.getTime() >= today
          ? "today"
          : date && date.getTime() >= yesterday
            ? "yesterday"
            : "earlier";
      return dateGroup === group;
    }),
  }));

  return (
    <section className="chat-history" aria-label={t("chat.history.title")}>
      <header className="chat-history-header">
        <h2>{t("chat.history.title")}</h2>
        {sessions && (
          <span className="chat-history-count">
            {formatNumber(filtered.length)}
          </span>
        )}
        {onClose && (
          <button
            type="button"
            className="chat-history-close"
            aria-label={t("chat.history.close")}
            title={t("chat.history.closeTitle")}
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
          aria-label={t("chat.history.search")}
          placeholder={t("chat.history.searchPlaceholder")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="chat-history-body">
        {sessions === null && !error && (
          <div className="chat-history-state" role="status">
            {t("chat.history.loading")}
          </div>
        )}
        {error && (
          <div className="chat-history-state chat-history-error" role="alert">
            {error.message}
            <button
              type="button"
              className="chat-history-retry"
              onClick={() => {
                setSessions(null);
                setError(null);
                setRetryToken((token) => token + 1);
              }}
            >
              {t("chat.common.retry")}
            </button>
          </div>
        )}
        {mutationError && (
          <div className="chat-history-mutation-error" role="alert">
            {mutationError.message}
          </div>
        )}
        {sessions && filtered.length === 0 && (
          <div className="chat-history-state" role="status">
            <RiChat3Line size={24} aria-hidden="true" />
            <span>
              {sessions.length === 0
                ? resolvedEmptyLabel
                : t("chat.history.noMatches")}
            </span>
            <small>
              {sessions.length === 0
                ? t("chat.history.emptyDescription")
                : t("chat.history.noMatchesDescription")}
            </small>
          </div>
        )}
        {groups
          .filter((group) => group.items.length > 0)
          .map(({ group, items }) => {
            const groupLabel = t(GROUP_KEYS[group]);
            return (
              <div className="chat-history-group" key={group}>
                <h3>{groupLabel}</h3>
                <ul aria-label={groupLabel}>
                  {items.map(({ session, date }) => {
                    const title = sessionTitle(session);
                    const deleting = deletingIds.has(session.sessionId);
                    return (
                      <li
                        className="chat-history-row"
                        key={session.sessionId}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          if (!deleting) setMenuSessionId(session.sessionId);
                        }}
                      >
                        <button
                          type="button"
                          className="chat-history-item"
                          aria-label={title}
                          aria-current={
                            session.sessionId === activeSessionId
                              ? "true"
                              : undefined
                          }
                          disabled={deleting}
                          ref={(button) => {
                            if (button)
                              rowRefs.current.set(session.sessionId, button);
                            else rowRefs.current.delete(session.sessionId);
                          }}
                          onClick={() => onOpen(session)}
                          onKeyDown={(event) => {
                            if (
                              event.key === "ContextMenu" ||
                              (event.shiftKey && event.key === "F10")
                            ) {
                              event.preventDefault();
                              setMenuSessionId(session.sessionId);
                            }
                          }}
                        >
                          <RiChat3Line size={15} aria-hidden="true" />
                          <span className="chat-history-title" title={title}>
                            {title}
                          </span>
                          {deleting ? (
                            <span
                              className="spinner"
                              aria-label={t("chat.history.movingToTrash")}
                            />
                          ) : session.sessionId === activeSessionId ? (
                            <span className="chat-history-current">
                              {t("chat.history.current")}
                            </span>
                          ) : (
                            date && (
                              <time
                                dateTime={date.toISOString()}
                                title={date.toLocaleString(locale)}
                              >
                                {group === "earlier"
                                  ? date.toLocaleDateString(locale, {
                                      month: "short",
                                      day: "numeric",
                                      ...(date.getFullYear() !==
                                      now.getFullYear()
                                        ? { year: "numeric" }
                                        : {}),
                                    })
                                  : date.toLocaleTimeString(locale, {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                              </time>
                            )
                          )}
                        </button>
                        {menuSessionId === session.sessionId && (
                          <div
                            className="chat-history-menu"
                            role="menu"
                            ref={menuRef}
                          >
                            <button
                              type="button"
                              role="menuitem"
                              aria-label={t("chat.rename.menuLabel", { title })}
                              onClick={() => {
                                setMenuSessionId(null);
                                setRenameTarget(session);
                                onDialogOpenChange?.(true);
                              }}
                            >
                              {t("chat.rename.menu")}
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="danger-text"
                              aria-label={t("chat.history.delete", { title })}
                              onClick={() => void deleteSession(session)}
                            >
                              {t("projects.sessions.delete")}
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
      </div>
      <SessionRenameDialog
        session={renameTarget}
        api={api}
        onRenamed={(renamed) => {
          setSessions(
            (current) =>
              current?.map((session) =>
                session.sessionId === renamed.sessionId ? renamed : session,
              ) ?? null,
          );
          onRename?.(renamed);
        }}
        onOpenChange={(open) => {
          onDialogOpenChange?.(open);
          if (open) return;
          const sessionId = renameTarget?.sessionId;
          setRenameTarget(null);
          if (sessionId)
            requestAnimationFrame(() =>
              rowRefs.current.get(sessionId)?.focus(),
            );
        }}
      />
    </section>
  );
}
