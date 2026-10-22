import {
  RiAddLine,
  RiDeleteBinLine,
  RiNotification3Line,
  RiTaskLine,
} from "@remixicon/react";
import { useEffect, useState } from "react";
import {
  formatDateTime,
  useTranslation,
  type TranslationKey,
} from "../../i18n";
import { TaskDetail } from "./TaskDetail";
import { TaskForm, type TaskProjectOption } from "./TaskForm";
import type {
  TaskDetailValue,
  TaskNotificationValue,
  TaskStatus,
  TasksApi,
} from "./tasksApi";
import { formatTaskDuration, formatTaskTokens } from "./taskMetrics";
import { DEFAULT_TASK_STATUSES, useTasksStore } from "./tasksStore";

interface TaskPageProps {
  api: TasksApi;
  projects: TaskProjectOption[];
  onOpenSession?: (worktreeId: string, sessionId: string) => void;
}

const optionalStatuses: TaskStatus[] = ["completed", "cancelled"];
const taskStatusKeys: Record<TaskStatus, TranslationKey> = {
  backlog: "tasks.status.backlog",
  queued: "tasks.status.queued",
  running: "tasks.status.running",
  needs_review: "tasks.status.needsReview",
  completed: "tasks.status.completed",
  failed: "tasks.status.failed",
  cancelled: "tasks.status.cancelled",
};

