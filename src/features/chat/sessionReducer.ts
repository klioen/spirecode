import type {
  ChatError,
  ChatNoticeFallback,
  ChatNoticeModel,
  ChatSessionEvent,
  ChatSessionState,
  ChatTimelineItem,
  ChatToolModel,
} from "./types";

export interface ChatReducerEvent {
  sequence: number;
  event: ChatSessionEvent;
}

export function createInitialChatState(
  sessionId: string,
  worktreeId: string,
  status: ChatSessionState["status"] = "loading",
): ChatSessionState {
  return {
    sessionId,
    worktreeId,
    sequence: 0,
    status,
    items: [],
    queue: [],
    activity: null,
    error: null,
  };
}

function upsertItem(
  items: ChatTimelineItem[],
  matches: (item: ChatTimelineItem) => boolean,
  item: ChatTimelineItem,
): ChatTimelineItem[] {
  const index = items.findIndex(matches);
  if (index < 0) return [...items, item];
  const next = [...items];
  next[index] = item;
  return next;
}

function updateTool(
  items: ChatTimelineItem[],
  toolCallId: string,
  update: (tool: ChatToolModel) => ChatToolModel,
): ChatTimelineItem[] {
  const current = items.find(
    (item): item is Extract<ChatTimelineItem, { type: "tool" }> =>
      item.type === "tool" && item.toolCallId === toolCallId,
  );
  if (!current) return items;
  return upsertItem(
    items,
    (item) => item.type === "tool" && item.toolCallId === toolCallId,
    { type: "tool", ...update(current) },
  );
}

function notice(
  items: ChatTimelineItem[],
  kind: ChatNoticeModel["kind"],
  text: string | undefined,
  fallback: ChatNoticeFallback | undefined,
  active: boolean,
): ChatTimelineItem[] {
  const id = `notice:${kind}`;
  return upsertItem(items, (item) => item.type === "notice" && item.id === id, {
    type: "notice",
    id,
    kind,
    text,
    fallback,
    active,
  });
}

export function sessionReducer(
  state: ChatSessionState,
  incoming: ChatReducerEvent,
): ChatSessionState {
  if (incoming.sequence <= state.sequence) return state;
  const next = { ...state, sequence: incoming.sequence };
  const event = incoming.event;

  switch (event.type) {
    case "agent_start":
      return { ...next, status: "streaming", error: null };
    case "agent_end":
      return next;
    case "agent_settled":
      return { ...next, status: "idle" };
    case "message_start":
    case "message_update":
    case "message_end": {
      const message =
        event.type === "message_end"
          ? { ...event.message, status: "complete" as const }
          : event.message;
      return {
        ...next,
        items: upsertItem(
          state.items,
          (item) => item.type === "message" && item.id === message.id,
          { type: "message", ...message },
        ),
      };
    }
    case "thinking_start":
    case "thinking_update":
    case "thinking_end": {
      const thinking =
        event.type === "thinking_end"
          ? { ...event.thinking, status: "complete" as const }
          : event.thinking;
      return {
        ...next,
        items: upsertItem(
          state.items,
          (item) => item.type === "thinking" && item.id === thinking.id,
          { type: "thinking", ...thinking },
        ),
      };
    }
    case "tool_execution_start":
      return {
        ...next,
        items: upsertItem(
          state.items,
          (item) =>
            item.type === "tool" && item.toolCallId === event.toolCallId,
          {
            type: "tool",
            toolCallId: event.toolCallId,
            name: event.toolName,
            arguments: event.arguments,
            status: "running",
          },
        ),
      };
    case "tool_execution_update":
      return {
        ...next,
        items: updateTool(state.items, event.toolCallId, (tool) => ({
          ...tool,
          result: event.partialResult,
        })),
      };
    case "tool_execution_end":
      return {
        ...next,
        items: updateTool(state.items, event.toolCallId, (tool) => ({
          ...tool,
          result: event.result,
          error: event.error,
          status: event.error ? "error" : "done",
        })),
      };
    case "todo_update":
      return {
        ...next,
        items: upsertItem(
          state.items,
          (item) => item.type === "todo" && item.id === event.todo.id,
          { type: "todo", ...event.todo },
        ),
      };
    case "queue_update":
      return { ...next, queue: [...event.queue] };
    case "extension_status":
      return { ...next, activity: event.message ?? null };
    case "compaction_start":
      return {
        ...next,
        items: notice(
          state.items,
          "compaction",
          event.message,
          event.message ? undefined : "compaction-start",
          true,
        ),
      };
    case "compaction_end":
      return {
        ...next,
        items: notice(
          state.items,
          "compaction",
          event.message,
          event.message ? undefined : "compaction-end",
          false,
        ),
      };
    case "auto_retry_start":
      return {
        ...next,
        items: notice(
          state.items,
          "retry",
          event.message,
          event.message ? undefined : "retry-start",
          true,
        ),
      };
    case "auto_retry_end":
      return {
        ...next,
        items: notice(
          state.items,
          "retry",
          event.message,
          event.message ? undefined : "retry-end",
          false,
        ),
      };
    case "session_error": {
      const status =
        event.error.code === "CHAT_AUTH_REQUIRED" ? "auth-required" : "failed";
      return {
        ...next,
        status,
        error: event.error,
        items: notice(
          state.items,
          "error",
          event.error.message,
          undefined,
          false,
        ),
      };
    }
    default:
      return next;
  }
}

export function toChatError(error: unknown): ChatError {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    typeof error.code === "string" &&
    typeof error.message === "string" &&
    error.code.startsWith("CHAT_")
  ) {
    return error as ChatError;
  }
  return {
    code: "CHAT_FAILED",
    message: error instanceof Error ? error.message : String(error),
  };
}
