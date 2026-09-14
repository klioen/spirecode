import { realpath, stat } from "node:fs/promises";
import { Buffer } from "node:buffer";
import {
  createPiAdapter,
  type PiAdapter,
  type PiSessionRecord,
} from "./piAdapter.js";
import { normalizeEvent, normalizeMessages, normalizeSummary } from "./wire.js";
import {
  ChatError,
  type ChatAccepted,
  type ChatEventEnvelope,
  type ChatEventSubscriber,
  type ChatRunStatus,
  type ChatSessionSummary,
  type ChatSnapshot,
  type RootResolver,
} from "./types.js";

const MAX_BUFFERED_EVENTS = 512;
const MAX_PROMPT_BYTES = 64 * 1024;

interface SessionState extends PiSessionRecord {
  worktreeId: string;
  sequence: number;
  status: ChatRunStatus;
  queue: unknown[];
  error: null;
  buffered: ChatEventEnvelope[];
  subscriber?: ChatEventSubscriber;
  attaching: boolean;
  needsResnapshot: boolean;
  unsubscribe: () => void;
}

export interface ChatServiceOptions {
  adapter?: PiAdapter | Promise<PiAdapter>;
  maxBufferedEvents?: number;
}

export class ChatService {
  private readonly sessions = new Map<string, SessionState>();
  private readonly owners = new Map<string, string>();
  private adapterPromise?: Promise<PiAdapter>;
  private readonly adapterFactory: () => Promise<PiAdapter>;
  private readonly maxBufferedEvents: number;

  constructor(
    private readonly rootResolver: RootResolver,
    options: ChatServiceOptions = {},
  ) {
    this.adapterFactory = () =>
      Promise.resolve(options.adapter ?? createPiAdapter());
    this.maxBufferedEvents = options.maxBufferedEvents ?? MAX_BUFFERED_EVENTS;
  }

  async create(worktreeId: string): Promise<ChatSessionSummary> {
    const cwd = await this.root(worktreeId);
    try {
      const record = this.register(
        await (await this.adapter()).create(cwd),
        worktreeId,
        cwd,
      );
      return this.summary(record);
    } catch (error) {
      throw mapChatError(error, "Unable to create agent session");
    }
  }

  async list(worktreeId: string): Promise<ChatSessionSummary[]> {
    const cwd = await this.root(worktreeId);
    try {
      const infos = await (await this.adapter()).list(cwd);
      return infos.map((info) => {
        const summary = normalizeSummary(
          info as unknown as Record<string, unknown>,
        );
        if (!summary.sessionId)
          throw protocolError("Agent SDK returned an invalid session");
        this.establishOwnership(summary.sessionId, worktreeId);
        return { ...summary, worktreeId };
      });
    } catch (error) {
      throw mapChatError(error, "Unable to list agent sessions");
    }
  }

  async attach(
    worktreeId: string,
    sessionId: string,
    subscriber: ChatEventSubscriber,
  ): Promise<ChatSnapshot> {
    const cwd = await this.root(worktreeId);
    let record = this.sessions.get(sessionId);
    if (record) this.assertOwner(record, worktreeId);

    try {
      if (!record) {
        const adapter = await this.adapter();
        const info = (await adapter.list(cwd)).find(
          (item) => item.sessionId === sessionId,
        );
        if (!info) throw notFound();
        this.establishOwnership(sessionId, worktreeId);
        record = this.register(await adapter.open(info, cwd), worktreeId, cwd);
      }
      return await this.attachRecord(record, subscriber);
    } catch (error) {
      if (record) {
        record.subscriber = undefined;
        record.attaching = false;
      }
      throw mapChatError(error, "Unable to attach agent session");
    }
  }

  detach(worktreeId: string, sessionId: string): void {
    const record = this.requireOwned(worktreeId, sessionId);
    record.subscriber = undefined;
    record.attaching = false;
  }

  async send(
    worktreeId: string,
    sessionId: string,
    text: string,
  ): Promise<ChatAccepted> {
    await this.root(worktreeId);
    validateText(text);
    const record = this.requireUsable(worktreeId, sessionId);
    try {
      await record.session.send(text);
      return { accepted: true };
    } catch (error) {
      throw mapChatError(error, "Unable to send agent input");
    }
  }

