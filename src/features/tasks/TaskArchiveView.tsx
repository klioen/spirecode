import { useCallback, useEffect, useRef, useState } from "react";
import { formatDateTime, formatNumber, useTranslation } from "../../i18n";
import type { TaskArchivePage, TasksApi } from "./tasksApi";
import { taskErrorMessage } from "./taskPresentation";

export function TaskArchiveView({
  api,
  taskId,
  runId,
  onClose,
}: {
  api: TasksApi;
  taskId: string;
  runId: string;
  onClose(): void;
}) {
  const { t } = useTranslation();
  const [page, setPage] = useState<TaskArchivePage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const load = useCallback(
    async (cursor?: string) => {
      const token = ++generation.current;
      setBusy(true);
      setError(null);
      try {
        const value = await api.archiveRead({
          taskId,
          runId,
          limit: 20,
          ...(cursor ? { cursor } : {}),
        });
        if (token !== generation.current) return;
        setPage((previous) =>
          cursor && previous
            ? { ...value, entries: [...previous.entries, ...value.entries] }
            : value,
        );
      } catch (caught) {
        if (token === generation.current)
          setError(taskErrorMessage(caught, t("tasks.archive.loadFailed")));
      } finally {
        if (token === generation.current) setBusy(false);
      }
    },
    [api, taskId, runId, t],
  );
  useEffect(() => {
    setPage(null);
    void load();
    return () => {
      generation.current++;
    };
  }, [load]);
  const reveal = async (relativePath?: string) => {
    const token = generation.current;
    setError(null);
    try {
      await api.archiveReveal(taskId, runId, relativePath);
    } catch (caught) {
      if (token === generation.current)
        setError(taskErrorMessage(caught, t("tasks.archive.loadFailed")));
    }
  };
  return (
    <section
      className="task-detail-section task-archive-view"
      aria-label={t("tasks.archive.heading")}
    >
      <div className="task-detail-actions">
        <h3>{t("tasks.archive.heading")}</h3>
        <button
          className="task-button task-button-quiet"
          type="button"
          onClick={onClose}
        >
          {t("tasks.archive.close")}
        </button>
      </div>
      <p>{t("tasks.archive.readOnly")}</p>
      {error ? (
        <p role="alert">
          {error}{" "}
          <button
            className="task-button task-button-secondary"
            disabled={busy}
            type="button"
            onClick={() => void load(page?.nextCursor ?? undefined)}
          >
            {t("tasks.retry")}
          </button>
        </p>
      ) : null}
      {busy ? <p role="status">{t("tasks.loading")}</p> : null}
      {page ? (
        <>
          <p>
            {t("tasks.archive.savedAt", {
              time: formatDateTime(page.archivedAt),
            })}
          </p>
          <button
            className="task-button task-button-secondary"
            type="button"
            onClick={() => void reveal()}
          >
            {t("tasks.archive.reveal")}
          </button>
          <ol className="task-archive-entries">
            {page.entries.map((entry) => (
              <li key={entry.id}>
                <details
                  open={entry.role === "user" || entry.role === "assistant"}
                >
                  <summary>{entry.role ?? entry.type}</summary>
                  <pre>{entry.text}</pre>
                  {entry.truncated ? (
                    <p>{t("tasks.archive.truncated")}</p>
                  ) : null}
                </details>
              </li>
            ))}
          </ol>
          {page.nextCursor ? (
            <button
              className="task-button task-button-secondary"
              disabled={busy}
              type="button"
              onClick={() => void load(page.nextCursor!)}
            >
              {t("tasks.archive.loadMore")}
            </button>
          ) : null}
          {page.artifacts.length ? (
            <>
              <h4>{t("tasks.archive.artifacts")}</h4>
              <ul>
                {page.artifacts.map((file) => (
                  <li key={file.relativePath}>
                    <button
                      className="task-button task-button-secondary"
                      type="button"
                      onClick={() => void reveal(file.relativePath)}
                    >
                      {t("tasks.archive.artifactLabel", {
                        path: file.relativePath,
                        size: formatNumber(file.size),
                      })}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
