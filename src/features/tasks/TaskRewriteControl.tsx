import { RiSparkling2Line } from "@remixicon/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "../../i18n";
import type { TaskRewriteInput, TasksApi } from "./tasksApi";
interface TaskRewriteControlProps {
  api: TasksApi;
  value: TaskRewriteInput;
  onApply: (value: TaskRewriteInput) => void;
  disabled?: boolean;
  labels?: Partial<{
    optimize: string;
    cancel: string;
    apply: string;
    reject: string;
    undo: string;
    pending: string;
  }>;
}
export function TaskRewriteControl({
  api,
  value,
  onApply,
  disabled = false,
  labels,
}: TaskRewriteControlProps) {
  const { t } = useTranslation();
  const [rewriteId, setRewriteId] = useState<string | null>(null);
  const [source, setSource] = useState<TaskRewriteInput | null>(null);
  const [result, setResult] = useState<TaskRewriteInput | null>(null);
  const [undoValue, setUndoValue] = useState<TaskRewriteInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rewriteIdRef = useRef<string | null>(null);
  const stale = Boolean(
    source &&
    (source.title !== value.title || source.description !== value.description),
  );
  useEffect(() => {
    const unsubscribe = api.subscribe((event) => {
      if (
        (event.kind === "rewrite_result" || event.kind === "rewrite_failed") &&
        event.rewriteId === rewriteIdRef.current
      ) {
        rewriteIdRef.current = null;
        setRewriteId(null);
        if (event.kind === "rewrite_result") setResult(event.payload);
        else setError(event.payload?.message ?? t("tasks.rewrite.failed"));
      }
    });
    return () => {
      unsubscribe();
      if (rewriteIdRef.current)
        void api.rewriteAbort(rewriteIdRef.current).catch(() => undefined);
    };
  }, [api, t]);
  const start = async () => {
    if (disabled || rewriteIdRef.current) return;
    setError(null);
    setResult(null);
    setSource({ ...value });
    const id = crypto.randomUUID();
    rewriteIdRef.current = id;
    setRewriteId(id);
    try {
      const started = await api.rewriteStart(value, id);
      if (rewriteIdRef.current === id) {
        rewriteIdRef.current = started.rewriteId;
        setRewriteId(started.rewriteId);
      }
    } catch (caught) {
      if (rewriteIdRef.current === id) {
        rewriteIdRef.current = null;
        setRewriteId(null);
      }
      setError(
        caught instanceof Error ? caught.message : t("tasks.rewrite.failed"),
      );
    }
  };
  const cancel = async () => {
    const id = rewriteIdRef.current;
    if (!id) return;
    rewriteIdRef.current = null;
    setRewriteId(null);
    try {
      await api.rewriteAbort(id);
    } catch {
      setError(t("tasks.rewrite.failed"));
    }
  };
  return (
    <div className="task-rewrite-control">
      <button
        className="task-button task-button-quiet"
        type="button"
        disabled={disabled || rewriteId !== null}
        onClick={() => void start()}
      >
        <RiSparkling2Line size={14} aria-hidden="true" />
        {labels?.optimize ?? t("tasks.rewrite.optimize")}
      </button>
      {rewriteId ? (
        <>
          <span role="status">
            {labels?.pending ?? t("tasks.rewrite.pending")}
          </span>
          <button
            className="task-button task-button-secondary"
            type="button"
            onClick={() => void cancel()}
          >
            {labels?.cancel ?? t("tasks.rewrite.cancel")}
          </button>
        </>
      ) : null}
      {result && source ? (
        <div role="group" aria-label={t("tasks.rewrite.suggestion")}>
          <div className="task-rewrite-comparison">
            <section>
              <h3>{t("tasks.rewrite.original")}</h3>
              <strong>{source.title}</strong>
              <p>{source.description}</p>
            </section>
            <section>
              <h3>{t("tasks.rewrite.suggested")}</h3>
              <strong>{result.title}</strong>
              <p>{result.description}</p>
            </section>
          </div>
          {stale ? <p role="status">{t("tasks.rewrite.stale")}</p> : null}
          <button
            className="task-button task-button-primary"
            type="button"
            disabled={disabled || stale}
            onClick={() => {
              setUndoValue({ ...value });
              onApply(result);
              setResult(null);
            }}
          >
            {labels?.apply ?? t("tasks.rewrite.apply")}
          </button>
          <button
            className="task-button task-button-secondary"
            type="button"
            disabled={disabled}
            onClick={() => setResult(null)}
          >
            {labels?.reject ?? t("tasks.rewrite.reject")}
          </button>
        </div>
      ) : null}
      {undoValue ? (
        <button
          className="task-button task-button-secondary"
          type="button"
          disabled={disabled}
          onClick={() => {
            onApply(undoValue);
            setUndoValue(null);
          }}
        >
          {labels?.undo ?? t("tasks.rewrite.undo")}
        </button>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
