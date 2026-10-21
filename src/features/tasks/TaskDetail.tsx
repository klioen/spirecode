import { useState } from "react";
import { useTranslation, type TranslationKey } from "../../i18n";
import type { TaskDetailValue, TaskRunSummary, TasksApi } from "./tasksApi";

interface TaskDetailProps {
  api: TasksApi;
  task: TaskDetailValue;
  onChange: (task: TaskDetailValue) => void;
  onBack?: () => void;
  onEdit?: () => void;
  onOpenSession?: (worktreeId: string, sessionId: string) => void;
}

const runStatusKeys: Record<TaskRunSummary["status"], TranslationKey> = {
  queued: "tasks.status.queued",
  provisioning: "tasks.status.provisioning",
  prompting: "tasks.status.prompting",
  running: "tasks.status.running",
  awaiting_report: "tasks.status.awaitingReport",
  reported: "tasks.status.reported",
  failed: "tasks.status.failed",
  cancelled: "tasks.status.cancelled",
};
const resultStatusKeys = {
  passed: "tasks.status.passed",
  failed: "tasks.status.failed",
  not_run: "tasks.status.notRun",
} as const satisfies Record<string, TranslationKey>;

export function TaskDetail({
  api,
  task,
  onChange,
  onBack,
  onEdit,
  onOpenSession,
}: TaskDetailProps) {
  const { t } = useTranslation();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestRun = task.runs[0] ?? null;

  const act = async (operation: () => Promise<TaskDetailValue>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await operation());
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : t("tasks.actionFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="task-detail" aria-labelledby="task-detail-title">
      {onBack ? (
        <button type="button" onClick={onBack}>
          {t("tasks.back")}
        </button>
      ) : null}
      <h2 id="task-detail-title">{task.title}</h2>
      {onEdit &&
      ["backlog", "failed", "cancelled"].includes(task.status) &&
      !task.activeRunId ? (
        <button type="button" onClick={onEdit}>
          {t("tasks.edit")}
        </button>
      ) : null}
      <p>
        {t("tasks.statusLabel", {
          status: t(
            task.status === "needs_review"
              ? "tasks.status.needsReview"
              : (`tasks.status.${task.status}` as TranslationKey),
          ),
        })}
      </p>
      <p>{task.description}</p>
      <h3>{t("tasks.acceptanceCriteria")}</h3>
      <ol>
        {task.acceptanceCriteria.map((criterion) => (
          <li key={criterion.id}>{criterion.text}</li>
        ))}
      </ol>

      <h3>{t("tasks.runs")}</h3>
      {task.runs.length === 0 ? <p>{t("tasks.noRuns")}</p> : null}
      <ol>
        {task.runs.map((run) => (
          <li key={run.id}>
            {t("tasks.attempt", {
              attempt: run.attempt,
              status: t(runStatusKeys[run.status]),
            })}
            {run.worktreeName ? ` · ${run.worktreeName}` : ""}
            {run.error ? <p role="alert">{run.error.message}</p> : null}
            {run.worktreeId && run.sessionId && onOpenSession ? (
              <button
                type="button"
                onClick={() => onOpenSession(run.worktreeId!, run.sessionId!)}
              >
                {t("tasks.openSession")}
              </button>
            ) : null}
          </li>
        ))}
      </ol>

      {latestRun?.status === "awaiting_report" ? (
        <section aria-label={t("tasks.reportRequired")}>
          <h3>{t("tasks.agentStopped")}</h3>
          <p>{t("tasks.stillRunning")}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void act(() => api.continueForReport(task.id, task.revision))
            }
          >
            {t("tasks.continueReport")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void act(() => api.cancel(task.id, task.revision))}
          >
            {t("tasks.cancelTask")}
          </button>
        </section>
      ) : null}

      {task.status === "needs_review" && latestRun?.report ? (
        <section aria-label={t("tasks.result")}>
          <h3>
            {t("tasks.resultLabel", {
              result: t(
                latestRun.report.outcome === "success"
                  ? "tasks.status.success"
                  : latestRun.report.outcome === "blocked"
                    ? "tasks.status.blocked"
                    : "tasks.status.failed",
              ),
            })}
          </h3>
          <p>{latestRun.report.summary}</p>
          <ul>
            {task.acceptanceCriteria.map((criterion) => {
              const result = latestRun.report?.acceptanceCriteria.find(
                ({ criterionId }) => criterionId === criterion.id,
              );
              return (
                <li key={criterion.id}>
                  {criterion.text}:{" "}
                  {result
                    ? t(resultStatusKeys[result.status])
                    : t("tasks.notReported")}
                  {result?.evidence ? ` — ${result.evidence}` : ""}
                </li>
              );
            })}
          </ul>
          <h4>{t("tasks.tests")}</h4>
          <ul>
            {latestRun.report.tests.map((test) => (
              <li key={`${test.command}:${test.status}`}>
                {test.command}: {t(resultStatusKeys[test.status])} —{" "}
                {test.summary}
              </li>
            ))}
          </ul>
          {latestRun.report.changeRequest ? (
            <a
              href={latestRun.report.changeRequest.url}
              target="_blank"
              rel="noreferrer noopener"
              onClick={(event) => {
                if (
                  !window.confirm(
                    t("tasks.externalLinkConfirm", {
                      url: latestRun.report?.changeRequest?.url ?? "",
                    }),
                  )
                )
                  event.preventDefault();
              }}
            >
              {t("tasks.openDraft")}
            </a>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void act(() => api.complete(task.id, task.revision))}
          >
            {t("tasks.acceptCompletion")}
          </button>
          <label>
            {t("tasks.changeNote")}
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={busy || note.trim().length === 0}
            onClick={() =>
              void act(() =>
                api.requestChanges(task.id, task.revision, note.trim()),
              )
            }
          >
            {t("tasks.requestChanges")}
          </button>
        </section>
      ) : null}

      {task.status === "backlog" ||
      task.status === "failed" ||
      task.status === "cancelled" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void act(() => api.run(task.id, task.revision))}
        >
          {task.status === "backlog"
            ? t("tasks.runTask")
            : t("tasks.retryTask")}
        </button>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </article>
  );
}
