import type {
  ChatEvent as WireChatEvent,
  ChatSessionSummary as WireChatSessionSummary,
  ChatSnapshot as WireChatSnapshot,
} from "../../bindings";
import { commands } from "../../bindings";
import type { ChatApi } from "./chatApi";
import type {
  ChatEventEnvelope,
  ChatSessionSummary,
  ChatSnapshot,
} from "./types";

const summary = (value: WireChatSessionSummary): ChatSessionSummary => value;

const snapshot = (value: WireChatSnapshot): ChatSnapshot =>
  value as ChatSnapshot;

const event = (value: WireChatEvent): ChatEventEnvelope =>
  value as ChatEventEnvelope;

export const hostChatApi: ChatApi = {
  async create(worktreeId) {
    return summary(await commands.chatSessionCreate(worktreeId));
  },
  async list(worktreeId) {
    return (await commands.chatSessionList(worktreeId)).map(summary);
  },
  async attach(worktreeId, sessionId, onEvent) {
    const attachment = await commands.chatSessionAttach(
      worktreeId,
      sessionId,
      (incoming) => onEvent(event(incoming)),
    );
    return {
      snapshot: snapshot(attachment.snapshot),
      detach: attachment.detach,
    };
  },
  send: (worktreeId, sessionId, text) =>
    commands.chatSessionSend(worktreeId, sessionId, text),
  abort: (worktreeId, sessionId) =>
    commands.chatSessionAbort(worktreeId, sessionId),
};
