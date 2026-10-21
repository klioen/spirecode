import { useEffect, useRef, useState } from "react";
import { RiChat3Line } from "@remixicon/react";
import { hostChatApi } from "../chat/hostChatApi";
import { SessionRenameDialog } from "../chat/SessionRenameDialog";
import type { ChatSessionSummary } from "../chat/types";
import { chatRuntime } from "../chat/chatRuntime";
import { chatResourceId, useEditorStore } from "../editor/editorStore";
import { useTranslation } from "../../i18n";
import { commandError } from "../../lib/errors";

export function ProjectSessionList({
  worktreeId,
  onSelectWorktree,
  onOpenSession,
}: {
  worktreeId: string;
  onSelectWorktree: (worktreeId: string) => Promise<boolean>;
  onOpenSession?: () => void;
}) {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<ChatSessionSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set());
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<ChatSessionSummary | null>(
    null,
  );
  const deletingIdsRef = useRef(new Set<string>());
  const menuRef = useRef<HTMLDivElement>(null);
  const sessionButtonRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    let active = true;
    setSessions(null);
    setLoadError(null);
    setDeleteError(null);
    setMenuSessionId(null);
    setRenameTarget(null);
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

  useEffect(() => {
    if (!menuSessionId) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const closeOnOutsidePress = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node))
        setMenuSessionId(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const sessionId = menuSessionId;
      setMenuSessionId(null);
      sessionButtonRefs.current.get(sessionId)?.focus();
    };
    document.addEventListener("mousedown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuSessionId]);

  const openSession = async (session: ChatSessionSummary) => {
    try {
      if (!(await onSelectWorktree(worktreeId))) return;
      useEditorStore
        .getState()
        .openChat(worktreeId, session.sessionId, session.title);
      onOpenSession?.();
    } catch (failure) {
      setLoadError(commandError(failure).message);
    }
  };

  const deleteSession = async (session: ChatSessionSummary) => {
    if (deletingIdsRef.current.has(session.sessionId)) return;
    deletingIdsRef.current.add(session.sessionId);
    setDeletingIds((current) => new Set(current).add(session.sessionId));
    setMenuSessionId(null);
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
      requestAnimationFrame(() =>
        sessionButtonRefs.current.get(session.sessionId)?.focus(),
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
    <>
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
            <div
              className="project-session-item"
              key={session.sessionId}
              onContextMenu={(event) => {
                event.preventDefault();
                if (!deleting) setMenuSessionId(session.sessionId);
              }}
            >
              <button
                type="button"
                className="project-session-row"
                aria-label={title}
                title={title}
                disabled={deleting}
                ref={(button) => {
                  if (button)
                    sessionButtonRefs.current.set(session.sessionId, button);
                  else sessionButtonRefs.current.delete(session.sessionId);
                }}
                onClick={() => void openSession(session)}
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
                <RiChat3Line size={14} />
                <span>{title}</span>
                {deleting && (
                  <span
                    className="spinner project-session-spinner"
                    aria-label={t("chat.history.movingToTrash")}
                  />
                )}
              </button>
              {menuSessionId === session.sessionId && (
                <div className="project-session-menu" role="menu" ref={menuRef}>
                  <button
                    type="button"
                    role="menuitem"
                    aria-label={t("chat.rename.menuLabel", { title })}
                    onClick={() => {
                      setMenuSessionId(null);
                      setRenameTarget(session);
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
            </div>
          );
        })}
      </div>
      <SessionRenameDialog
        session={renameTarget}
        api={hostChatApi}
        onRenamed={(renamed) => {
          setSessions(
            (current) =>
              current?.map((session) =>
                session.sessionId === renamed.sessionId ? renamed : session,
              ) ?? [],
          );
          useEditorStore
            .getState()
            .renameChat(worktreeId, renamed.sessionId, renamed.title);
        }}
        onOpenChange={(open) => {
          if (open) return;
          const sessionId = renameTarget?.sessionId;
          setRenameTarget(null);
          if (sessionId)
            requestAnimationFrame(() =>
              sessionButtonRefs.current.get(sessionId)?.focus(),
            );
        }}
      />
    </>
  );
}
