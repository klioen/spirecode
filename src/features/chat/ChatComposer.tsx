import { RiSendPlane2Fill, RiStopMiniFill } from "@remixicon/react";
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ChatQueuedInput } from "./types";

const MAX_INPUT_BYTES = 64 * 1024;
const MAX_TEXTAREA_HEIGHT = 240;
const encoder = new TextEncoder();

export interface ChatComposerProps {
  running: boolean;
  queue?: ChatQueuedInput[];
  disabled?: boolean;
  initialValue?: string;
  onSend: (text: string) => Promise<void>;
  onStop: () => Promise<string[] | void>;
}

export function ChatComposer({
  running,
  queue = [],
  disabled = false,
  initialValue = "",
  onSend,
  onStop,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(initialValue);
  const [composing, setComposing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const byteLength = encoder.encode(value).byteLength;
  const tooLarge = byteLength > MAX_INPUT_BYTES;
  const hasDraft = Boolean(value.trim());
  const sendDisabled = disabled || pending || tooLarge || !hasDraft;
  const showStop = running && !hasDraft;

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > MAX_TEXTAREA_HEIGHT ? "auto" : "hidden";
  }, [value]);

  const submit = async () => {
    const text = value;
    if (sendDisabled) return;
    setPending(true);
    setError(null);
    setValue("");
    try {
      await onSend(text);
    } catch (caught) {
      setValue(text);
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPending(false);
    }
  };

  const stop = async () => {
    setPending(true);
    setError(null);
    try {
      const restored = await onStop();
      if (restored?.length) setValue(restored.join("\n"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPending(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || composing) return;
    event.preventDefault();
    void submit();
  };

  const actionLabel = running ? "Follow up" : "Send";

  return (
    <div className="chat-composer-shell">
      {queue.length > 0 && (
        <div className="chat-queue" aria-label="Queued follow-ups">
          <span>待处理</span>
          {queue.map((entry) => (
            <div key={entry.id}>{entry.text}</div>
          ))}
        </div>
      )}
      <div className="chat-composer">
        <textarea
          ref={textareaRef}
          aria-label="Chat message"
          value={value}
          disabled={disabled}
          rows={1}
          placeholder={running ? "Queue a follow-up…" : "Ask pi…"}
          onChange={(event) => setValue(event.target.value)}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          onKeyDown={onKeyDown}
        />
        {tooLarge && (
          <div className="chat-composer-error" role="alert">
            Message exceeds the 64 KiB UTF-8 limit.
          </div>
        )}
        {error && (
          <div className="chat-composer-error" role="alert">
            {error}
          </div>
        )}
        <div className="chat-composer-actions">
          <span className="chat-composer-hint">
            Enter 发送 · Shift+Enter 换行
          </span>
          {(byteLength > MAX_INPUT_BYTES * 0.8 || tooLarge) && (
            <span className="chat-composer-count">
              {byteLength.toLocaleString()} / 65,536
            </span>
          )}
          {showStop && (
            <button
              className="chat-composer-submit chat-composer-stop"
              type="button"
              aria-label="Stop"
              title="Stop"
              disabled={pending || disabled}
              onClick={() => void stop()}
            >
              <RiStopMiniFill aria-hidden="true" />
            </button>
          )}
          {(!running || hasDraft) && (
            <button
              className="chat-composer-submit"
              type="button"
              aria-label={actionLabel}
              title={actionLabel}
              disabled={sendDisabled}
              onClick={() => void submit()}
            >
              <RiSendPlane2Fill aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
