import type {
  ChatAccepted,
  ChatEventEnvelope,
  ChatSessionSummary,
  ChatSnapshot,
} from "./types";

export type ChatEventListener = (event: ChatEventEnvelope) => void;

export interface ChatAttachment {
  snapshot: ChatSnapshot;
  detach: () => void;
}

/**
 * Boundary implemented by the parent integration. The adapter may wrap Tauri
 * Channels, while tests and alternate hosts can provide a simple in-memory API.
 */
export interface ChatApi {
  create(worktreeId: string): Promise<ChatSessionSummary>;
  list(worktreeId: string): Promise<ChatSessionSummary[]>;
  attach(
    worktreeId: string,
    sessionId: string,
    onEvent: ChatEventListener,
  ): Promise<ChatAttachment>;
  send(
    worktreeId: string,
    sessionId: string,
    text: string,
  ): Promise<ChatAccepted>;
  abort(worktreeId: string, sessionId: string): Promise<ChatAccepted>;
}

function unavailable(): never {
  throw new Error("Chat API is not configured");
}

export const unavailableChatApi: ChatApi = {
  create: async () => unavailable(),
  list: async () => unavailable(),
  attach: async () => unavailable(),
  send: async () => unavailable(),
  abort: async () => unavailable(),
};
