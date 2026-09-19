import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  RiChat3Line,
  RiCloseLine,
  RiDeleteBinLine,
  RiSearchLine,
} from "@remixicon/react";
import { formatNumber, useTranslation, type TranslationKey } from "../../i18n";
import type { ChatApi } from "./chatApi";
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
  onDelete?: (session: ChatSessionSummary) => void;
  onDeleteError?: (error: ChatError) => void;
  onConfirmOpenChange?: (open: boolean) => void;
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
  onDelete,
  onDeleteError,
  onConfirmOpenChange,
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
  const [deleteTarget, setDeleteTarget] = useState<ChatSessionSummary | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<ChatError | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    let active = true;
    setSessions(null);
    setError(null);
    setQuery("");
    setDeleteTarget(null);
    setDeleteError(null);
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

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(worktreeId, deleteTarget.sessionId);
      setSessions(
        (current) =>
          current?.filter(
            (session) => session.sessionId !== deleteTarget.sessionId,
          ) ?? null,
      );
      onDelete?.(deleteTarget);
      setDeleteTarget(null);
      onConfirmOpenChange?.(false);
    } catch (caught: unknown) {
      const error = toChatError(caught);
      setDeleteError(error);
      onDeleteError?.(error);
    } finally {
      setDeleting(false);
    }
  };

  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const untitled = t("chat.history.untitled");
  const filtered = (sessions ?? [])
    .filter((session) =>
      (session.title || untitled)
        .toLocaleLowerCase(locale)
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
                    const title = session.title || untitled;
                    return (
                      <li className="chat-history-row" key={session.sessionId}>
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
                          <span className="chat-history-title" title={title}>
                            {title}
                          </span>
                          {session.sessionId === activeSessionId ? (
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
                        <button
                          type="button"
                          className="chat-history-delete"
                          aria-label={t("chat.history.delete", { title })}
                          title={t("chat.history.delete", { title })}
                          onClick={() => {
                            setDeleteError(null);
                            setDeleteTarget(session);
                            onConfirmOpenChange?.(true);
                          }}
                        >
                          <RiDeleteBinLine size={15} aria-hidden="true" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
      </div>
      <Dialog.Root
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          onConfirmOpenChange?.(open);
          if (!open && !deleting) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="chat-delete-overlay" />
          <Dialog.Content className="chat-delete-dialog">
            <Dialog.Title>{t("chat.history.deleteTitle")}</Dialog.Title>
            <Dialog.Description>
              {t("chat.history.deleteDescription", {
                title: deleteTarget?.title || untitled,
              })}
            </Dialog.Description>
            {deleteError && (
              <div className="chat-delete-error" role="alert">
                {deleteError.message}
              </div>
            )}
            <div className="chat-delete-actions">
              <Dialog.Close asChild>
                <button type="button" disabled={deleting}>
                  {t("common.cancel")}
                </button>
              </Dialog.Close>
              <button
                type="button"
                className="danger"
                disabled={deleting}
                onClick={() => void confirmDelete()}
              >
                {t(
                  deleting
                    ? "chat.history.movingToTrash"
                    : "chat.history.moveToTrash",
                )}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
