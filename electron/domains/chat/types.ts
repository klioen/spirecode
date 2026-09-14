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

export interface ChatSessionSummary {
  sessionId: string;
  worktreeId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  status?: ChatRunStatus;
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