  async abort(worktreeId: string, sessionId: string): Promise<ChatAccepted> {
    await this.root(worktreeId);
    const record = this.requireUsable(worktreeId, sessionId);
    try {
      const cleared = record.session.clearQueue();
      const restored = [
        ...(cleared.steering ?? []),
        ...(cleared.followUp ?? []),
      ];
      await record.session.abort();
      record.queue = [];
      return { accepted: true, restored: [...restored] };
    } catch (error) {
      throw mapChatError(error, "Unable to abort agent session");
    }
  }

  async closeWorktree(worktreeId: string): Promise<void> {
    const records = [...this.sessions.values()].filter(
      (record) => record.worktreeId === worktreeId,
    );
    let failure: unknown;
    for (const record of records) {
      record.subscriber = undefined;
      record.attaching = false;
      record.unsubscribe();
      this.sessions.delete(record.sessionId);
      this.owners.delete(record.sessionId);
      try {
        record.session.clearQueue();
        await record.session.abort();
      } catch (error) {
        failure ??= error;
      }
      try {
        await record.session.dispose();
      } catch (error) {
        failure ??= error;
      }
    }
    if (failure)
      throw mapChatError(failure, "Unable to close worktree chat sessions");
  }

  async disposeAll(): Promise<{ disposed: number }> {
    const records = [...this.sessions.values()];
    this.sessions.clear();
    this.owners.clear();
    let failure: unknown;
    await Promise.all(
      records.map(async (record) => {
        try {
          record.unsubscribe();
          await record.session.dispose();
        } catch (error) {
          failure ??= error;
        }
      }),
    );
    if (failure)
      throw mapChatError(failure, "Unable to dispose agent sessions");
    return { disposed: records.length };
  }

  private adapter(): Promise<PiAdapter> {
    this.adapterPromise ??= this.adapterFactory().catch((error: unknown) => {
      this.adapterPromise = undefined;
      throw error;
    });
    return this.adapterPromise;
  }

  private async attachRecord(
    record: SessionState,
    subscriber: ChatEventSubscriber,
  ): Promise<ChatSnapshot> {
    record.subscriber = subscriber;
    record.attaching = true;
    record.needsResnapshot = false;
    record.buffered = [];

    // Capture before reading messages. Events after this point are delivered only after
    // the authoritative snapshot and only when newer than this fence.
    const fence = record.sequence;
    const statusAtFence = record.status;
    const queueAtFence = [...record.queue];
    const errorAtFence = record.error;
    const items = normalizeMessages(await record.session.getMessages());
    if (record.needsResnapshot) throw resnapshotError();
    const snapshot: ChatSnapshot = {
      sessionId: record.sessionId,
      worktreeId: record.worktreeId,
      sequence: fence,
      status: statusAtFence,
      items,
      queue: queueAtFence,
      error: errorAtFence,
    };
    this.flushAfterSnapshot(record, fence);
    return snapshot;
  }

  private flushAfterSnapshot(record: SessionState, fence: number): void {
    record.buffered = record.buffered.filter((event) => event.sequence > fence);
    while (record.buffered.length) {
      if (record.needsResnapshot) throw resnapshotError();
      const event = record.buffered.shift();
      if (event) this.deliver(record, event);
      if (!record.subscriber) break;
    }
    record.attaching = false;
  }

  private register(
    created: PiSessionRecord,
    worktreeId: string,
    cwd: string,
  ): SessionState {
    if (
      !created.session ||
      !created.sessionId ||
      typeof created.session.subscribe !== "function"
    ) {
      throw protocolError("Agent SDK returned an invalid session");
    }
    this.establishOwnership(created.sessionId, worktreeId);
    const duplicate = this.sessions.get(created.sessionId);
    if (duplicate) {
      this.assertOwner(duplicate, worktreeId);
      void created.session.dispose();
      return duplicate;
    }
    if (created.cwd !== cwd)
      throw protocolError("Agent SDK returned a session for another worktree");

    const record = {
      ...created,
      worktreeId,
      sequence: 0,
      status: created.session.isStreaming ? "streaming" : "idle",
      queue: [],
      error: null,
      buffered: [],
      attaching: false,
      needsResnapshot: false,
      unsubscribe: (): void => undefined,
    } satisfies SessionState;
    record.unsubscribe = created.session.subscribe((raw) =>
      this.receive(record, raw),
    );
    this.sessions.set(created.sessionId, record);
    return record;
  }

