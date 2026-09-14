import { useState, type KeyboardEvent } from "react";
import type { ChatQueuedInput } from "./types";

const MAX_INPUT_BYTES = 64 * 1024;
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
  const [value, setValue] = useState(initialValue);
  const [composing, setComposing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const byteLength = encoder.encode(value).byteLength;
  const tooLarge = byteLength > MAX_INPUT_BYTES;
  const sendDisabled = disabled || pending || tooLarge || !value.trim();

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

  return (
    <div className="chat-composer">
      {queue.length > 0 && (
        <div className="chat-queue" aria-label="Queued follow-ups">
          {queue.map((entry) => (
            <div key={entry.id}>{entry.text}</div>
          ))}
        </div>
      )}
      <textarea
        aria-label="Chat message"
        value={value}
        disabled={disabled}
        rows={3}
        placeholder={running ? "Queue a follow-up…" : "Ask pi…"}
        onChange={(event) => setValue(event.target.value)}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => setComposing(false)}
        onKeyDown={onKeyDown}
      />
      {tooLarge && (
        <div role="alert">Message exceeds the 64 KiB UTF-8 limit.</div>
      )}
      {error && <div role="alert">{error}</div>}
      <div className="chat-composer-actions">
        <span>{byteLength.toLocaleString()} / 65,536 bytes</span>
        {running && (
          <button type="button" disabled={pending} onClick={() => void stop()}>
            Stop
          </button>
        )}
        <button
          type="button"
          disabled={sendDisabled}
          onClick={() => void submit()}
        >
          {running ? "Follow up" : "Send"}
        </button>
      </div>
    </div>
  );
}
