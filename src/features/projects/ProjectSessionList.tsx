import { useEffect, useRef, useState } from "react";
import { RiChat3Line, RiDeleteBinLine } from "@remixicon/react";
import { hostChatApi } from "../chat/hostChatApi";
import type { ChatSessionSummary } from "../chat/types";
import { chatRuntime } from "../chat/chatRuntime";
import { chatResourceId, useEditorStore } from "../editor/editorStore";
import { useTranslation } from "../../i18n";
import { commandError } from "../../lib/errors";

export function ProjectSessionList({
  worktreeId,
  onSelectWorktree,
}: {
  worktreeId: string;
  onSelectWorktree: (worktreeId: string) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<ChatSessionSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set());
  const deletingIdsRef = useRef(new Set<string>());

  useEffect(() => {
    let active = true;
    setSessions(null);
    setLoadError(null);
    setDeleteError(null);
    void hostChatApi.list(worktreeId).then(
      (next) => {
        if (!active) return;
        setSessions(
          [...next].sort(
            (left, right) =>
              (right.updatedAt ?? right.createdAt ?? 0) -
              (left.updatedAt ?? left.createdAt ?? 0),
          ),
        );
      },
      (failure: unknown) => {
        if (active) setLoadError(commandError(failure).message);
      },
    );
    return () => {
      active = false;
    };
  }, [worktreeId]);

  const openSession = async (session: ChatSessionSummary) => {
    try {
      if (!(await onSelectWorktree(worktreeId))) return;
      useEditorStore
        .getState()
        .openChat(worktreeId, session.sessionId, session.title);
    } catch (failure) {
      setLoadError(commandError(failure).message);
    }
  };

  const deleteSession = async (session: ChatSessionSummary) => {
    if (deletingIdsRef.current.has(session.sessionId)) return;
    deletingIdsRef.current.add(session.sessionId);
    setDeletingIds((current) => new Set(current).add(session.sessionId));
    setDeleteError(null);
    try {
      await hostChatApi.delete(worktreeId, session.sessionId);
      setSessions(
        (current) =>
          current?.filter(({ sessionId }) => sessionId !== session.sessionId) ??
          [],
      );
      useEditorStore
        .getState()
        .close(worktreeId, chatResourceId(worktreeId, session.sessionId));
      chatRuntime.remove(session.sessionId);
    } catch (failure) {
      setDeleteError(commandError(failure).message);
    } finally {
      deletingIdsRef.current.delete(session.sessionId);
      setDeletingIds((current) => {
        const next = new Set(current);
        next.delete(session.sessionId);
        return next;
      });
    }
  };

  if (loadError)
    return (
      <div className="project-session-state error" role="alert">
        {loadError}
      </div>
    );
  if (sessions === null)
    return (
      <div className="project-session-state" role="status">
        <span className="spinner" />
        {t("projects.sessions.loading")}
      </div>
    );
  if (sessions.length === 0)
    return (
      <div className="project-session-state" role="status">
        {t("projects.sessions.empty")}
      </div>
    );

  return (
    <div className="project-session-list">
      {deleteError && (
        <div className="project-session-state error" role="alert">
          {deleteError}
        </div>
      )}
      {sessions.map((session) => {
        const title = session.title || t("chat.history.untitled");
        const deleting = deletingIds.has(session.sessionId);
        return (
          <div className="project-session-item" key={session.sessionId}>
            <button
              type="button"
              className="project-session-row"
              aria-label={title}
              title={title}
              disabled={deleting}
              onClick={() => void openSession(session)}
            >
              <RiChat3Line size={14} />
              <span>{title}</span>
            </button>
            <button
              type="button"
              className="project-session-delete"
              aria-label={t("chat.history.delete", { title })}
              title={t("chat.history.delete", { title })}
              disabled={deleting}
              onClick={() => void deleteSession(session)}
            >
              {deleting ? (
                <span className="spinner" />
              ) : (
                <RiDeleteBinLine size={14} />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
