export type ChatErrorCode =
  | "CHAT_SIDECAR_UNAVAILABLE"
  | "CHAT_SIDECAR_CRASHED"
  | "CHAT_PROTOCOL_ERROR"
  | "CHAT_SESSION_NOT_FOUND"
  | "CHAT_SESSION_BUSY"
  | "CHAT_AUTH_REQUIRED"
  | "CHAT_MODEL_UNAVAILABLE"
  | "CHAT_FAILED";

export interface ChatError {
  code: ChatErrorCode;
  message: string;
  details?: unknown;
}

export type ChatRunStatus =
  | "loading"
  | "idle"
  | "streaming"
  | "reconnecting"
  | "failed"
  | "auth-required";

export interface ChatSessionSummary {
  sessionId: string;
  worktreeId: string;
  title: string;
  createdAt?: number;
  updatedAt?: number;
  status?: ChatRunStatus;
}

export interface ChatMessageModel {
  id: string;
  role: "user" | "assistant" | "system" | "error";
  content: string;
  status: "streaming" | "complete" | "error";
  createdAt?: number;
}

export interface ChatThinkingModel {
  id: string;
  content: string;
  status: "streaming" | "complete";
}

export interface ChatToolModel {
  toolCallId: string;
  name: string;
  arguments?: unknown;
  result?: unknown;
  error?: string;
  status: "running" | "done" | "error";
}

export interface ChatNoticeModel {
  id: string;
  kind: "retry" | "compaction" | "error";
  text: string;
  active: boolean;
}

export type ChatTodoStatus =
  "pending" | "in_progress" | "completed" | "blocked";

export interface ChatTodoModel {
  id: string;
  todos: Array<{ id: string; step: string; status: ChatTodoStatus }>;
  explanation?: string;
  createdAt?: number;
}

export type ChatTimelineItem =
  | ({ type: "message" } & ChatMessageModel)
  | ({ type: "thinking" } & ChatThinkingModel)
  | ({ type: "tool" } & ChatToolModel)
  | ({ type: "notice" } & ChatNoticeModel)
  | ({ type: "todo" } & ChatTodoModel);

export interface ChatQueuedInput {
  id: string;
  text: string;
}

export interface ChatSessionState {
  sessionId: string;
  worktreeId: string;
  sequence: number;
  status: ChatRunStatus;
  items: ChatTimelineItem[];
  queue: ChatQueuedInput[];
  activity: string | null;
  error: ChatError | null;
}

export interface ChatSnapshot {
  sessionId: string;
  worktreeId: string;
  sequence: number;
  status: Exclude<ChatRunStatus, "loading" | "reconnecting">;
  items: ChatTimelineItem[];
  queue: ChatQueuedInput[];
  activity?: string | null;
  error?: ChatError | null;
}

export type ChatSessionEvent =
  | { type: "agent_start" }
  | { type: "agent_end" }
  | { type: "agent_settled" }
  | { type: "message_start"; message: ChatMessageModel }
  | { type: "message_update"; message: ChatMessageModel }
  | { type: "message_end"; message: ChatMessageModel }
  | { type: "thinking_start"; thinking: ChatThinkingModel }
  | { type: "thinking_update"; thinking: ChatThinkingModel }
  | { type: "thinking_end"; thinking: ChatThinkingModel }
  | {
      type: "tool_execution_start";
      toolCallId: string;
      toolName: string;
      arguments?: unknown;
    }
  | {
      type: "tool_execution_update";
      toolCallId: string;
      partialResult?: unknown;
    }
  | {
      type: "tool_execution_end";
      toolCallId: string;
      result?: unknown;
      error?: string;
    }
  | { type: "todo_update"; todo: ChatTodoModel }
  | { type: "queue_update"; queue: ChatQueuedInput[] }
  | { type: "extension_status"; message?: string }
  | { type: "compaction_start"; message?: string }
  | { type: "compaction_end"; message?: string }
  | { type: "auto_retry_start"; message?: string }
  | { type: "auto_retry_end"; message?: string }
  | { type: "session_error"; error: ChatError };

export interface ChatEventEnvelope {
  sessionId: string;
  sequence: number;
  event: ChatSessionEvent;
}

export type ChatThinkingLevel =
  "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface ChatModelRef {
  provider: string;
  id: string;
}

export interface ChatModelOption extends ChatModelRef {
  label: string;
  reasoning: boolean;
}

export interface ChatSlashCommand {
  name: string;
  description?: string;
  argumentHint?: string;
  source: "extension" | "prompt" | "skill" | "builtin";
}

export interface ChatSessionConfig {
  model: ChatModelRef | null;
  models: ChatModelOption[];
  thinkingLevel: ChatThinkingLevel;
  availableThinkingLevels: ChatThinkingLevel[];
  commands: ChatSlashCommand[];
}

export interface ChatAccepted {
  accepted: boolean;
  restored?: string[];
}
