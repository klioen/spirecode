export type ChatErrorCode =
  | "CHAT_SIDECAR_UNAVAILABLE"
  | "CHAT_SIDECAR_CRASHED"
  | "CHAT_PROTOCOL_ERROR"
  | "CHAT_SESSION_NOT_FOUND"
  | "CHAT_SESSION_BUSY"
  | "CHAT_AUTH_REQUIRED"
  | "CHAT_MODEL_UNAVAILABLE"
  | "CHAT_FAILED";

export class ChatError extends Error {
  readonly code: ChatErrorCode;
  readonly details?: unknown;

  constructor(code: ChatErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ChatError";
    this.code = code;
    this.details = details;
  }
}

export type ChatRunStatus = "idle" | "streaming" | "failed" | "auth-required";

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

export interface ChatSessionSummary {
  sessionId: string;
  worktreeId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  status?: ChatRunStatus;
}

export type ChatTodoStatus =
  "pending" | "in_progress" | "completed" | "blocked";

export interface ChatTodoModel {
  id: string;
  todos: Array<{ id: string; step: string; status: ChatTodoStatus }>;
  explanation?: string;
  createdAt?: number;
}

export interface ChatSnapshotError {
  code: ChatErrorCode;
  message: string;
  details?: unknown;
}

export interface ChatSnapshot {
  sessionId: string;
  worktreeId: string;
  sequence: number;
  status: ChatRunStatus;
  items: unknown[];
  queue: unknown[];
  activity?: string | null;
  error: ChatSnapshotError | null;
}

export interface ChatEventEnvelope {
  sessionId: string;
  sequence: number;
  event: Record<string, unknown>;
}

export interface ChatAccepted {
  accepted: boolean;
  restored?: string[];
}

export type RootResolver = (worktreeId: string) => string | Promise<string>;
export type ChatEventSubscriber = (event: ChatEventEnvelope) => void;
