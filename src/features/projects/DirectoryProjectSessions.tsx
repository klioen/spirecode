import { useEffect, useState } from "react";
import { RiChat3Line } from "@remixicon/react";
import { hostChatApi } from "../chat/hostChatApi";
import type { ChatSessionSummary } from "../chat/types";
import { useEditorStore } from "../editor/editorStore";
import { useTranslation } from "../../i18n";
import { commandError } from "../../lib/errors";

export function DirectoryProjectSessions({
  worktreeId,
  onSelectWorktree,
}: {
  worktreeId: string;
  onSelectWorktree: (worktreeId: string) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<ChatSessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setSessions(null);
    setError(null);
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
        if (active) setError(commandError(failure).message);
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
      setError(commandError(failure).message);
    }
  };

  if (error)
    return (
      <div className="project-session-state error" role="alert">
        {error}
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
      {sessions.map((session) => {
        const title = session.title || t("chat.history.untitled");
        return (
          <button
            type="button"
            className="project-session-row"
            key={session.sessionId}
            aria-label={title}
            title={title}
            onClick={() => void openSession(session)}
          >
            <RiChat3Line size={14} />
            <span>{title}</span>
          </button>
        );
      })}
    </div>
  );
}
