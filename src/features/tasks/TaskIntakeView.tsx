import { useEffect, useState } from "react";
import {
  commands,
  subscribeTaskEvent,
  type TaskIntakeSnapshot,
} from "../../bindings";
import { useTranslation } from "../../i18n";
import { ChatView, hostChatApi } from "../chat";
import { taskErrorMessage, taskStatusKeys } from "./taskPresentation";
import type { TaskStatus } from "./tasksApi";

interface TaskIntakeViewProps {
  worktreeId: string;
  sessionId: string;
  onOpenTask?: (taskId: string) => void;
}

export function TaskIntakeView({
  worktreeId,
  sessionId,
  onOpenTask,
}: TaskIntakeViewProps) {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<TaskIntakeSnapshot>();
  const [error, setError] = useState<string>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    let generation = 0;
    const refresh = async () => {
      const request = ++generation;
      try {
        const next = await commands.taskIntakeGet(worktreeId, sessionId);
        if (active && request === generation) {
          setSnapshot((previous) =>
            !previous || next.revision >= previous.revision ? next : previous,
          );
          setError(undefined);
        }
      } catch (caught) {
        if (active && request === generation)
          setError(taskErrorMessage(caught, t("tasks.intake.loadFailed")));
      }
    };
    void refresh();
    const unsubscribe = subscribeTaskEvent<{
      kind: string;
      sessionId?: string;
      taskId?: string;
    }>((event) => {
      if (
        (event.kind === "intake_changed" && event.sessionId === sessionId) ||
        event.kind === "changed"
      )
        void refresh();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [worktreeId, sessionId, retry, t]);

  const submitted = Boolean(snapshot?.task);
  const review = snapshot?.proposal;
  return (
    <ChatView
      worktreeId={worktreeId}
      sessionId={sessionId}
      api={hostChatApi}
      composerPlaceholder={t("tasks.intake.placeholder")}
      composerLabel={t("tasks.intake.inputLabel")}
      inputDisabled={!snapshot || Boolean(error) || submitted}
      allowFollowUp={false}
      intro={
        <div className="task-intake-intro">
          <h2>{t("editor.newTask")}</h2>
          <p>{t("tasks.intake.intro")}</p>
          {snapshot && (
            <small>
              {t("tasks.intake.baseline", {
                project: snapshot.projectName,
                branch: snapshot.baseRef,
                commit: snapshot.baseCommit.slice(0, 12),
              })}
            </small>
          )}
        </div>
      }
      afterMessages={
        <>
          {error && (
            <div className="chat-error-banner" role="alert">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setRetry((value) => value + 1)}
              >
                {t("chat.common.retry")}
              </button>
            </div>
          )}
          {!submitted && review && (
            <section
              className="task-intake-review"
              aria-label={t("tasks.intake.review")}
            >
              <h3>{t("tasks.intake.review")}</h3>
              <h4>{review.title}</h4>
              <p>
                {t("tasks.intake.baseline", {
                  project: snapshot!.projectName,
                  branch: review.baseRef,
                  commit: review.baseCommit.slice(0, 12),
                })}
              </p>
              <pre>{review.description}</pre>
              <p className="task-intake-confirmation">
                {t("tasks.intake.confirmHint")}
              </p>
            </section>
          )}
          {!submitted && snapshot?.phase === "submitting" && (
            <p role="status">{t("tasks.intake.submitting")}</p>
          )}
          {snapshot?.task && (
            <section
              className="task-intake-submitted"
              aria-label={t("tasks.intake.submitted")}
              role="status"
            >
              <h3>{t("tasks.intake.submitted")}</h3>
              <p>{snapshot.task.title}</p>
              <p>
                {snapshot.task.status in taskStatusKeys
                  ? t(taskStatusKeys[snapshot.task.status as TaskStatus])
                  : t("tasks.intake.queued")}
              </p>
              <p>{t("tasks.intake.backgroundHint")}</p>
              {onOpenTask && (
                <button
                  type="button"
                  onClick={() => onOpenTask(snapshot.task!.id)}
                >
                  {t("tasks.intake.viewTask")}
                </button>
              )}
            </section>
          )}
        </>
      }
    />
  );
}
