import * as Dialog from "@radix-ui/react-dialog";
import { useMemo, useRef } from "react";
import { useTranslation } from "../../i18n";
import { useEditorStore } from "../editor/editorStore";
import type { ProjectedChange } from "./changesProjection";

export function DiscardChangesDialog({
  worktreeId,
  rows,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  worktreeId: string;
  rows: ProjectedChange[];
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const untracked = rows.every(({ section }) => section === "untracked");
  const dirtyCount = useMemo(
    () =>
      rows.reduce(
        (count, { change }) =>
          count +
          useEditorStore.getState().inspectPath(worktreeId, change.path, "file")
            .dirtyFileTabIds.length,
        0,
      ),
    [rows, worktreeId],
  );
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="chat-delete-overlay" />
        <Dialog.Content
          className="chat-delete-dialog"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            confirmRef.current?.focus();
          }}
        >
          <Dialog.Title>
            {t(untracked ? "changes.deleteTitle" : "changes.discardTitle")}
          </Dialog.Title>
          <Dialog.Description>
            {t(
              rows.length === 1
                ? untracked
                  ? "changes.deleteDescription.one"
                  : "changes.discardDescription.one"
                : untracked
                  ? "changes.deleteDescription.other"
                  : "changes.discardDescription.other",
              {
                count: rows.length,
                path: rows[0]?.change.path ?? "",
              },
            )}
          </Dialog.Description>
          {dirtyCount > 0 && (
            <p className="files-dirty-warning">
              {t("changes.discardDirty", { count: dirtyCount })}
            </p>
          )}
          {error && (
            <div className="chat-delete-error" role="alert">
              {error}
            </div>
          )}
          <div className="chat-delete-actions">
            <Dialog.Close asChild>
              <button disabled={pending}>{t("common.cancel")}</button>
            </Dialog.Close>
            <button
              ref={confirmRef}
              className="danger"
              disabled={pending}
              onClick={onConfirm}
            >
              {pending
                ? t("changes.operationPending")
                : t(untracked ? "changes.delete" : "changes.discard")}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