  private receive(record: SessionState, raw: unknown): void {
    for (const event of normalizeEvent(raw)) {
      if (event.type === "agent_start") record.status = "streaming";
      if (event.type === "agent_settled") record.status = "idle";
      if (event.type === "queue_update" && Array.isArray(event.queue))
        record.queue = event.queue;
      record.sequence += 1;
      const envelope = {
        sessionId: record.sessionId,
        sequence: record.sequence,
        event,
      };
      if (record.attaching || !record.subscriber) this.buffer(record, envelope);
      else this.deliver(record, envelope);
    }
  }

  private buffer(record: SessionState, event: ChatEventEnvelope): void {
    if (record.buffered.length >= this.maxBufferedEvents) {
      record.buffered = [];
      record.needsResnapshot = true;
      record.subscriber = undefined;
      record.attaching = false;
      return;
    }
    record.buffered.push(event);
  }

  private deliver(record: SessionState, event: ChatEventEnvelope): void {
    try {
      record.subscriber?.(event);
    } catch {
      record.subscriber = undefined;
      this.buffer(record, event);
    }
  }

  private summary(record: SessionState): ChatSessionSummary {
    return {
      ...normalizeSummary(record as unknown as Record<string, unknown>),
      worktreeId: record.worktreeId,
    };
  }

  private establishOwnership(sessionId: string, worktreeId: string): void {
    const owner = this.owners.get(sessionId);
    if (owner && owner !== worktreeId) {
      throw protocolError(
        "Agent SDK returned a session for multiple worktrees",
      );
    }
    this.owners.set(sessionId, worktreeId);
  }

  private requireOwned(worktreeId: string, sessionId: string): SessionState {
    const record = this.sessions.get(sessionId);
    if (!record || record.worktreeId !== worktreeId) throw notFound();
    return record;
  }

  private requireUsable(worktreeId: string, sessionId: string): SessionState {
    const record = this.requireOwned(worktreeId, sessionId);
    if (record.needsResnapshot) throw resnapshotError();
    return record;
  }

  private assertOwner(record: SessionState, worktreeId: string): void {
    if (record.worktreeId !== worktreeId) throw notFound();
  }

  private async root(worktreeId: string): Promise<string> {
    try {
      const root = await realpath(await this.rootResolver(worktreeId));
      if (!(await stat(root)).isDirectory()) throw new Error("not a directory");
      return root;
    } catch {
      throw notFound("Chat worktree is unavailable");
    }
  }
}

function validateText(text: string): void {
  if (!text.trim())
    throw new ChatError("CHAT_FAILED", "Chat message must not be empty");
  if (Buffer.byteLength(text, "utf8") > MAX_PROMPT_BYTES) {
    throw new ChatError("CHAT_FAILED", "Chat message exceeds 64 KiB");
  }
}

export function mapChatError(
  error: unknown,
  fallbackMessage: string,
): ChatError {
  if (error instanceof ChatError) return error;
  const text = error instanceof Error ? error.message.toLowerCase() : "";
  if (
    text.includes("auth") ||
    text.includes("api key") ||
    text.includes("credential")
  ) {
    return new ChatError(
      "CHAT_AUTH_REQUIRED",
      "Agent authentication is required",
    );
  }
  if (text.includes("model") || text.includes("provider")) {
    return new ChatError(
      "CHAT_MODEL_UNAVAILABLE",
      "Configured agent model is unavailable",
    );
  }
  return new ChatError("CHAT_FAILED", fallbackMessage);
}

function notFound(message = "Chat session not found"): ChatError {
  return new ChatError("CHAT_SESSION_NOT_FOUND", message);
}

function protocolError(message: string): ChatError {
  return new ChatError("CHAT_PROTOCOL_ERROR", message);
}

function resnapshotError(): ChatError {
  return protocolError(
    "Chat event stream has a gap; attach again for a fresh snapshot",
  );
}

export { MAX_BUFFERED_EVENTS, MAX_PROMPT_BYTES };
