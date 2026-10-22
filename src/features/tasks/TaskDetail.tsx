import { TaskArchiveView } from "./TaskArchiveView";
import {
  RiArrowLeftLine,
  RiChat3Line,
  RiDeleteBinLine,
  RiEditLine,
  RiExternalLinkLine,
  RiPlayLine,
  RiRestartLine,
} from "@remixicon/react";
import { useEffect, useState } from "react";
import {
  formatDateTime,
  useTranslation,
  type TranslationKey,
} from "../../i18n";
import type { TaskDetailValue, TaskRunSummary, TasksApi } from "./tasksApi";
import { formatTaskDuration, formatTaskTokens } from "./taskMetrics";
import {
  taskErrorMessage,
  relativeTaskTime,
  taskDisplayStatus,
  taskStatusKeys,
} from "./taskPresentation";

interface TaskDetailProps {
  api: TasksApi;
  task: TaskDetailValue;
  onChange: (task: TaskDetailValue) => void;
  onBack?: () => void;
  onEdit?: () => void;
  onOpenSession?: (
    worktreeId: string,
    sessionId: string,
  ) => void | Promise<void>;
  onOpenChanges?: (worktreeId: string) => void | Promise<void>;
}
const resultStatusKeys = {
  passed: "tasks.status.passed",
  failed: "tasks.status.failed",
  not_run: "tasks.status.notRun",
} as const;
const cleanupReasonKeys: Record<string, TranslationKey> = {
  TASK_WORKSPACE_DIRTY_CONFIRMATION_REQUIRED: "tasks.workspaceDirty",
  TASK_WORKSPACE_BUSY: "tasks.workspaceBusy",
  TASK_WORKSPACE_NOT_MANAGED: "tasks.workspaceOwnershipChanged",
  TASK_WORKSPACE_REFERENCED: "tasks.workspaceReferenced",
  TASK_FAILED: "tasks.workspaceCleanupFailed",
  TASK_ARCHIVE_FAILED: "tasks.archive.failed",
};
function TaskReport({
  report,
}: {
  report: NonNullable<TaskRunSummary["report"]>;
}) {
  const { t } = useTranslation();
  const counts = { passed: 0, failed: 0, not_run: 0 };
  report.tests.forEach((test) => counts[test.status]++);
  return (
    <div className="task-report-content">
      <h3>
        {t("tasks.resultLabel", {
          result: t(
            report.outcome === "success"
              ? "tasks.status.success"
              : report.outcome === "blocked"
                ? "tasks.status.blocked"
                : "tasks.status.failed",
          ),
        })}
      </h3>
      <p className="task-report-summary">{report.summary}</p>
      <p className="task-test-totals">{t("tasks.testTotals", counts)}</p>
      {report.tests.length > 0 ? (
        <details className="task-test-evidence">
          <summary>{t("tasks.testEvidence")}</summary>
          <ul>
            {report.tests.map((test, index) => (
              <li key={index}>
                <code>{test.command}</code>: {t(resultStatusKeys[test.status])}{" "}
                — {test.summary}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {report.changeRequest ? (
        <a
          className="task-external-link"
          href={report.changeRequest.url}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(event) => {
            if (
              !window.confirm(
                t("tasks.externalLinkConfirm", {
                  url: report.changeRequest!.url,
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
    </div>
  );
}
export function TaskDetail({
  api,
  task,
  onChange,
  onBack,
  onEdit,
  onOpenSession,
  onOpenChanges,
}: TaskDetailProps) {
  const { language, t } = useTranslation();
  const [note, setNote] = useState("");
  const [archiveRun, setArchiveRun] = useState<string | null>(null);
  const [artifactPaths, setArtifactPaths] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestRun = task.runs[0] ?? null;
  useEffect(() => setNote(""), [latestRun?.id]);
  const status = taskDisplayStatus({
    ...task,
    executionStatus: latestRun?.status ?? task.executionStatus,
  });
  const active =
    Boolean(task.activeRunId) && ["queued", "running"].includes(task.status);
  const awaitingReport = active && latestRun?.status === "awaiting_report";
  const canOpen =
    latestRun?.worktreeId &&
    latestRun.sessionId &&
    task.workspaceCleanupStatus !== "removed";
  const act = async (operation: () => Promise<TaskDetailValue>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await operation());
    } catch (caught) {
      setError(taskErrorMessage(caught, t("tasks.actionFailed")));
    } finally {
      setBusy(false);
    }
  };
  const navigate = async (operation: () => void | Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (caught) {
      setError(taskErrorMessage(caught, t("tasks.openFailed")));
    } finally {
      setBusy(false);
    }
  };
  const cancel = () => {
    if (
      task.status !== "queued" &&
      !awaitingReport &&
      !window.confirm(t("tasks.stopConfirm"))
    )
      return;
    void act(() => api.cancel(task.id, task.revision));
  };
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
            <span className={`task-status-badge task-status-${status}`}>
              {t("tasks.statusLabel", { status: t(taskStatusKeys[status]) })}
            </span>
          </div>
          <div className="task-detail-actions">
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
            {["backlog", "failed", "cancelled"].includes(task.status) ? (
              <button
                className="task-button task-button-primary"
                type="button"
                disabled={busy}
                onClick={() => void act(() => api.run(task.id, task.revision))}
              >
                {task.status === "backlog" ? (
                  <RiPlayLine size={14} aria-hidden="true" />
                ) : (
                  <RiRestartLine size={14} aria-hidden="true" />
                )}
                {t(
                  task.status === "backlog"
                    ? "tasks.runTask"
                    : "tasks.retryTask",
                )}
              </button>
            ) : null}
            {active ? (
              <button
                className="task-button task-button-secondary"
                type="button"
                disabled={busy}
                onClick={cancel}
              >
                {t(
                  task.status === "queued"
                    ? "tasks.cancelQueue"
                    : awaitingReport
                      ? "tasks.cancelTask"
                      : "tasks.stopExecution",
                )}
              </button>
            ) : null}
          </div>
        </div>
      </header>
      {error ? (
        <p className="task-page-message task-page-error" role="alert">
          {error}
        </p>
      ) : null}
      <section
        className={`task-detail-section task-current-state ${awaitingReport ? "task-attention-card" : ""}`}
        aria-label={t("tasks.currentExecution")}
      >
        <h3>{t("tasks.currentExecution")}</h3>
        {task.status === "queued" ? (
          <p>
            {t(
              task.queueReason === "workspace_busy"
                ? "tasks.waitWorkspace"
                : task.queueReason === "capacity"
                  ? "tasks.waitCapacity"
                  : "tasks.waitDispatch",
            )}
          </p>
        ) : null}
        {status === "provisioning" || status === "prompting" ? (
          <p>{t(taskStatusKeys[status])}</p>
        ) : null}
        {awaitingReport ? (
          <>
            <p>{t("tasks.agentStopped")}</p>
            <p>{t("tasks.stillRunning")}</p>
            <button
              className="task-button task-button-primary"
              type="button"
              disabled={busy}
              onClick={() =>
                void act(() => api.continueForReport(task.id, task.revision))
              }
            >
              {t("tasks.continueReport")}
            </button>
          </>
        ) : null}
        {latestRun?.report && active ? (
          <p className="task-attention-message" role="status">
            {t("tasks.reportFinalizing")}
          </p>
        ) : null}
        {latestRun?.error ? (
          <p className="task-run-error" role="alert">
            {latestRun.error.message}
          </p>
        ) : null}
        {latestRun ? (
          <p className="task-current-meta">
            {t("tasks.attempt", {
              attempt: latestRun.attempt,
              status: t(taskStatusKeys[latestRun.status]),
            })}{" "}
            ·{" "}
            <time
              dateTime={new Date(
                task.lastActivityAt ?? task.updatedAt,
              ).toISOString()}
              title={formatDateTime(task.lastActivityAt ?? task.updatedAt)}
            >
              {relativeTaskTime(
                task.lastActivityAt ?? task.updatedAt,
                language,
              )}
            </time>
          </p>
        ) : (
          <p>{t("tasks.noRuns")}</p>
        )}
        <div className="task-detail-actions">
          {latestRun?.archiveStatus === "empty" ? (
            <p>{t("tasks.archive.empty")}</p>
          ) : null}
          {latestRun?.archiveStatus === "empty"
            ? latestRun.archivedArtifacts?.map((file) => (
                <button
                  className="task-button task-button-secondary"
                  key={file.relativePath}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void navigate(() =>
                      api.archiveReveal(
                        task.id,
                        latestRun.id,
                        file.relativePath,
                      ),
                    )
                  }
                >
                  {file.relativePath}
                </button>
              ))
            : null}
          {latestRun?.archiveStatus === "archived" ? (
            <button
              className="task-button task-button-secondary"
              type="button"
              onClick={() => setArchiveRun(latestRun.id)}
            >
              {t("tasks.archive.view")}
            </button>
          ) : null}
          {canOpen && onOpenSession ? (
            <button
              className="task-button task-button-secondary"
              type="button"
              disabled={busy}
              onClick={() =>
                void navigate(() =>
                  onOpenSession(latestRun!.worktreeId!, latestRun!.sessionId!),
                )
              }
            >
              <RiChat3Line size={14} aria-hidden="true" />
              {t("tasks.openSession")}
            </button>
          ) : null}
          {latestRun?.worktreeId &&
          task.workspaceCleanupStatus !== "removed" &&
          task.supportsChanges !== false &&
          onOpenChanges ? (
            <button
              className="task-button task-button-secondary"
              type="button"
              disabled={busy}
              onClick={() =>
                void navigate(() => onOpenChanges(latestRun.worktreeId!))
              }
            >
              {t("tasks.viewChanges")}
            </button>
          ) : null}
        </div>
      </section>
      {latestRun?.report ? (
        <section
          className="task-detail-section task-result-card"
          aria-label={t("tasks.result")}
        >
          <TaskReport report={latestRun.report} />
          {task.status === "needs_review" ? (
            <div className="task-review-actions">
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
                disabled={busy || !note.trim()}
                onClick={() =>
                  void act(() =>
                    api.requestChanges(task.id, task.revision, note.trim()),
                  )
                }
              >
                {t("tasks.requestChanges")}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
      <section
        className="task-detail-section task-resource-summary"
        aria-label={t("tasks.overview")}
      >
        <dl className="task-metrics-grid">
          <div>
            <dt>{t("tasks.form.project")}</dt>
            <dd>{task.projectName ?? t("tasks.projectUnavailable")}</dd>
          </div>
          <div>
            <dt>{t("tasks.workspace")}</dt>
            <dd title={task.workspaceName ?? latestRun?.worktreeName ?? ""}>
              {task.workspaceCleanupStatus === "removed"
                ? t("tasks.workspaceRemovedLabel")
                : (task.workspaceName ??
                  latestRun?.worktreeName ??
                  t("tasks.workspacePending"))}
            </dd>
          </div>
          <div>
            <dt>{t("tasks.metrics.duration")}</dt>
            <dd>{formatTaskDuration(task.durationMs, language)}</dd>
          </div>
          <div>
            <dt>{t("tasks.metrics.tokens")}</dt>
            <dd>{formatTaskTokens(task.tokenCount)}</dd>
          </div>
        </dl>
      </section>
      <details
        className="task-detail-section task-detail-overview"
        open={task.status === "backlog"}
      >
        <summary>{t("tasks.requirements")}</summary>
        <p>{task.description || t("tasks.noDescription")}</p>
      </details>
      {task.runs.length > 1 ? (
        <details className="task-detail-section task-history">
          <summary>
            {t("tasks.history", { count: task.runs.length - 1 })}
          </summary>
          <ol className="task-run-list">
            {task.runs.slice(1).map((run) => (
              <li className="task-run-card" key={run.id}>
                <div className="task-run-heading">
                  <strong>
                    {t("tasks.attempt", {
                      attempt: run.attempt,
                      status: t(taskStatusKeys[run.status]),
                    })}
                  </strong>
                  {run.worktreeName ? (
                    <code title={run.worktreeName}>{run.worktreeName}</code>
                  ) : null}
                </div>
                {run.report ? (
                  <details className="task-result-card">
                    <summary>{t("tasks.result")}</summary>
                    <TaskReport report={run.report} />
                  </details>
                ) : null}
                {run.error ? (
                  <p className="task-run-error">{run.error.message}</p>
                ) : null}
                {run.archiveStatus === "empty" ? (
                  <p>{t("tasks.archive.empty")}</p>
                ) : null}
                {run.archiveStatus === "empty"
                  ? run.archivedArtifacts?.map((file) => (
                      <button
                        className="task-button task-button-secondary"
                        key={file.relativePath}
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void navigate(() =>
                            api.archiveReveal(
                              task.id,
                              run.id,
                              file.relativePath,
                            ),
                          )
                        }
                      >
                        {file.relativePath}
                      </button>
                    ))
                  : null}
                {run.archiveStatus === "archived" ? (
                  <button
                    className="task-button task-button-secondary"
                    type="button"
                    onClick={() => setArchiveRun(run.id)}
                  >
                    {t("tasks.archive.view")}
                  </button>
                ) : null}
                {run.worktreeId &&
                run.sessionId &&
                onOpenSession &&
                task.workspaceCleanupStatus !== "removed" ? (
                  <button
                    className="task-button task-button-secondary"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void navigate(() =>
                        onOpenSession(run.worktreeId!, run.sessionId!),
                      )
                    }
                  >
                    {t("tasks.openSession")}
                  </button>
                ) : null}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      {archiveRun ? (
        <TaskArchiveView
          key={`${task.id}:${archiveRun}`}
          api={api}
          taskId={task.id}
          runId={archiveRun}
          onClose={() => setArchiveRun(null)}
        />
      ) : null}
      {["completed", "failed", "cancelled"].includes(task.status) ? (
        <section className="task-detail-section">
          <h3>{t("tasks.archive.heading")}</h3>
          <p>
            {t(
              task.archiveStatus === "ready"
                ? "tasks.archive.ready"
                : task.archiveStatus === "failed"
                  ? "tasks.archive.failed"
                  : "tasks.archive.pending",
            )}
          </p>
          {task.workspaceCleanupStatus !== "removed" && latestRun ? (
            <label className="task-form-field">
              {t("tasks.archive.selectArtifacts")}
              <textarea
                maxLength={22000}
                value={artifactPaths}
                onChange={(event) => setArtifactPaths(event.target.value)}
                disabled={busy}
                placeholder={t("tasks.archive.artifactHint")}
              />
            </label>
          ) : null}
          <button
            className="task-button task-button-secondary"
            disabled={busy}
            type="button"
            onClick={() =>
              void act(() =>
                api.archive(
                  task.id,
                  task.revision,
                  latestRun
                    ? artifactPaths
                        .split("\n")
                        .map((value) => value.trim())
                        .filter(Boolean)
                        .map((relativePath) => ({
                          runId: latestRun.id,
                          relativePath,
                        }))
                    : [],
                ),
              )
            }
          >
            {t("tasks.archive.save")}
          </button>
        </section>
      ) : null}
      {task.status === "completed" && task.ownsManagedWorktree ? (
        <section className="task-detail-section task-workspace-cleanup">
          <h3>{t("tasks.workspace")}</h3>
          {task.workspaceCleanupStatus === "removed" ? (
            <p>{t("tasks.workspaceRemoved")}</p>
          ) : (
            <>
              <p>
                {task.workspaceCleanupStatus === "blocked"
                  ? t("tasks.workspaceRetained", {
                      reason: t(
                        cleanupReasonKeys[
                          task.workspaceCleanupErrorCode ?? ""
                        ] ?? "tasks.workspaceUnsafe",
                      ),
                    })
                  : t("tasks.workspaceCleanupDescription")}
              </p>
              <button
                className="task-button task-button-secondary"
                type="button"
                disabled={busy || !task.resolvedWorktreeId}
                onClick={() => {
                  if (window.confirm(t("tasks.cleanupConfirm")))
                    void act(() =>
                      (async () => {
                        const archived = await api.archive(
                          task.id,
                          task.revision,
                          latestRun
                            ? artifactPaths
                                .split("\n")
                                .map((value) => value.trim())
                                .filter(Boolean)
                                .map((relativePath) => ({
                                  runId: latestRun.id,
                                  relativePath,
                                }))
                            : [],
                        );
                        return api.cleanupWorkspace(
                          archived.id,
                          archived.revision,
                        );
                      })(),
                    );
                }}
              >
                <RiDeleteBinLine size={14} aria-hidden="true" />
                {t("tasks.cleanupWorkspace")}
              </button>
            </>
          )}
        </section>
      ) : null}
    </article>
  );
}
