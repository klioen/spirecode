const textOf = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (part): part is { type: "text"; text: string } =>
        isRecord(part) && part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("");
};

const epoch = (value: unknown): number | undefined => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const messageId = (message: Record<string, unknown>, index = 0): string =>
  typeof message.id === "string"
    ? message.id
    : `message:${typeof message.role === "string" ? message.role : "unknown"}:${epoch(message.timestamp) ?? index}`;

export function normalizeSummary(record: Record<string, unknown>): {
  sessionId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  status: "idle" | "streaming";
} {
  const createdAt = epoch(record.createdAt ?? record.created) ?? Date.now();
  const firstMessage = isRecord(record.firstMessage)
    ? record.firstMessage.text
    : record.firstMessage;
  return {
    sessionId: String(record.sessionId ?? record.id ?? ""),
    title:
      stringValue(record.title) ??
      stringValue(record.name) ??
      (typeof firstMessage === "string" && firstMessage.trim()
        ? firstMessage.trim()
        : "New chat"),
    createdAt,
    updatedAt: epoch(record.updatedAt ?? record.modified) ?? createdAt,
    status: record.status === "streaming" ? "streaming" : "idle",
  };
}

const TODO_STATUSES = new Set([
  "pending",
  "in_progress",
  "completed",
  "blocked",
]);

function normalizeTodoEntry(
  entry: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (
    entry.type !== "custom" ||
    entry.customType !== "pi-todo-state" ||
    typeof entry.id !== "string" ||
    !entry.id ||
    !isRecord(entry.data) ||
    !Array.isArray(entry.data.todos)
  )
    return undefined;

  const todos = entry.data.todos
    .filter(
      (todo): todo is Record<string, unknown> =>
        isRecord(todo) &&
        typeof todo.id === "string" &&
        Boolean(todo.id.trim()) &&
        typeof todo.step === "string" &&
        Boolean(todo.step.trim()) &&
        typeof todo.status === "string" &&
        TODO_STATUSES.has(todo.status),
    )
    .slice(0, 20)
    .map((todo) => ({
      id: (todo.id as string).trim(),
      step: (todo.step as string).trim(),
      status: todo.status,
    }));
  if (todos.length === 0) return undefined;

  const explanation =
    typeof entry.data.explanation === "string"
      ? entry.data.explanation.trim()
      : "";
  const createdAt = epoch(entry.timestamp);
  return {
    type: "todo",
    id: entry.id,
    todos,
    ...(explanation ? { explanation } : {}),
    ...(createdAt === undefined ? {} : { createdAt }),
  };
}

export function normalizeMessages(messages: unknown): unknown[] {
  const items: Array<Record<string, unknown>> = [];
  const tools = new Map<string, Record<string, unknown>>();
  const values = Array.isArray(messages) ? messages : [];
  values.forEach((raw, index) => {
    if (!isRecord(raw)) return;
    const todo = normalizeTodoEntry(raw);
    if (todo) {
      items.push(todo);
      return;
    }
    const base = messageId(raw, index);
    if (raw.role === "user") {
      items.push({
        type: "message",
        id: base,
        role: "user",
        content: textOf(raw.content),
        status: "complete",
        ...(epoch(raw.timestamp) === undefined
          ? {}
          : { createdAt: epoch(raw.timestamp) }),
      });
      return;
    }
    if (raw.role === "assistant") {
      const blocks = Array.isArray(raw.content)
        ? raw.content
        : [{ type: "text", text: textOf(raw.content) }];
      const failed = raw.stopReason === "error";
      items.push({
        type: "message",
        id: base,
        role: failed ? "error" : "assistant",
        content: blocks
          .filter((block) => isRecord(block) && block.type === "text")
          .map((block) => String((block as Record<string, unknown>).text ?? ""))
          .join(""),
        status: failed ? "error" : "complete",
        ...(epoch(raw.timestamp) === undefined
          ? {}
          : { createdAt: epoch(raw.timestamp) }),
      });
      blocks.forEach((block, blockIndex) => {
        if (!isRecord(block)) return;
        if (block.type === "thinking" && typeof block.thinking === "string") {
          items.push({
            type: "thinking",
            id: `${base}:thinking:${blockIndex}`,
            content: block.thinking,
            status: "complete",
          });
        } else if (block.type === "toolCall" && typeof block.id === "string") {
          const item = {
            type: "tool",
            toolCallId: block.id,
            name: stringValue(block.name) ?? "unknown",
            arguments: block.arguments,
            status: "running",
          };
          tools.set(block.id, item);
          items.push(item);
        }
      });
      return;
    }
    if (raw.role === "toolResult" && typeof raw.toolCallId === "string") {
      const existing = tools.get(raw.toolCallId);
      const result = textOf(raw.content);
      if (existing) {
        existing.result = result;
        existing.status = raw.isError ? "error" : "done";
        if (raw.isError) existing.error = result;
      } else {
        items.push({
          type: "tool",
          toolCallId: raw.toolCallId,
          name: stringValue(raw.toolName) ?? "unknown",
          result,
          ...(raw.isError ? { error: result } : {}),
          status: raw.isError ? "error" : "done",
        });
      }
    }
  });
  return items;
}

