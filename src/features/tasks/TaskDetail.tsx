import {
  RiArrowLeftLine,
  RiChat3Line,
  RiEditLine,
  RiExternalLinkLine,
  RiPlayLine,
  RiRestartLine,
} from "@remixicon/react";
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

  const statusLabel = t(
    task.status === "needs_review"
      ? "tasks.status.needsReview"
      : (`tasks.status.${task.status}` as TranslationKey),
  );

  return (
    <article className="task-detail" aria-labelledby="task-detail-title">
      <header className="task-detail-header">
        {onBack ? (
          <button className="task-icon-button" type="button" onClick={onBack}>
            <RiArrowLeftLine size={17} aria-hidden="true" />
            {t("tasks.back")}
          </button>
        ) : null}
        <div className="task-detail-title-row">
          <div>
            <h2 id="task-detail-title">{task.title}</h2>
            <span className={`task-status-badge task-status-${task.status}`}>
              {t("tasks.statusLabel", { status: statusLabel })}
            </span>
          </div>
          {onEdit &&
          ["backlog", "failed", "cancelled"].includes(task.status) &&
          !task.activeRunId ? (
            <button
              className="task-button task-button-secondary"
              type="button"
              onClick={onEdit}
            >
              <RiEditLine size={14} aria-hidden="true" />
              {t("tasks.edit")}
            </button>
          ) : null}
        </div>
      </header>

      <section className="task-detail-section task-detail-overview">
        <p>{task.description}</p>
        <h3>{t("tasks.acceptanceCriteria")}</h3>
        <ol className="task-criteria-list">
          {task.acceptanceCriteria.map((criterion) => (
            <li key={criterion.id}>{criterion.text}</li>
          ))}
        </ol>
      </section>

      <section className="task-detail-section">
        <h3>{t("tasks.runs")}</h3>
        {task.runs.length === 0 ? <p>{t("tasks.noRuns")}</p> : null}
        <ol className="task-run-list">
          {task.runs.map((run) => (
            <li className="task-run-card" key={run.id}>
              <div className="task-run-heading">
                <strong>
                  {t("tasks.attempt", {
                    attempt: run.attempt,
                    status: t(runStatusKeys[run.status]),
                  })}
                </strong>
                {run.worktreeName ? <code>{run.worktreeName}</code> : null}
              </div>
              {run.error ? (
                <p className="task-run-error" role="alert">
                  {run.error.message}
                </p>
              ) : null}
              {run.worktreeId && run.sessionId && onOpenSession ? (
                <button
                  className="task-button task-button-secondary"
                  type="button"
                  onClick={() => onOpenSession(run.worktreeId!, run.sessionId!)}
                >
                  <RiChat3Line size={14} aria-hidden="true" />
                  {t("tasks.openSession")}
                </button>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      {latestRun?.status === "awaiting_report" ? (
        <section
          className="task-detail-section task-attention-card"
          aria-label={t("tasks.reportRequired")}
        >
          <h3>{t("tasks.agentStopped")}</h3>
          <p>{t("tasks.stillRunning")}</p>
          <div className="task-detail-actions">
            <button
              className="task-button task-button-primary"
              type="button"
              disabled={busy}
              onClick={() =>
                void act(() => api.continueForReport(task.id, task.revision))
              }
            >
              <RiPlayLine size={14} aria-hidden="true" />
              {t("tasks.continueReport")}
            </button>
            <button
              className="task-button task-button-secondary"
              type="button"
              disabled={busy}
              onClick={() => void act(() => api.cancel(task.id, task.revision))}
            >
              {t("tasks.cancelTask")}
            </button>
          </div>
        </section>
      ) : null}

      {task.status === "needs_review" && latestRun?.report ? (
        <section
          className="task-detail-section task-result-card"
          aria-label={t("tasks.result")}
        >
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
              className="task-external-link"
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
              <RiExternalLinkLine size={13} aria-hidden="true" />
            </a>
          ) : null}
          <div className="task-detail-actions">
            <button
              className="task-button task-button-primary"
              type="button"
              disabled={busy}
              onClick={() =>
                void act(() => api.complete(task.id, task.revision))
              }
            >
              {t("tasks.acceptCompletion")}
            </button>
          </div>
          <label className="task-change-note">
            <span>{t("tasks.changeNote")}</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <button
            className="task-button task-button-secondary"
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
          className="task-button task-button-primary task-detail-run"
          type="button"
          disabled={busy}
          onClick={() => void act(() => api.run(task.id, task.revision))}
        >
          {task.status === "backlog" ? (
            <RiPlayLine size={14} aria-hidden="true" />
          ) : (
            <RiRestartLine size={14} aria-hidden="true" />
          )}
          {task.status === "backlog"
            ? t("tasks.runTask")
            : t("tasks.retryTask")}
        </button>
      ) : null}
      {error ? (
        <p className="task-page-message task-page-error" role="alert">
          {error}
        </p>
      ) : null}
    </article>
  );
}
