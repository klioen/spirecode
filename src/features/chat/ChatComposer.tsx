import { RiSendPlane2Fill, RiStopMiniFill } from "@remixicon/react";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type {
  ChatQueuedInput,
  ChatSessionConfig,
  ChatSlashCommand,
  ChatThinkingLevel,
} from "./types";

const MAX_INPUT_BYTES = 64 * 1024;
const MAX_TEXTAREA_HEIGHT = 240;
const encoder = new TextEncoder();
const THINKING_LABELS: Record<ChatThinkingLevel, string> = {
  off: "Off",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "XHigh",
  max: "Max",
};

export interface ChatComposerProps {
  running: boolean;
  queue?: ChatQueuedInput[];
  disabled?: boolean;
  initialValue?: string;
  config?: ChatSessionConfig;
  onModelChange?: (provider: string, modelId: string) => Promise<void>;
  onThinkingLevelChange?: (level: ChatThinkingLevel) => Promise<void>;
  onSend: (text: string) => Promise<void>;
  onStop: () => Promise<string[] | void>;
}

function groupModelsByProvider(models: ChatSessionConfig["models"]) {
  const groups = new Map<string, ChatSessionConfig["models"]>();
  for (const model of models) {
    const providerModels = groups.get(model.provider);
    if (providerModels) {
      providerModels.push(model);
    } else {
      groups.set(model.provider, [model]);
    }
  }
  return Array.from(groups, ([provider, providerModels]) => ({
    provider,
    models: providerModels,
  }));
}

function commandQuery(value: string): string | undefined {
  return /^\/[^\s/]*$/.test(value) ? value.slice(1).toLowerCase() : undefined;
}

function matchingCommands(
  commands: ChatSlashCommand[],
  query: string | undefined,
): ChatSlashCommand[] {
  if (query === undefined) return [];
  return commands
    .filter((command) => command.name.toLowerCase().includes(query))
    .sort((left, right) => {
      const leftPrefix = left.name.toLowerCase().startsWith(query) ? 0 : 1;
      const rightPrefix = right.name.toLowerCase().startsWith(query) ? 0 : 1;
      return leftPrefix - rightPrefix || left.name.localeCompare(right.name);
    });
}

export function ChatComposer({
  running,
  queue = [],
  disabled = false,
  initialValue = "",
  config,
  onModelChange,
  onThinkingLevelChange,
  onSend,
  onStop,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(initialValue);
  const [composing, setComposing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCommand, setActiveCommand] = useState(0);
  const byteLength = encoder.encode(value).byteLength;
  const tooLarge = byteLength > MAX_INPUT_BYTES;
  const hasDraft = Boolean(value.trim());
  const sendDisabled = disabled || pending || tooLarge || !hasDraft;
  const controlsDisabled = disabled || running || pending || !config;
  const showStop = running && !hasDraft;
  const commands = useMemo(
    () => matchingCommands(config?.commands ?? [], commandQuery(value)),
    [config?.commands, value],
  );
  const modelGroups = useMemo(
    () => groupModelsByProvider(config?.models ?? []),
    [config?.models],
  );

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > MAX_TEXTAREA_HEIGHT ? "auto" : "hidden";
  }, [value]);

  const runMutation = async (mutation: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await mutation();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPending(false);
    }
  };

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

  const completeCommand = (command: ChatSlashCommand) => {
    setValue(`/${command.name} `);
    setActiveCommand(0);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (composing) return;
    if (commands.length > 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setActiveCommand(
          (current) =>
            (current + direction + commands.length) % commands.length,
        );
        return;
      }
      if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
        event.preventDefault();
        completeCommand(commands[Math.min(activeCommand, commands.length - 1)]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setValue(`${value} `);
        return;
      }
    }
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void submit();
  };

  const actionLabel = running ? "Follow up" : "Send";
  const modelValue = config?.model
    ? `${config.model.provider}/${config.model.id}`
    : "";

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
        {commands.length > 0 && (
          <div
            id="chat-slash-commands"
            className="chat-slash-menu"
            role="listbox"
            aria-label="Slash commands"
          >
            {commands.map((command, index) => (
              <button
                key={`${command.source}:${command.name}`}
                type="button"
                role="option"
                aria-selected={index === activeCommand}
                className={index === activeCommand ? "active" : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => completeCommand(command)}
              >
                <span className="chat-slash-name">/{command.name}</span>
                {command.argumentHint && (
                  <span className="chat-slash-hint">
                    {command.argumentHint}
                  </span>
                )}
                {command.description && (
                  <span className="chat-slash-description">
                    {command.description}
                  </span>
                )}
                <span className="chat-slash-source">{command.source}</span>
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          aria-label="Chat message"
          aria-autocomplete="list"
          aria-controls={
            commands.length > 0 ? "chat-slash-commands" : undefined
          }
          value={value}
          disabled={disabled}
          rows={1}
          placeholder="随心输入"
          onChange={(event) => {
            setValue(event.target.value);
            setActiveCommand(0);
          }}
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
          <div className="chat-composer-config">
            <select
              aria-label="Model"
              value={modelValue}
              disabled={controlsDisabled}
              onChange={(event) => {
                const separator = event.target.value.indexOf("/");
                if (separator < 1 || !onModelChange) return;
                void runMutation(() =>
                  onModelChange(
                    event.target.value.slice(0, separator),
                    event.target.value.slice(separator + 1),
                  ),
                );
              }}
            >
              {!modelValue && <option value="">No model</option>}
              {modelGroups.map((group) => (
                <optgroup key={group.provider} label={group.provider}>
                  {group.models.map((model) => (
                    <option
                      key={`${model.provider}/${model.id}`}
                      value={`${model.provider}/${model.id}`}
                    >
                      {model.label.trim() || model.id}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <select
              aria-label="Thinking level"
              value={config?.thinkingLevel ?? "off"}
              disabled={controlsDisabled}
              onChange={(event) => {
                if (!onThinkingLevelChange) return;
                void runMutation(() =>
                  onThinkingLevelChange(
                    event.target.value as ChatThinkingLevel,
                  ),
                );
              }}
            >
              {(config?.availableThinkingLevels ?? ["off"]).map((level) => (
                <option key={level} value={level}>
                  {THINKING_LABELS[level]}
                </option>
              ))}
            </select>
          </div>
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
