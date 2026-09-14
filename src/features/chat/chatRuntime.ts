import { useSyncExternalStore } from "react";
import { createInitialChatState, sessionReducer } from "./sessionReducer";
import type {
  ChatEventEnvelope,
  ChatRunStatus,
  ChatSessionState,
  ChatSnapshot,
} from "./types";

export interface ChatRuntimeOptions {
  batchMs?: number;
  maxItems?: number;
}

type Listener = () => void;

export class ChatRuntime {
  private readonly states = new Map<string, ChatSessionState>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly dirtySessions = new Set<string>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly batchMs: number;
  private readonly maxItems: number;

  constructor(options: ChatRuntimeOptions = {}) {
    this.batchMs = options.batchMs ?? 24;
    this.maxItems = options.maxItems ?? 2_000;
  }

  ensure(
    sessionId: string,
    worktreeId: string,
    status: ChatRunStatus = "loading",
  ): ChatSessionState {
    const existing = this.states.get(sessionId);
    if (existing) return existing;
    const created = createInitialChatState(sessionId, worktreeId, status);
    this.states.set(sessionId, created);
    return created;
  }

  getSnapshot = (sessionId: string): ChatSessionState => {
    const state = this.states.get(sessionId);
    if (!state) {
      throw new Error(`Chat session ${sessionId} has not been initialized`);
    }
    return state;
  };

  subscribe = (sessionId: string, listener: Listener): (() => void) => {
    const listeners = this.listeners.get(sessionId) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(sessionId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(sessionId);
    };
  };

  hydrate(snapshot: ChatSnapshot): void {
    const current = this.states.get(snapshot.sessionId);
    if (current && current.sequence > snapshot.sequence) return;
    this.states.set(snapshot.sessionId, {
      sessionId: snapshot.sessionId,
      worktreeId: snapshot.worktreeId,
      sequence: snapshot.sequence,
      status: snapshot.status,
      items: snapshot.items.slice(-this.maxItems),
      queue: [...snapshot.queue],
      error: snapshot.error ?? null,
    });
    this.markDirty(snapshot.sessionId);
  }

  push(envelope: ChatEventEnvelope): void {
    const current = this.states.get(envelope.sessionId);
    if (!current) return;
    const reduced = sessionReducer(current, {
      sequence: envelope.sequence,
      event: envelope.event,
    });
    if (reduced === current) return;
    const bounded =
      reduced.items.length > this.maxItems
        ? { ...reduced, items: reduced.items.slice(-this.maxItems) }
        : reduced;
    this.states.set(envelope.sessionId, bounded);
    this.markDirty(envelope.sessionId);
  }

  setStatus(sessionId: string, status: ChatRunStatus): void {
    const current = this.states.get(sessionId);
    if (!current || current.status === status) return;
    this.states.set(sessionId, { ...current, status });
    this.markDirty(sessionId);
  }

  remove(sessionId: string): void {
    this.states.delete(sessionId);
    this.listeners.delete(sessionId);
    this.dirtySessions.delete(sessionId);
  }

  private markDirty(sessionId: string): void {
    this.dirtySessions.add(sessionId);
    if (this.batchMs === 0) {
      this.flush();
      return;
    }
    if (this.flushTimer === null) {
      this.flushTimer = setTimeout(() => this.flush(), this.batchMs);
    }
  }

  private flush(): void {
    if (this.flushTimer !== null) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    const sessions = [...this.dirtySessions];
    this.dirtySessions.clear();
    for (const sessionId of sessions) {
      for (const listener of this.listeners.get(sessionId) ?? []) listener();
    }
  }
}

export const chatRuntime = new ChatRuntime();

export function useChatSession(
  sessionId: string,
  runtime: ChatRuntime = chatRuntime,
): ChatSessionState {
  return useSyncExternalStore(
    (listener) => runtime.subscribe(sessionId, listener),
    () => runtime.getSnapshot(sessionId),
    () => runtime.getSnapshot(sessionId),
  );
}
