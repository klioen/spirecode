import type {
  ChatAccepted,
  ChatEventEnvelope,
  ChatSessionConfig,
  ChatSessionSummary,
  ChatThinkingLevel,
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
  config(worktreeId: string, sessionId: string): Promise<ChatSessionConfig>;
  setModel(
    worktreeId: string,
    sessionId: string,
    provider: string,
    modelId: string,
  ): Promise<ChatSessionConfig>;
  setThinkingLevel(
    worktreeId: string,
    sessionId: string,
    level: ChatThinkingLevel,
  ): Promise<ChatSessionConfig>;
  send(
    worktreeId: string,
    sessionId: string,
    text: string,
  ): Promise<ChatAccepted>;
  abort(worktreeId: string, sessionId: string): Promise<ChatAccepted>;
  delete(worktreeId: string, sessionId: string): Promise<void>;
}

function unavailable(): never {
  throw new Error("Chat API is not configured");
}

export const unavailableChatApi: ChatApi = {
  create: async () => unavailable(),
  list: async () => unavailable(),
  attach: async () => unavailable(),
  config: async () => unavailable(),
  setModel: async () => unavailable(),
  setThinkingLevel: async () => unavailable(),
  send: async () => unavailable(),
  abort: async () => unavailable(),
  delete: async () => unavailable(),
};
