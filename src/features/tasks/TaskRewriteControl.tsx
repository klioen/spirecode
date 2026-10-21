import { RiSparkling2Line } from "@remixicon/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "../../i18n";
import type { TaskRewriteInput, TasksApi } from "./tasksApi";

interface TaskRewriteControlProps {
  api: TasksApi;
  value: TaskRewriteInput;
  onApply: (value: TaskRewriteInput) => void;
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
  labels,
}: TaskRewriteControlProps) {
  const { t } = useTranslation();
  const [rewriteId, setRewriteId] = useState<string | null>(null);
  const [result, setResult] = useState<TaskRewriteInput | null>(null);
  const [undoValue, setUndoValue] = useState<TaskRewriteInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rewriteIdRef = useRef(rewriteId);
  rewriteIdRef.current = rewriteId;

  useEffect(() => {
    const unsubscribe = api.subscribe((event) => {
      if (
        event.kind === "rewrite_result" &&
        event.rewriteId === rewriteIdRef.current
      ) {
        rewriteIdRef.current = null;
        setResult(event.payload);
        setRewriteId(null);
      }
      if (
        event.kind === "rewrite_failed" &&
        event.rewriteId === rewriteIdRef.current
      ) {
        rewriteIdRef.current = null;
        setError(event.payload?.message ?? t("tasks.rewrite.failed"));
        setRewriteId(null);
      }
    });
    return () => {
      unsubscribe();
      if (rewriteIdRef.current) {
        void api.rewriteAbort(rewriteIdRef.current);
      }
    };
  }, [api, t]);

  const start = async () => {
    setError(null);
    setResult(null);
    const requestedRewriteId = crypto.randomUUID();
    rewriteIdRef.current = requestedRewriteId;
    setRewriteId(requestedRewriteId);
    try {
      const started = await api.rewriteStart(value, requestedRewriteId);
      if (rewriteIdRef.current === requestedRewriteId) {
        rewriteIdRef.current = started.rewriteId;
        setRewriteId(started.rewriteId);
      }
    } catch (caught) {
      if (rewriteIdRef.current === requestedRewriteId) {
        rewriteIdRef.current = null;
        setRewriteId(null);
      }
      setError(
        caught instanceof Error ? caught.message : t("tasks.rewrite.failed"),
      );
    }
  };

  const cancel = async () => {
    if (!rewriteId) return;
    rewriteIdRef.current = null;
    await api.rewriteAbort(rewriteId);
    setRewriteId(null);
  };

  return (
    <div className="task-rewrite-control">
      <button
        className="task-button task-button-quiet"
        type="button"
        onClick={() => void start()}
        disabled={rewriteId !== null}
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
      {result ? (
        <div role="group" aria-label={t("tasks.rewrite.suggestion")}>
          <p>{result.title}</p>
          <p>{result.description}</p>
          <button
            className="task-button task-button-primary"
            type="button"
            onClick={() => {
              setUndoValue(value);
              onApply(result);
              setResult(null);
            }}
          >
            {labels?.apply ?? t("tasks.rewrite.apply")}
          </button>
          <button
            className="task-button task-button-secondary"
            type="button"
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
