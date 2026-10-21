import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useTranslation } from "../../i18n";
import type { ChatApi } from "./chatApi";
import { toChatError } from "./sessionReducer";
import type { ChatError, ChatSessionSummary } from "./types";

export function SessionRenameDialog({
  session,
  api,
  onRenamed,
  onOpenChange,
}: {
  session: ChatSessionSummary | null;
  api: ChatApi;
  onRenamed: (session: ChatSessionSummary) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const currentSessionRef = useRef(session);
  currentSessionRef.current = session;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    setTitle(session.title);
    setPending(false);
    setError(null);
  }, [session]);

  const submit = async () => {
    const normalized = title.trim();
    if (!session || !normalized || pending) return;
    const target = session;
    setPending(true);
    setError(null);
    try {
      const renamed = await api.rename(
        target.worktreeId,
        target.sessionId,
        normalized,
      );
      if (
        !mountedRef.current ||
        currentSessionRef.current?.sessionId !== target.sessionId ||
        currentSessionRef.current.worktreeId !== target.worktreeId
      )
        return;
      onRenamed(renamed);
      onOpenChange(false);
    } catch (caught: unknown) {
      if (mountedRef.current && currentSessionRef.current === target)
        setError(toChatError(caught));
    } finally {
      if (mountedRef.current && currentSessionRef.current === target)
        setPending(false);
    }
  };

  return (
    <Dialog.Root
      open={session !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onOpenChange(false);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="chat-dialog-overlay" />
        <Dialog.Content
          className="chat-session-dialog"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
            inputRef.current?.select();
          }}
        >
          <Dialog.Title>{t("chat.rename.title")}</Dialog.Title>
          <Dialog.Description>
            {t("chat.rename.description")}
          </Dialog.Description>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label htmlFor="chat-session-title">{t("chat.rename.label")}</label>
            <input
              ref={inputRef}
              id="chat-session-title"
              value={title}
              disabled={pending}
              aria-invalid={error ? "true" : undefined}
              onChange={(event) => setTitle(event.target.value)}
            />
            {error && (
              <div className="chat-dialog-error" role="alert">
                {error.message}
              </div>
            )}
            <div className="chat-dialog-actions">
              <Dialog.Close asChild>
                <button type="button" disabled={pending}>
                  {t("common.cancel")}
                </button>
              </Dialog.Close>
              <button
                type="submit"
                className="primary"
                disabled={pending || title.trim().length === 0}
              >
                {t(pending ? "chat.rename.renaming" : "chat.rename.action")}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