export function TaskPage({ api, projects, onOpenSession }: TaskPageProps) {
  const { language, t } = useTranslation();
  const store = useTasksStore();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [detail, setDetail] = useState<TaskDetailValue | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<TaskNotificationValue[]>(
    [],
  );
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationCursor, setNotificationCursor] = useState<string | null>(
    null,
  );
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [cleaningWorkspaces, setCleaningWorkspaces] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);

  useEffect(() => {
    void store.load(api);
    const refreshNotifications = () =>
      void api.notificationsList({ limit: 50 }).then((page) => {
        setNotifications(page.items);
        setNotificationCursor(page.nextCursor);
      });
    refreshNotifications();
    return api.subscribe((event) => {
      if (event.kind === "notification") refreshNotifications();
    });
  }, [api]);

  useEffect(() => {
    if (!store.selectedTaskId || detail?.id === store.selectedTaskId) return;
    void api
      .get(store.selectedTaskId)
      .then(setDetail, (error: unknown) =>
        setDetailError(
          error instanceof Error ? error.message : t("tasks.openFailed"),
        ),
      );
  }, [api, detail?.id, store.selectedTaskId, t]);

  const selectedSummary = store.items.find(
    ({ id }) => id === store.selectedTaskId,
  );
  useEffect(() => {
    if (
      !detail ||
      !selectedSummary ||
      selectedSummary.revision <= detail.revision
    )
      return;
    void api
      .get(detail.id)
      .then(setDetail, (error: unknown) =>
        setDetailError(
          error instanceof Error ? error.message : t("tasks.refreshFailed"),
        ),
      );
  }, [api, detail, selectedSummary?.revision, t]);

  const open = async (taskId: string) => {
    store.selectTask(taskId);
    setDetailError(null);
    try {
      setDetail(await api.get(taskId));
    } catch (error) {
      setDetailError(
        error instanceof Error ? error.message : t("tasks.openFailed"),
      );
    }
  };

  if (creating || (editing && detail)) {
    return (
      <main className="task-page">
        <TaskForm
          api={api}
          projects={projects}
          task={editing ? (detail ?? undefined) : undefined}
          onCancel={() => {
            setCreating(false);
            setEditing(false);
          }}
          onCreated={(task) => {
            setCreating(false);
            setEditing(false);
            setDetail(task);
            store.selectTask(task.id);
            void store.load(api);
          }}
        />
      </main>
    );
  }

  if (detail && store.selectedTaskId === detail.id) {
    return (
      <main className="task-page">
        <TaskDetail
          api={api}
          task={detail}
          onChange={(task) => {
            setDetail(task);
            void store.load(api);
          }}
          onEdit={() => setEditing(true)}
          onBack={() => {
            store.selectTask(null);
            setDetail(null);
          }}
          onOpenSession={onOpenSession}
        />
      </main>
    );
  }

  return (
    <main className="task-page">
      <header className="task-page-header">
        <div className="task-page-heading">
          <span className="task-page-heading-icon" aria-hidden="true">
            <RiTaskLine size={18} />
          </span>
          <h1>{t("tasks.heading")}</h1>
        </div>
        <div className="task-page-actions">
          {store.items.some(
            (task) =>
              task.status === "completed" &&
              task.ownsManagedWorktree &&
              task.resolvedWorktreeId &&
              task.workspaceCleanupStatus !== "removed",
          ) ? (
            <button
              className="task-button task-button-secondary"
              type="button"
              disabled={cleaningWorkspaces}
              onClick={() => {
                setCleaningWorkspaces(true);
                setCleanupResult(null);
                const candidates = store.items.filter(
                  (task) =>
                    task.status === "completed" &&
                    task.ownsManagedWorktree &&
                    task.resolvedWorktreeId &&
                    task.workspaceCleanupStatus !== "removed",
                );
                void (async () => {
                  let cleaned = 0;
                  for (const task of candidates) {
                    try {
                      const result = await api.cleanupWorkspace(
                        task.id,
                        task.revision,
                      );
                      if (result.workspaceCleanupStatus === "removed")
                        cleaned += 1;
                    } catch {
                      // Clean-only bulk cleanup retains every unsafe workspace.
                    }
                  }
                  setCleanupResult(
                    t("tasks.cleanupResult", {
                      cleaned,
                      skipped: candidates.length - cleaned,
                    }),
                  );
                  await store.load(api);
                })().finally(() => setCleaningWorkspaces(false));
              }}
            >
              <RiDeleteBinLine size={15} aria-hidden="true" />
              {cleaningWorkspaces
                ? t("tasks.cleaningWorkspaces")
                : t("tasks.cleanupSafeWorkspaces")}
            </button>
          ) : null}
          <button
            className="task-button task-button-secondary"
            type="button"
            aria-expanded={showNotifications}
            onClick={() => setShowNotifications((value) => !value)}
          >
            <RiNotification3Line size={15} aria-hidden="true" />
            {t("tasks.notifications", {
              count: notifications.filter(({ appReadAt }) => appReadAt === null)
                .length,
            })}
          </button>
          <button
            className="task-button task-button-primary"
            type="button"
            onClick={() => setCreating(true)}
          >
            <RiAddLine size={16} aria-hidden="true" />
            {t("tasks.new")}
          </button>
        </div>
      </header>
      {cleanupResult ? (
        <p className="task-page-message" role="status">
          {cleanupResult}
        </p>
      ) : null}
      {showNotifications ? (
        <section
          className="task-notifications"
          aria-label={t("tasks.notificationsHeading")}
        >
          {notifications.length === 0 ? (
            <p>{t("tasks.notificationsEmpty")}</p>
          ) : (
            <ul>
              {notifications.map((notification) => (
                <li
                  key={`${notification.taskId}:${notification.runId ?? ""}:${notification.kind}`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      void api.notificationMarkRead(
                        notification.taskId,
                        notification.runId,
                        notification.kind,
                      );
                      setNotifications((items) =>
                        items.map((item) =>
                          item === notification
                            ? { ...item, appReadAt: Date.now() }
                            : item,
                        ),
                      );
                      void open(notification.taskId);
                    }}
                  >
                    {t("tasks.notificationItem", {
                      kind: t(
                        notification.kind === "needs_review"
                          ? "tasks.notification.needsReview"
                          : notification.kind === "awaiting_report"
                            ? "tasks.notification.awaitingReport"
                            : "tasks.notification.failed",
                      ),
                    })}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {notificationCursor ? (
            <button
              className="task-button task-button-secondary"
              type="button"
              disabled={loadingNotifications}
              onClick={() => {
                setLoadingNotifications(true);
                void api
                  .notificationsList({
                    limit: 50,
                    cursor: notificationCursor,
                  })
                  .then((page) => {
                    setNotifications((items) => [
                      ...items,
                      ...page.items.filter(
                        (candidate) =>
                          !items.some(
                            (item) =>
                              item.taskId === candidate.taskId &&
                              item.runId === candidate.runId &&
                              item.kind === candidate.kind,
                          ),
                      ),
                    ]);
                    setNotificationCursor(page.nextCursor);
                  })
                  .finally(() => setLoadingNotifications(false));
              }}
            >
              {loadingNotifications
                ? t("tasks.loadingMore")
                : t("tasks.loadMoreNotifications")}
            </button>
          ) : null}
        </section>
      ) : null}
      <fieldset className="task-filters">
        <legend>{t("tasks.showStatuses")}</legend>
        {optionalStatuses.map((status) => (
          <label key={status}>
            <input
              type="checkbox"
              checked={store.statuses.includes(status)}
              onChange={(event) => {
                const statuses = event.target.checked
                  ? [...store.statuses, status]
                  : store.statuses.filter((item) => item !== status);
                store.setStatuses(
                  statuses.length ? statuses : DEFAULT_TASK_STATUSES,
                );
                void useTasksStore.getState().load(api);
              }}
            />
            {t(taskStatusKeys[status])}
          </label>
        ))}
      </fieldset>
      {store.loading ? (
        <p className="task-page-message" role="status">
          {t("tasks.loading")}
        </p>
      ) : null}
      {store.error ? (
        <p className="task-page-message task-page-error" role="alert">
          {store.error}
        </p>
      ) : null}
      {detailError ? (
        <p className="task-page-message task-page-error" role="alert">
          {detailError}
        </p>
      ) : null}
      {!store.loading && store.items.length === 0 ? (
        <div className="task-empty-state">
          <RiTaskLine size={24} aria-hidden="true" />
          <p>{t("tasks.empty")}</p>
        </div>
      ) : null}
      <ul className="task-list">
        {store.items.map((task) => (
          <li key={task.id}>
            <button
              className="task-list-item"
              type="button"
              onClick={() => void open(task.id)}
            >
              <span
                className={`task-status-dot task-status-${task.status}`}
                aria-hidden="true"
              />
              <span className="task-list-content">
                <strong>{task.title}</strong>
                <span className="task-list-meta">
                  <span>{task.projectName ?? task.projectId}</span>
                  <span aria-hidden="true">·</span>
                  <span className="task-list-workspace">
                    {task.workspace.mode === "new_managed"
                      ? task.workspace.baseRef
                      : task.workspace.worktreeId}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="task-list-metrics">
                    {t("tasks.metrics.summary", {
                      duration: formatTaskDuration(task.durationMs, language),
                      tokens: formatTaskTokens(task.tokenCount),
                    })}
                  </span>
                </span>
              </span>
              <span className={`task-status-badge task-status-${task.status}`}>
                {t(taskStatusKeys[task.status])}
              </span>
              <time dateTime={new Date(task.updatedAt).toISOString()}>
                {formatDateTime(task.updatedAt)}
              </time>
            </button>
          </li>
        ))}
      </ul>
      {store.nextCursor ? (
        <button
          className="task-button task-button-secondary task-load-more"
          type="button"
          disabled={store.loadingMore}
          onClick={() => void store.loadMore(api)}
        >
          {store.loadingMore ? t("tasks.loadingMore") : t("tasks.loadMore")}
        </button>
      ) : null}
    </main>
  );
}
