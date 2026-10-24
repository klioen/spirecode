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
import { MarkdownContent } from "../chat/MarkdownContent";
import type {
  TaskDetailValue,
  TaskRunSummary,
  TaskVerificationValue,
  TasksApi,
} from "./tasksApi";
import { formatTaskDuration, formatTaskTokens } from "./taskMetrics";
import {
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
        <div
          className="task-delivery-artifact"
          role="region"
          aria-label={t("tasks.delivery.title")}
        >
          <div className="task-delivery-heading">
            <strong>{t("tasks.delivery.title")}</strong>
            <span
              className={`task-delivery-status ${report.changeRequest.draft ? "is-draft" : "is-ready"}`}
            >
              {t(
                report.changeRequest.draft
                  ? "tasks.delivery.draft"
                  : "tasks.delivery.ready",
              )}
            </span>
          </div>
          <p>
            {t(
              report.changeRequest.kind === "github_pr"
                ? "tasks.delivery.githubPr"
                : report.changeRequest.kind === "gitlab_mr"
                  ? "tasks.delivery.gitlabMr"
                  : "tasks.delivery.changeRequest",
            )}
          </p>
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
            {t("tasks.delivery.open")}
            <RiExternalLinkLine size={13} aria-hidden="true" />
          </a>
        </div>
      ) : null}
    </div>
  );
}
function VerificationReport({
  verification,
}: {
  verification: TaskVerificationValue;
}) {
  const { t } = useTranslation();
  const verdict = verification.verdict ?? "running";
  const needsAttention = ["running", "fail", "inconclusive"].includes(verdict);
  return (
    <details
      className="task-detail-section task-verification-details"
      open={needsAttention}
    >
      <summary className="task-verification-summary">
        <span>{t("tasks.verification.title")}</span>
        <span className={`task-delivery-status verification-${verdict}`}>
          {t(`tasks.verification.${verdict}` as TranslationKey)}
        </span>
      </summary>
      <div className="task-verification-content">
        <code>{verification.commitSha.slice(0, 12)}</code>
        {verification.summary ? <p>{verification.summary}</p> : null}
        {verification.evidence?.acceptanceCriteria.length ? (
          <details open>
            <summary>{t("tasks.verification.criteria")}</summary>
            <ul>
              {verification.evidence.acceptanceCriteria.map((check, index) => (
                <li key={index}>
                  <strong>
                    {t(`tasks.verification.${check.status}` as TranslationKey)}
                  </strong>{" "}
                  {check.criterion}
                  {check.evidence.length ? (
                    <ul>
                      {check.evidence.map((item, evidenceIndex) => (
                        <li key={evidenceIndex}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {verification.evidence?.commands.length ? (
          <details>
            <summary>{t("tasks.verification.commands")}</summary>
            <ul>
              {verification.evidence.commands.map((command, index) => (
                <li key={index}>
                  <code>{command.command}</code>: {command.summary}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {verification.evidence?.issues.length ? (
          <details open>
            <summary>{t("tasks.verification.issues")}</summary>
            <ul>
              {verification.evidence.issues.map((issue, index) => (
                <li key={index}>
                  <strong>{issue.severity}</strong>: {issue.summary}
                  {issue.evidence ? ` — ${issue.evidence}` : ""}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </details>
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
      setError(
        caught instanceof Error ? caught.message : t("tasks.actionFailed"),
      );
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
      setError(
        caught instanceof Error ? caught.message : t("tasks.openFailed"),
      );
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
        <div className="task-detail-title-row">
          {onBack ? (
            <button className="task-icon-button" type="button" onClick={onBack}>
              <RiArrowLeftLine size={17} aria-hidden="true" />
              {t("tasks.back")}
            </button>
          ) : null}
          <div className="task-detail-title">
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
        className="task-detail-section task-verification-setting"
        aria-label={t("tasks.verification.title")}
      >
        <label>
          <input
            type="checkbox"
            checked={task.verificationEnabled}
            disabled={
              busy || Boolean(task.activeRunId) || task.status === "completed"
            }
            onChange={(event) =>
              void act(() =>
                api.update(task.id, task.revision, {
                  verificationEnabled: event.target.checked,
                }),
              )
            }
          />
          <span>{t("tasks.verification.enabled")}</span>
        </label>
        <p>{t("tasks.verification.description")}</p>
      </section>
      {task.verification ? (
        <>
          <VerificationReport verification={task.verification} />
          {task.verification.sessionId &&
          onOpenSession &&
          task.workspaceCleanupStatus !== "removed" ? (
            <button
              className="task-button task-button-secondary"
              type="button"
              disabled={busy}
              onClick={() =>
                void navigate(() =>
                  onOpenSession(
                    task.verification!.worktreeId,
                    task.verification!.sessionId!,
                  ),
                )
              }
            >
              {t("tasks.verification.openSession")}
            </button>
          ) : null}
          {["needs_review", "failed"].includes(task.status) &&
          !task.activeRunId &&
          latestRun?.report?.outcome === "success" &&
          task.verificationEnabled &&
          task.verification.verdict &&
          task.verification.verdict !== "pass" ? (
            <section className="task-detail-section task-review-actions">
              <p>{t("tasks.verification.retryHint")}</p>
              <button
                className="task-button task-button-secondary"
                type="button"
                disabled={busy}
                onClick={() =>
                  void act(() => api.retryVerification(task.id, task.revision))
                }
              >
                <RiRestartLine size={14} aria-hidden="true" />
                {t("tasks.verification.retry")}
              </button>
              {task.verification.verdict === "inconclusive" &&
              task.verification.summary ===
                "Verifier session timed out before submitting a verdict." ? (
                <button
                  className="task-button task-button-primary"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void act(() =>
                      api.recoverVerification(task.id, task.revision),
                    )
                  }
                >
                  {t("tasks.verification.recover")}
                </button>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}
      <section
        className="task-detail-section task-resource-summary"
        aria-label={t("tasks.overview")}
      >
        <dl className="task-metrics-grid">
          <div className="task-resource-item">
            <dt>{t("tasks.form.project")}</dt>
            <dd>{task.projectName ?? t("tasks.projectUnavailable")}</dd>
          </div>
          <div className="task-resource-item">
            <dt>{t("tasks.workspace")}</dt>
            <dd title={task.workspaceName ?? latestRun?.worktreeName ?? ""}>
              {task.workspaceCleanupStatus === "removed"
                ? t("tasks.workspaceRemovedLabel")
                : (task.workspaceName ??
                  latestRun?.worktreeName ??
                  t("tasks.workspacePending"))}
            </dd>
          </div>
          <div className="task-resource-item">
            <dt>{t("tasks.metrics.duration")}</dt>
            <dd>{formatTaskDuration(task.durationMs, language)}</dd>
          </div>
          <div className="task-resource-item">
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
        <MarkdownContent
          className="task-markdown"
          content={task.description || t("tasks.noDescription")}
        />
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
                      api.cleanupWorkspace(task.id, task.revision),
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
