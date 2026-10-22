import { RiAddLine, RiNotification3Line, RiTaskLine } from "@remixicon/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { formatDateTime, useTranslation } from "../../i18n";
import { TaskDetail } from "./TaskDetail";
import { TaskForm, type TaskProjectOption } from "./TaskForm";
import type {
  TaskDetailValue,
  TaskNotificationValue,
  TasksApi,
} from "./tasksApi";
import { formatTaskDuration, formatTaskTokens } from "./taskMetrics";
import {
  boundedTaskQuery,
  taskErrorMessage,
  relativeTaskTime,
  taskDisplayStatus,
  taskStatusKeys,
} from "./taskPresentation";
import { newTaskDraftKey, readTaskDraft } from "./taskDrafts";
import { useTasksStore, type TaskListView } from "./tasksStore";

interface TaskPageProps {
  api: TasksApi;
  projects: TaskProjectOption[];
  preferredProjectId?: string;
  loadProject?: (projectId: string) => Promise<TaskProjectOption>;
  onOpenSession?: (
    worktreeId: string,
    sessionId: string,
  ) => void | Promise<void>;
  onOpenChanges?: (worktreeId: string) => void | Promise<void>;
}
export function TaskPage({
  api,
  projects,
  preferredProjectId,
  loadProject,
  onOpenSession,
  onOpenChanges,
}: TaskPageProps) {
  const { language, t } = useTranslation();
  const store = useTasksStore();
  const [, setClock] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) setClock((tick) => tick + 1);
    }, 60_000);
    return () => clearInterval(timer);
  }, []);
  const mainRef = useRef<HTMLElement>(null);
  const [creating, setCreating] = useState(
    () => !store.selectedTaskId && Boolean(readTaskDraft(newTaskDraftKey)),
  );
  const [editing, setEditing] = useState(() =>
    Boolean(store.selectedTaskId && readTaskDraft(store.selectedTaskId)),
  );
  const [detail, setDetail] = useState<TaskDetailValue | null>(null);
  const detailRef = useRef<TaskDetailValue | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const detailGeneration = useRef(0);
  const lastSelection = useRef(store.selectedTaskId);
  const detailRequest = useRef<{
    taskId: string;
    token: number;
    again: boolean;
  } | null>(null);
  const [search, setSearch] = useState(store.query);
  const [notifications, setNotifications] = useState<TaskNotificationValue[]>(
    [],
  );
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationCursor, setNotificationCursor] = useState<string | null>(
    null,
  );
  const [notificationError, setNotificationError] = useState<string | null>(
    null,
  );
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const notificationGeneration = useRef(0);
  const [cleaningWorkspaces, setCleaningWorkspaces] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);

  const refreshDetail = useCallback(
    async function fetchDetail(taskId: string): Promise<void> {
      if (detailRequest.current?.taskId === taskId) {
        detailRequest.current.again = true;
        return;
      }
      const token = ++detailGeneration.current;
      const request = { taskId, token, again: false };
      detailRequest.current = request;
      setLoadingDetail(true);
      setDetailError(null);
      try {
        const value = await api.get(taskId);
        if (
          detailGeneration.current !== token ||
          useTasksStore.getState().selectedTaskId !== taskId
        )
          return;
        if (
          detailRef.current?.id !== taskId ||
          detailRef.current.revision <= value.revision
        ) {
          detailRef.current = value;
          setDetail(value);
        }
      } catch (error) {
        if (detailGeneration.current === token)
          setDetailError(taskErrorMessage(error, t("tasks.openFailed")));
      } finally {
        if (detailRequest.current === request) {
          detailRequest.current = null;
          setLoadingDetail(false);
          if (
            request.again &&
            useTasksStore.getState().selectedTaskId === taskId
          )
            void fetchDetail(taskId);
        }
      }
    },
    [api, t],
  );

  const refreshNotifications = useCallback(
    async (cursor?: string) => {
      const token = ++notificationGeneration.current;
      setLoadingNotifications(true);
      setNotificationError(null);
      try {
        const page = await api.notificationsList({
          limit: 50,
          ...(cursor ? { cursor } : {}),
        });
        if (token !== notificationGeneration.current) return;
        setNotifications((items) =>
          cursor
            ? [
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
              ]
            : page.items,
        );
        setNotificationCursor(page.nextCursor);
        setUnreadCount(
          page.unreadCount ??
            page.items.filter((item) => item.appReadAt === null).length,
        );
      } catch (error) {
        if (token === notificationGeneration.current)
          setNotificationError(
            taskErrorMessage(error, t("tasks.notificationFailed")),
          );
      } finally {
        if (token === notificationGeneration.current)
          setLoadingNotifications(false);
      }
    },
    [api, t],
  );

  useEffect(() => {
    if (
      !useTasksStore.getState().items.length &&
      !useTasksStore.getState().loading
    )
      void useTasksStore.getState().load(api);
    void refreshNotifications();
    return api.subscribe((event) => {
      if (event.kind === "notification") void refreshNotifications();
      if (
        (event.kind === "changed" || event.kind === "notification") &&
        event.taskId === useTasksStore.getState().selectedTaskId
      )
        void refreshDetail(event.taskId!);
    });
  }, [api, refreshDetail, refreshNotifications]);
  useEffect(() => {
    const id = store.selectedTaskId;
    if (id && id !== lastSelection.current) {
      setCreating(false);
      setEditing(false);
    }
    lastSelection.current = id;
    if (!id) {
      detailGeneration.current++;
      detailRequest.current = null;
      detailRef.current = null;
      setDetail(null);
      setDetailError(null);
      return;
    }
    if (detailRef.current?.id !== id) {
      detailRef.current = null;
      setDetail(null);
      void refreshDetail(id);
    }
  }, [store.selectedTaskId, refreshDetail]);
  const selectedSummary = store.items.find(
    (item) => item.id === store.selectedTaskId,
  );
  useEffect(() => {
    if (
      selectedSummary &&
      detailRef.current?.id === selectedSummary.id &&
      selectedSummary.revision > detailRef.current.revision
    )
      void refreshDetail(selectedSummary.id);
  }, [selectedSummary?.revision, selectedSummary?.id, refreshDetail]);
  useEffect(() => {
    if (search === useTasksStore.getState().query) return;
    const timer = setTimeout(() => {
      useTasksStore.getState().setQuery(search);
      void useTasksStore.getState().load(api);
    }, 250);
    return () => clearTimeout(timer);
  }, [search, api]);
  useEffect(
    () => () => {
      detailGeneration.current++;
      notificationGeneration.current++;
      detailRequest.current = null;
    },
    [],
  );
  useLayoutEffect(() => {
    if (!creating && !editing && !store.selectedTaskId && mainRef.current)
      mainRef.current.scrollTop = useTasksStore.getState().scrollTop;
  }, [
    creating,
    editing,
    store.selectedTaskId,
    store.view,
    store.query,
    store.projectId,
  ]);

  const open = (taskId: string) => {
    setCreating(false);
    setEditing(false);
    store.selectTask(taskId);
  };
  const readNotification = async (notification: TaskNotificationValue) => {
    open(notification.taskId);
    try {
      await api.notificationMarkRead(
        notification.taskId,
        notification.runId,
        notification.kind,
      );
      setNotifications((items) =>
        items.map((item) =>
          item === notification ? { ...item, appReadAt: Date.now() } : item,
        ),
      );
      if (notification.appReadAt === null)
        setUnreadCount((count) => Math.max(0, count - 1));
    } catch (error) {
      setNotificationError(
        taskErrorMessage(error, t("tasks.notificationFailed")),
      );
    }
  };
  const markAllRead = async () => {
    setLoadingNotifications(true);
    try {
      await api.notificationsMarkAllRead();
      await refreshNotifications();
    } catch (error) {
      setNotificationError(
        taskErrorMessage(error, t("tasks.notificationFailed")),
      );
      setLoadingNotifications(false);
    }
  };
  const cleanup = async () => {
    const candidates = store.items.filter(
      (task) =>
        task.status === "completed" &&
        task.ownsManagedWorktree &&
        task.resolvedWorktreeId &&
        task.workspaceCleanupStatus !== "removed",
    );
    if (
      !candidates.length ||
      !window.confirm(
        t("tasks.bulkCleanupConfirm", { count: candidates.length }),
      )
    )
      return;
    setCleaningWorkspaces(true);
    setCleanupResult(null);
    let cleaned = 0;
    try {
      for (const task of candidates) {
        try {
          const result = await api.cleanupWorkspace(task.id, task.revision);
          if (result.workspaceCleanupStatus === "removed") cleaned++;
        } catch {
          /* Unsafe workspaces are retained. */
        }
      }
      setCleanupResult(
        t("tasks.cleanupResult", {
          cleaned,
          skipped: candidates.length - cleaned,
        }),
      );
      await store.invalidate(api);
    } finally {
      setCleaningWorkspaces(false);
    }
  };
  const projectOptions = new Map(
    projects.map((project) => [project.id, project.name]),
  );
  store.items.forEach((task) => {
    if (!projectOptions.has(task.projectId))
      projectOptions.set(
        task.projectId,
        task.projectName ?? t("tasks.projectUnavailable"),
      );
  });
  const selectedDetail = detail?.id === store.selectedTaskId ? detail : null;
  const isList = !creating && !editing && !store.selectedTaskId;
  return (
    <main
      className="task-page"
      ref={mainRef}
      onScroll={(event) => {
        if (isList)
          useTasksStore.getState().setScrollTop(event.currentTarget.scrollTop);
      }}
    >
      <div className="task-page-content">
        {notificationError ? (
          <p className="task-page-message task-page-error" role="alert">
            {notificationError}{" "}
            <button
              className="task-button task-button-secondary"
              type="button"
              onClick={() => void refreshNotifications()}
            >
              {t("tasks.retry")}
            </button>
          </p>
        ) : null}
        {(creating && !store.selectedTaskId) || (editing && selectedDetail) ? (
          <TaskForm
            key={editing ? selectedDetail?.id : "new"}
            api={api}
            projects={projects}
            task={editing ? (selectedDetail ?? undefined) : undefined}
            preferredProjectId={preferredProjectId}
            loadProject={loadProject}
            onCancel={() => {
              setCreating(false);
              setEditing(false);
            }}
            onCreated={(value) => {
              detailRef.current = value;
              setDetail(value);
              setCreating(false);
              setEditing(false);
              store.selectTask(value.id);
              void store.invalidate(api);
            }}
          />
        ) : store.selectedTaskId ? (
          <>
            {detailError ? (
              <p className="task-page-message task-page-error" role="alert">
                {detailError}{" "}
                <button
                  className="task-button task-button-secondary"
                  type="button"
                  onClick={() => void refreshDetail(store.selectedTaskId!)}
                >
                  {t("tasks.retry")}
                </button>
              </p>
            ) : null}
            {loadingDetail ? (
              <p className="task-refresh-indicator" role="status">
                {t(detail ? "tasks.refreshing" : "tasks.loading")}
              </p>
            ) : null}
            {selectedDetail ? (
              <TaskDetail
                key={selectedDetail.id}
                api={api}
                task={selectedDetail}
                onChange={(value) => {
                  if (useTasksStore.getState().selectedTaskId !== value.id) {
                    void store.invalidate(api, value.id, value.revision);
                    return;
                  }
                  if (
                    detailRef.current?.id === value.id &&
                    value.revision < detailRef.current.revision
                  )
                    return;
                  detailRef.current = value;
                  setDetail(value);
                  void store.invalidate(api);
                }}
                onEdit={() => setEditing(true)}
                onBack={() => {
                  store.selectTask(null);
                  setEditing(false);
                }}
                onOpenSession={onOpenSession}
                onOpenChanges={onOpenChanges}
              />
            ) : (
              <button
                className="task-button task-button-secondary"
                type="button"
                onClick={() => store.selectTask(null)}
              >
                {t("tasks.back")}
              </button>
            )}
          </>
        ) : (
          <>
            <header className="task-page-header">
              <div className="task-page-heading">
                <span className="task-page-heading-icon" aria-hidden="true">
                  <RiTaskLine size={18} />
                </span>
                <h1>{t("tasks.heading")}</h1>
              </div>
              <div className="task-page-actions">
                <details
                  className="task-more-menu"
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      event.currentTarget.open = false;
                      event.currentTarget.querySelector("summary")?.focus();
                    }
                  }}
                >
                  <summary className="task-button task-button-secondary">
                    {t("tasks.more")}
                  </summary>
                  <button
                    className="task-button task-button-secondary"
                    type="button"
                    disabled={
                      cleaningWorkspaces ||
                      store.loading ||
                      store.refreshing ||
                      !store.items.some(
                        (task) =>
                          task.status === "completed" &&
                          task.ownsManagedWorktree &&
                          task.resolvedWorktreeId &&
                          task.workspaceCleanupStatus !== "removed",
                      )
                    }
                    onClick={() => void cleanup()}
                  >
                    {t(
                      cleaningWorkspaces
                        ? "tasks.cleaningWorkspaces"
                        : "tasks.cleanupSafeWorkspaces",
                    )}
                  </button>
                </details>
                <button
                  className="task-button task-button-secondary"
                  type="button"
                  aria-expanded={showNotifications}
                  onClick={() => setShowNotifications((value) => !value)}
                >
                  <RiNotification3Line size={15} aria-hidden="true" />
                  {t("tasks.notifications", { count: unreadCount })}
                </button>
                <button
                  className="task-button task-button-primary"
                  type="button"
                  onClick={() => {
                    store.selectTask(null);
                    setCreating(true);
                  }}
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
                <div className="task-notifications-heading">
                  <h3>{t("tasks.notificationsHeading")}</h3>
                  <button
                    className="task-button task-button-quiet"
                    type="button"
                    disabled={loadingNotifications || !unreadCount}
                    onClick={() => void markAllRead()}
                  >
                    {t("tasks.markAllRead")}
                  </button>
                </div>
                {loadingNotifications ? (
                  <p role="status">{t("tasks.loading")}</p>
                ) : null}
                {!notifications.length && !loadingNotifications ? (
                  <p>{t("tasks.notificationsEmpty")}</p>
                ) : null}
                <ul>
                  {notifications.map((notification) => (
                    <li
                      className={
                        notification.appReadAt === null
                          ? "task-notification-unread"
                          : ""
                      }
                      key={`${notification.taskId}:${notification.runId ?? ""}:${notification.kind}`}
                    >
                      <button
                        type="button"
                        onClick={() => void readNotification(notification)}
                      >
                        <strong>
                          {notification.taskTitle ??
                            t("tasks.notificationUntitled")}
                        </strong>{" "}
                        <span>
                          {notification.projectName ??
                            t("tasks.projectUnavailable")}{" "}
                          ·{" "}
                          {t(
                            notification.kind === "needs_review"
                              ? "tasks.notification.needsReview"
                              : notification.kind === "awaiting_report"
                                ? "tasks.notification.awaitingReport"
                                : "tasks.notification.failed",
                          )}{" "}
                          ·{" "}
                          <time
                            title={formatDateTime(notification.createdAt)}
                            dateTime={new Date(
                              notification.createdAt,
                            ).toISOString()}
                          >
                            {relativeTaskTime(notification.createdAt, language)}
                          </time>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {notificationCursor ? (
                  <button
                    className="task-button task-button-secondary"
                    type="button"
                    disabled={loadingNotifications}
                    onClick={() =>
                      void refreshNotifications(notificationCursor)
                    }
                  >
                    {t("tasks.loadMoreNotifications")}
                  </button>
                ) : null}
              </section>
            ) : null}
            <div className="task-list-toolbar">
              <div
                className="task-view-switcher"
                role="group"
                aria-label={t("tasks.listView")}
              >
                {(
                  ["attention", "active", "completed", "all"] as TaskListView[]
                ).map((view) => (
                  <button
                    type="button"
                    key={view}
                    aria-pressed={store.view === view}
                    onClick={() => {
                      store.setView(view);
                      void useTasksStore.getState().load(api);
                    }}
                  >
                    {t(`tasks.view.${view}`)}
                  </button>
                ))}
              </div>
              <div className="task-list-search">
                <input
                  type="search"
                  aria-label={t("tasks.search")}
                  placeholder={t("tasks.search")}
                  value={search}
                  maxLength={256}
                  onChange={(event) =>
                    setSearch(boundedTaskQuery(event.target.value))
                  }
                />
                <select
                  aria-label={t("tasks.filterProject")}
                  value={store.projectId}
                  onChange={(event) => {
                    store.setProject(event.target.value);
                    void useTasksStore.getState().load(api);
                  }}
                >
                  <option value="">{t("tasks.allProjects")}</option>
                  {Array.from(projectOptions).map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {store.loading ? (
              <p className="task-refresh-indicator" role="status">
                {t("tasks.loading")}
              </p>
            ) : null}
            {store.error ? (
              <p className="task-page-message task-page-error" role="alert">
                {store.error}
                <button
                  className="task-button task-button-secondary"
                  type="button"
                  onClick={() => void store.load(api)}
                >
                  {t("tasks.retry")}
                </button>
              </p>
            ) : null}
            {!store.loading && !store.items.length ? (
              <div className="task-empty-state">
                <RiTaskLine size={24} aria-hidden="true" />
                <p>
                  {t(
                    store.query || store.projectId
                      ? "tasks.noMatches"
                      : "tasks.empty",
                  )}
                </p>
              </div>
            ) : null}
            <ul className="task-list">
              {store.items.map((task) => {
                const status = taskDisplayStatus(task);
                const workspace =
                  task.workspaceName ??
                  (task.workspace.mode === "new_managed"
                    ? t("tasks.fromBranch", { branch: task.workspace.baseRef })
                    : t("tasks.workspaceUnavailable"));
                return (
                  <li key={task.id}>
                    <button
                      className="task-list-item"
                      type="button"
                      onClick={() => open(task.id)}
                    >
                      <span
                        className={`task-status-dot task-status-${status}`}
                        aria-hidden="true"
                      />
                      <span className="task-list-content">
                        <strong title={task.title}>{task.title}</strong>{" "}
                        <span className="task-list-meta">
                          <span>
                            {task.projectName ?? t("tasks.projectUnavailable")}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span
                            className="task-list-workspace"
                            title={workspace}
                          >
                            {workspace}
                          </span>
                        </span>
                        <span className="task-list-metrics">
                          {t("tasks.metrics.summary", {
                            duration: formatTaskDuration(
                              task.durationMs,
                              language,
                            ),
                            tokens: formatTaskTokens(task.tokenCount),
                          })}
                        </span>
                      </span>
                      <span
                        className={`task-status-badge task-status-${status}`}
                      >
                        {t(taskStatusKeys[status])}
                      </span>
                      <time
                        dateTime={new Date(task.updatedAt).toISOString()}
                        title={formatDateTime(task.updatedAt)}
                      >
                        {relativeTaskTime(task.updatedAt, language)}
                      </time>
                    </button>
                  </li>
                );
              })}
            </ul>
            {store.nextCursor ? (
              <button
                className="task-button task-button-secondary task-load-more"
                type="button"
                disabled={store.loadingMore || store.refreshing}
                onClick={() => void store.loadMore(api)}
              >
                {t(store.loadingMore ? "tasks.loadingMore" : "tasks.loadMore")}
              </button>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
