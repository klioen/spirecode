import { realpath, stat } from "node:fs/promises";
import { Buffer } from "node:buffer";
import path from "node:path";
import {
  createPiAdapter,
  type PiAdapter,
  type PiSessionRecord,
} from "./piAdapter.js";
import { normalizeEvent, normalizeSummary, normalizeTimeline } from "./wire.js";
import {
  ChatError,
  type ChatAccepted,
  type ChatEventEnvelope,
  type ChatEventSubscriber,
  type ChatRunStatus,
  type ChatSessionConfig,
  type ChatSessionSummary,
  type ChatThinkingLevel,
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
  activity: string | null;
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
  trashItem?: (sessionPath: string) => Promise<void>;
}

export class ChatService {
  private readonly sessions = new Map<string, SessionState>();
  private readonly owners = new Map<string, string>();
  private adapterPromise?: Promise<PiAdapter>;
  private readonly adapterFactory: () => Promise<PiAdapter>;
  private readonly maxBufferedEvents: number;
  private readonly trashItem?: (sessionPath: string) => Promise<void>;
  private readonly deleting = new Set<string>();
  private readonly lifecycleTails = new Map<string, Promise<void>>();

  constructor(
    private readonly rootResolver: RootResolver,
    options: ChatServiceOptions = {},
  ) {
    this.adapterFactory = () =>
      Promise.resolve(options.adapter ?? createPiAdapter());
    this.maxBufferedEvents = options.maxBufferedEvents ?? MAX_BUFFERED_EVENTS;
    this.trashItem = options.trashItem;
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

  attach(
    worktreeId: string,
    sessionId: string,
    subscriber: ChatEventSubscriber,
  ): Promise<ChatSnapshot> {
    return this.runLifecycle(sessionId, () =>
      this.attachUnlocked(worktreeId, sessionId, subscriber),
    );
  }

  private async attachUnlocked(
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
    const record = this.sessions.get(sessionId);
    if (!record) return;
    this.assertOwner(record, worktreeId);
    record.subscriber = undefined;
    record.attaching = false;
  }

  config(worktreeId: string, sessionId: string): Promise<ChatSessionConfig> {
    return this.runLifecycle(sessionId, () =>
      this.configUnlocked(worktreeId, sessionId),
    );
  }

  private async configUnlocked(
    worktreeId: string,
    sessionId: string,
  ): Promise<ChatSessionConfig> {
    await this.root(worktreeId);
    const record = this.requireUsable(worktreeId, sessionId);
    try {
      return await record.session.getConfig();
    } catch (error) {
      throw mapChatError(error, "Unable to load chat configuration");
    }
  }

  setModel(
    worktreeId: string,
    sessionId: string,
    provider: string,
    modelId: string,
  ): Promise<ChatSessionConfig> {
    return this.runLifecycle(sessionId, () =>
      this.setModelUnlocked(worktreeId, sessionId, provider, modelId),
    );
  }

  private async setModelUnlocked(
    worktreeId: string,
    sessionId: string,
    provider: string,
    modelId: string,
  ): Promise<ChatSessionConfig> {
    await this.root(worktreeId);
    const record = this.requireIdle(worktreeId, sessionId);
    try {
      const config = await record.session.getConfig();
      if (
        !config.models.some(
          (model) => model.provider === provider && model.id === modelId,
        )
      )
        throw new ChatError(
          "CHAT_MODEL_UNAVAILABLE",
          "Selected model is unavailable",
        );
      return await record.session.setModel(provider, modelId);
    } catch (error) {
      throw mapChatError(error, "Unable to change chat model");
    }
  }

  setThinkingLevel(
    worktreeId: string,
    sessionId: string,
    level: ChatThinkingLevel,
  ): Promise<ChatSessionConfig> {
    return this.runLifecycle(sessionId, () =>
      this.setThinkingLevelUnlocked(worktreeId, sessionId, level),
    );
  }

  private async setThinkingLevelUnlocked(
    worktreeId: string,
    sessionId: string,
    level: ChatThinkingLevel,
  ): Promise<ChatSessionConfig> {
    await this.root(worktreeId);
    const record = this.requireIdle(worktreeId, sessionId);
    try {
      const config = await record.session.getConfig();
      if (!config.availableThinkingLevels.includes(level))
        throw new ChatError(
          "CHAT_FAILED",
          "Thinking level is unavailable for the selected model",
        );
      return await record.session.setThinkingLevel(level);
    } catch (error) {
      throw mapChatError(error, "Unable to change thinking level");
    }
  }

  send(
    worktreeId: string,
    sessionId: string,
    text: string,
  ): Promise<ChatAccepted> {
    return this.runLifecycle(sessionId, () =>
      this.sendUnlocked(worktreeId, sessionId, text),
    );
  }

  private async sendUnlocked(
    worktreeId: string,
    sessionId: string,
    text: string,
  ): Promise<ChatAccepted> {
    await this.root(worktreeId);
    validateText(text);
    const nativeCommand = parseNativeCommand(text);
    if (nativeCommand?.kind === "invalid")
      throw new ChatError("CHAT_FAILED", nativeCommand.message);
    if (nativeCommand?.kind === "model") {
      await this.setModelUnlocked(
        worktreeId,
        sessionId,
        nativeCommand.provider,
        nativeCommand.modelId,
      );
      return { accepted: true };
    }
    if (nativeCommand?.kind === "thinking") {
      await this.setThinkingLevelUnlocked(
        worktreeId,
        sessionId,
        nativeCommand.level,
      );
      return { accepted: true };
    }
    const record = this.requireUsable(worktreeId, sessionId);
    try {
      await record.session.send(text);
      return { accepted: true };
    } catch (error) {
      throw mapChatError(error, "Unable to send agent input");
    }
  }

  abort(worktreeId: string, sessionId: string): Promise<ChatAccepted> {
    return this.runLifecycle(sessionId, () =>
      this.abortUnlocked(worktreeId, sessionId),
    );
  }

  private async abortUnlocked(
    worktreeId: string,
    sessionId: string,
  ): Promise<ChatAccepted> {
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

  delete(worktreeId: string, sessionId: string): Promise<void> {
    return this.runLifecycle(sessionId, () =>
      this.deleteUnlocked(worktreeId, sessionId),
    );
  }

  private async deleteUnlocked(
    worktreeId: string,
    sessionId: string,
  ): Promise<void> {
    const cwd = await this.root(worktreeId);
    if (this.deleting.has(sessionId))
      throw new ChatError("CHAT_SESSION_BUSY", "Chat session is being deleted");
    const loaded = this.sessions.get(sessionId);
    if (loaded) {
      this.assertOwner(loaded, worktreeId);
      if (!loaded.session.isIdle || loaded.session.isStreaming)
        throw new ChatError(
          "CHAT_SESSION_BUSY",
          "Stop the running chat before deleting it",
        );
    }

    this.deleting.add(sessionId);
    try {
      const target = await (
        await this.adapter()
      ).resolveDeleteTarget(cwd, sessionId);
      if (!target?.info.path) throw notFound();
      let targetCwd: string;
      try {
        targetCwd = await realpath(target.info.cwd);
      } catch {
        throw notFound();
      }
      if (targetCwd !== cwd) throw notFound();
      const [sessionPath, sessionRoot] = await Promise.all([
        realpath(target.info.path),
        realpath(target.sessionRoot),
      ]);
      if (!(await stat(sessionRoot)).isDirectory()) throw notFound();
      if (
        !(await stat(sessionPath)).isFile() ||
        !isWithin(sessionRoot, sessionPath)
      )
        throw notFound();
      if (!this.trashItem)
        throw new ChatError("CHAT_FAILED", "Trash is unavailable");

      if (loaded) {
        loaded.subscriber = undefined;
        loaded.attaching = false;
        loaded.unsubscribe();
        this.sessions.delete(sessionId);
        this.owners.delete(sessionId);
        await loaded.session.dispose();
      }
      try {
        await this.trashItem(sessionPath);
      } catch (error) {
        throw mapChatError(error, "Unable to move chat session to Trash");
      }
      this.sessions.delete(sessionId);
      this.owners.delete(sessionId);
    } catch (error) {
      throw mapChatError(error, "Unable to delete chat session");
    } finally {
      this.deleting.delete(sessionId);
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

  private runLifecycle<T>(
    sessionId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.lifecycleTails.get(sessionId) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.lifecycleTails.set(sessionId, tail);
    void tail.finally(() => {
      if (this.lifecycleTails.get(sessionId) === tail)
        this.lifecycleTails.delete(sessionId);
    });
    return result;
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
    const activityAtFence = record.activity;
    const errorAtFence = record.error;
    const [messages, entries] = await Promise.all([
      record.session.getMessages(),
      record.session.getEntries(),
    ]);
    const items = normalizeTimeline(messages, entries);
    if (record.needsResnapshot) throw resnapshotError();
    const snapshot: ChatSnapshot = {
      sessionId: record.sessionId,
      worktreeId: record.worktreeId,
      sequence: fence,
      status: statusAtFence,
      items,
      queue: queueAtFence,
      activity: activityAtFence,
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
      activity: created.session.activity,
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
      if (event.type === "extension_status")
        record.activity =
          typeof event.message === "string" ? event.message : null;
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

  private requireIdle(worktreeId: string, sessionId: string): SessionState {
    const record = this.requireUsable(worktreeId, sessionId);
    if (!record.session.isIdle)
      throw new ChatError("CHAT_SESSION_BUSY", "Agent session is busy");
    return record;
  }

  private requireUsable(worktreeId: string, sessionId: string): SessionState {
    if (this.deleting.has(sessionId))
      throw new ChatError("CHAT_SESSION_BUSY", "Chat session is being deleted");
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

type NativeCommand =
  | { kind: "model"; provider: string; modelId: string }
  | { kind: "thinking"; level: ChatThinkingLevel }
  | { kind: "invalid"; message: string };

const THINKING_LEVELS = new Set<ChatThinkingLevel>([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

function parseNativeCommand(text: string): NativeCommand | undefined {
  if (text.includes("\n") || text.includes("\r")) return undefined;
  if (text === "/model" || text.startsWith("/model ")) {
    const argument = text.slice("/model".length).trim();
    if (!argument || /\s/.test(argument))
      return { kind: "invalid", message: "Usage: /model <provider/model>" };
    const separator = argument.indexOf("/");
    if (separator <= 0 || separator === argument.length - 1)
      return { kind: "invalid", message: "Usage: /model <provider/model>" };
    return {
      kind: "model",
      provider: argument.slice(0, separator),
      modelId: argument.slice(separator + 1),
    };
  }
  if (text === "/thinking" || text.startsWith("/thinking ")) {
    const argument = text.slice("/thinking".length).trim();
    if (!THINKING_LEVELS.has(argument as ChatThinkingLevel))
      return {
        kind: "invalid",
        message: "Usage: /thinking <off|minimal|low|medium|high|xhigh|max>",
      };
    return { kind: "thinking", level: argument as ChatThinkingLevel };
  }
  return undefined;
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

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative !== "" &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
}

function resnapshotError(): ChatError {
  return protocolError(
    "Chat event stream has a gap; attach again for a fresh snapshot",
  );
}

export { MAX_BUFFERED_EVENTS, MAX_PROMPT_BYTES };