export function normalizeTimeline(
  messages: unknown,
  entries: unknown,
): unknown[] {
  const items = normalizeMessages(messages) as Array<Record<string, unknown>>;
  if (!Array.isArray(entries)) return items;

  const todos = entries
    .filter(isRecord)
    .map(normalizeTodoEntry)
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .sort(
      (left, right) =>
        (epoch(left.createdAt) ?? Number.MAX_SAFE_INTEGER) -
        (epoch(right.createdAt) ?? Number.MAX_SAFE_INTEGER),
    );

  for (const todo of todos) {
    const timestamp = epoch(todo.createdAt);
    const insertAt =
      timestamp === undefined
        ? -1
        : items.findIndex((item) => {
            const itemTimestamp = epoch(item.createdAt);
            return itemTimestamp !== undefined && itemTimestamp > timestamp;
          });
    if (insertAt < 0) items.push(todo);
    else items.splice(insertAt, 0, todo);
  }
  return items;
}

function normalizeMessageEvent(
  type: string,
  message: unknown,
): Array<Record<string, unknown>> {
  if (
    !isRecord(message) ||
    (message.role !== "user" && message.role !== "assistant")
  )
    return [];
  const failed = message.role === "assistant" && message.stopReason === "error";
  const status = failed
    ? "error"
    : type === "message_end"
      ? "complete"
      : "streaming";
  const id = messageId(message);
  const blocks = Array.isArray(message.content)
    ? message.content
    : [{ type: "text", text: textOf(message.content) }];
  const content = blocks
    .filter((block) => isRecord(block) && block.type === "text")
    .map((block) => String((block as Record<string, unknown>).text ?? ""))
    .join("");
  const events: Array<Record<string, unknown>> = [
    {
      type,
      message: {
        id,
        role: failed ? "error" : message.role,
        content:
          content ||
          (failed
            ? (stringValue(message.errorMessage) ?? "Agent run failed")
            : ""),
        status,
        ...(epoch(message.timestamp) === undefined
          ? {}
          : { createdAt: epoch(message.timestamp) }),
      },
    },
  ];
  if (message.role === "assistant") {
    blocks.forEach((block, index) => {
      if (
        !isRecord(block) ||
        block.type !== "thinking" ||
        typeof block.thinking !== "string"
      )
        return;
      events.push({
        type: `thinking_${type.slice("message_".length)}`,
        thinking: {
          id: `${id}:thinking:${index}`,
          content: block.thinking,
          status,
        },
      });
    });
  }
  return events;
}

export function normalizeEvent(raw: unknown): Array<Record<string, unknown>> {
  if (!isRecord(raw) || typeof raw.type !== "string") return [];
  if (["agent_start", "agent_end", "agent_settled"].includes(raw.type))
    return [{ type: raw.type }];
  if (["message_start", "message_update", "message_end"].includes(raw.type)) {
    return normalizeMessageEvent(raw.type, raw.message);
  }
  if (
    raw.type === "tool_execution_start" &&
    typeof raw.toolCallId === "string"
  ) {
    return [
      {
        type: raw.type,
        toolCallId: raw.toolCallId,
        toolName: stringValue(raw.toolName) ?? "unknown",
        arguments: raw.args,
      },
    ];
  }
  if (
    raw.type === "tool_execution_update" &&
    typeof raw.toolCallId === "string"
  ) {
    return [
      {
        type: raw.type,
        toolCallId: raw.toolCallId,
        toolName: stringValue(raw.toolName) ?? "unknown",
        arguments: raw.args,
        partialResult: raw.partialResult,
      },
    ];
  }
  if (raw.type === "tool_execution_end" && typeof raw.toolCallId === "string") {
    const error =
      textOf(isRecord(raw.result) ? raw.result.content : raw.result) ||
      "Tool execution failed";
    return [
      {
        type: raw.type,
        toolCallId: raw.toolCallId,
        toolName: stringValue(raw.toolName) ?? "unknown",
        result: raw.result,
        isError: Boolean(raw.isError),
        ...(raw.isError ? { error } : {}),
      },
    ];
  }
  if (raw.type === "entry_appended" && isRecord(raw.entry)) {
    const item = normalizeTodoEntry(raw.entry);
    if (!item) return [];
    const todo = { ...item };
    delete todo.type;
    return [{ type: "todo_update", todo }];
  }
  if (raw.type === "queue_update") {
    const steering = Array.isArray(raw.steering) ? raw.steering : [];
    const followUp = Array.isArray(raw.followUp) ? raw.followUp : [];
    const texts = [...steering, ...followUp].filter(
      (value): value is string => typeof value === "string",
    );
    return [
      {
        type: "queue_update",
        queue: texts.map((text, index) => ({
          id: `queue:${index}:${text}`,
          text,
        })),
      },
    ];
  }
  if (raw.type === "compaction_start")
    return [{ type: raw.type, message: raw.reason }];
  if (raw.type === "compaction_end")
    return [{ type: raw.type, message: raw.errorMessage }];
  if (raw.type === "auto_retry_start")
    return [{ type: raw.type, message: raw.errorMessage }];
  if (raw.type === "auto_retry_end")
    return [{ type: raw.type, message: raw.finalError }];
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export { epoch, textOf };
