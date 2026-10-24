import { formatNumber } from "../../i18n";
import type { TaskDashboardValue } from "./tasksApi";
import type { TaskListView } from "./tasksStore";

interface TaskDashboardProps {
  value: TaskDashboardValue | null;
  loading: boolean;
  error: string | null;
  t(key: string, values?: Record<string, string | number>): string;
  onRetry(): void;
  onSelectView(
    view: Extract<TaskListView, "attention" | "active" | "completed">,
  ): void;
}

export function TaskDashboard({
  value,
  loading,
  error,
  t,
  onRetry,
  onSelectView,
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

  const metrics: Array<{
    key: string;
    label: string;
    value: string;
    view?: "attention" | "active" | "completed";
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
    },
    {
      key: "completed",
      label: t("tasks.dashboard.completed"),
      value: formatNumber(value.completed),
      view: "completed",
    },
  ];

  return (
    <section
      className="task-dashboard"
      aria-labelledby="task-dashboard-heading"
      aria-busy={loading}
    >
      <div className="task-dashboard-heading-row">
        <h2 id="task-dashboard-heading">{t("tasks.dashboard.heading")}</h2>
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
    </section>
  );
}
