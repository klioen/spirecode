import { formatNumber, type AppLanguage } from "../../i18n";
import { formatTaskDuration, formatTaskTokens } from "./taskMetrics";
import { taskStatusKeys } from "./taskPresentation";
import type { TaskDashboardValue, TaskStatus } from "./tasksApi";
import type { TaskListView } from "./tasksStore";

const STATUS_ORDER: TaskStatus[] = [
  "backlog",
  "queued",
  "running",
  "needs_review",
  "completed",
  "failed",
  "cancelled",
];

interface TaskDashboardProps {
  value: TaskDashboardValue | null;
  loading: boolean;
  error: string | null;
  language: AppLanguage;
  now: number;
  t(key: string, values?: Record<string, string | number>): string;
  onRetry(): void;
  onSelectView(
    view: Extract<TaskListView, "attention" | "active" | "completed">,
  ): void;
  onSelectStatus(status: TaskStatus): void;
}

export function TaskDashboard({
  value,
  loading,
  error,
  language,
  now,
  t,
  onRetry,
  onSelectView,
  onSelectStatus,
}: TaskDashboardProps) {
  if (!value && loading)
    return (
      <section
        className="task-dashboard task-dashboard-loading"
        aria-busy="true"
      >
        <p role="status">{t("tasks.dashboard.loading")}</p>
      </section>
    );
  if (!value && error)
    return (
      <section
        className="task-dashboard task-dashboard-error"
        aria-label={t("tasks.dashboard.heading")}
      >
        <p role="alert">{error}</p>
        <button
          className="task-button task-button-secondary"
          type="button"
          onClick={onRetry}
        >
          {t("tasks.dashboard.retry")}
        </button>
      </section>
    );
  if (!value) return null;

  const liveDuration =
    value.durationMs +
    value.advancingRunCount * Math.max(0, now - value.measuredAt);
  const maximumStatusCount = Math.max(1, ...Object.values(value.byStatus));
  const metrics: Array<{
    key: string;
    label: string;
    value: string;
    view?: "attention" | "active" | "completed";
    description?: string;
  }> = [
    {
      key: "total",
      label: t("tasks.dashboard.total"),
      value: formatNumber(value.total),
    },
    {
      key: "active",
      label: t("tasks.dashboard.active"),
      value: formatNumber(value.active),
      view: "active",
    },
    {
      key: "attention",
      label: t("tasks.dashboard.attention"),
      value: formatNumber(value.attention),
      view: "attention",
      description: t("tasks.dashboard.overlapHint"),
    },
    {
      key: "completed",
      label: t("tasks.dashboard.completed"),
      value: formatNumber(value.completed),
      view: "completed",
    },
    {
      key: "createdRecent",
      label: t("tasks.dashboard.createdRecent"),
      value: formatNumber(value.createdLast7Days),
    },
    {
      key: "completedRecent",
      label: t("tasks.dashboard.completedRecent"),
      value: formatNumber(value.completedLast7Days),
    },
    {
      key: "duration",
      label: t("tasks.dashboard.duration"),
      value: formatTaskDuration(liveDuration, language),
    },
    {
      key: "tokens",
      label: t("tasks.dashboard.tokens"),
      value: formatTaskTokens(value.tokenCount),
    },
  ];

  return (
    <section
      className="task-dashboard"
      aria-labelledby="task-dashboard-heading"
      aria-busy={loading}
    >
      <div className="task-dashboard-heading-row">
        <div>
          <h2 id="task-dashboard-heading">{t("tasks.dashboard.heading")}</h2>
          <p>{t("tasks.dashboard.globalHint")}</p>
        </div>
        {loading ? (
          <span role="status">{t("tasks.dashboard.refreshing")}</span>
        ) : null}
      </div>
      {error ? (
        <div className="task-dashboard-inline-error" role="alert">
          <span>{error}</span>
          <button
            className="task-button task-button-secondary"
            type="button"
            onClick={onRetry}
          >
            {t("tasks.dashboard.retry")}
          </button>
        </div>
      ) : null}
      <div className="task-dashboard-grid">
        {metrics.map((metric) => {
          const contents = (
            <>
              <span className="task-dashboard-metric-label">
                {metric.label}
              </span>
              <strong>{metric.value}</strong>
              {metric.description ? <small>{metric.description}</small> : null}
            </>
          );
          return metric.view ? (
            <button
              className="task-dashboard-metric task-dashboard-metric-action"
              type="button"
              key={metric.key}
              onClick={() => onSelectView(metric.view!)}
              aria-label={t("tasks.dashboard.filterView", {
                label: metric.label,
                count: metric.value,
              })}
            >
              {contents}
            </button>
          ) : (
            <div className="task-dashboard-metric" key={metric.key}>
              {contents}
            </div>
          );
        })}
      </div>
      <div className="task-dashboard-distribution">
        <h3>{t("tasks.dashboard.distribution")}</h3>
        {value.total === 0 ? <p>{t("tasks.dashboard.empty")}</p> : null}
        <ul>
          {STATUS_ORDER.map((status) => {
            const count = value.byStatus[status];
            const label = t(taskStatusKeys[status]);
            return (
              <li key={status}>
                <button
                  type="button"
                  onClick={() => onSelectStatus(status)}
                  aria-label={t("tasks.dashboard.filterStatus", {
                    label,
                    count,
                  })}
                >
                  <span className="task-dashboard-status-row">
                    <span>{label}</span>
                    <strong>{formatNumber(count)}</strong>
                  </span>
                  <span className="task-dashboard-bar-track" aria-hidden="true">
                    <span
                      className={`task-dashboard-bar task-dashboard-bar-${status}`}
                      style={{
                        width: `${(count / maximumStatusCount) * 100}%`,
                      }}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
