import { EventEmitter } from "node:events";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ChatService,
  type PiAdapter,
  type PiSession,
  type PiSessionRecord,
} from "./index.js";

class FakeSession implements PiSession {
  readonly events = new EventEmitter();
  readonly calls: unknown[][] = [];
  messages: unknown[] = [];
  isStreaming = false;
  isIdle = true;
  configValue = {
    model: { provider: "traex", id: "reasoning-model" },
    models: [
      {
        provider: "traex",
        id: "reasoning-model",
        label: "Reasoning Model",
        reasoning: true,
      },
    ],
    thinkingLevel: "medium" as const,
    availableThinkingLevels: ["off", "low", "medium", "high"] as const,
    commands: [],
  };
  messageGate?: Promise<void>;
  messageStarted?: () => void;

  constructor(
    readonly sessionId: string,
    readonly name = "Chat",
  ) {}

  subscribe(listener: (event: unknown) => void): () => void {
    this.events.on("event", listener);
    return () => this.events.off("event", listener);
  }

  emit(event: unknown): void {
    this.events.emit("event", event);
  }

  async getMessages(): Promise<unknown[]> {
    this.messageStarted?.();
    await this.messageGate;
    return this.messages;
  }

  async getConfig() {
    this.calls.push(["getConfig"]);
    return {
      ...this.configValue,
      availableThinkingLevels: [...this.configValue.availableThinkingLevels],
    };
  }

  async setModel(provider: string, modelId: string) {
    this.calls.push(["setModel", provider, modelId]);
    return this.getConfig();
  }

  async setThinkingLevel(
    level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max",
  ) {
    this.calls.push(["setThinkingLevel", level]);
    return this.getConfig();
  }

  async send(text: string): Promise<void> {
    this.calls.push(["send", text]);
  }

  async followUp(text: string): Promise<void> {
    this.calls.push(["followUp", text]);
  }

  clearQueue(): { steering: string[]; followUp: string[] } {
    this.calls.push(["clearQueue"]);
    return { steering: ["steer"], followUp: ["queued"] };
  }

  async abort(): Promise<void> {
    this.calls.push(["abort"]);
  }

  async dispose(): Promise<void> {
    this.calls.push(["dispose"]);
  }
}

const cleanup: string[] = [];

async function fixture(): Promise<{
  root: string;
  records: Map<string, PiSessionRecord>;
  adapter: PiAdapter;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), "spirecode-chat-"));
  cleanup.push(root);
  const records = new Map<string, PiSessionRecord>();
  let next = 1;
  const adapter: PiAdapter = {
    async create(cwd) {
      const session = new FakeSession(`s${next++}`);
      const now = Date.now();
      const record = {
        session,
        sessionId: session.sessionId,
        cwd,
        title: "Chat",
        createdAt: now,
        updatedAt: now,
      };
      records.set(record.sessionId, record);
      return record;
    },
    async list(cwd) {
      return [...records.values()]
        .filter((record) => record.cwd === cwd)
        .map(({ sessionId, title, createdAt, updatedAt }) => ({
          sessionId,
          cwd,
          title,
          createdAt,
          updatedAt,
          path: `/sessions/${sessionId}`,
        }));
    },
    async open(info, cwd) {
      const record = records.get(info.sessionId);
      if (!record || record.cwd !== cwd) throw new Error("missing");
      return record;
    },
  };
  return { root: await realpath(root), records, adapter };
}

afterEach(async () => {
  await Promise.all(
    cleanup.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("ChatService", () => {
  it("resolves canonical roots and preserves DTO, ownership, sequence and abort restoration", async () => {
    const { root, records, adapter } = await fixture();
    const service = new ChatService(
      async (worktreeId) => (worktreeId === "w1" ? root : `${root}/missing`),
      { adapter },
    );
    const summary = await service.create("w1");
    expect(summary).toMatchObject({
      sessionId: "s1",
      worktreeId: "w1",
      title: "Chat",
    });

    const events: unknown[] = [];
    const snapshot = await service.attach("w1", "s1", (event) =>
      events.push(event),
    );
    expect(snapshot).toEqual({
      sessionId: "s1",
      worktreeId: "w1",
      sequence: 0,
      status: "idle",
      items: [],
      queue: [],
      error: null,
    });

    const session = records.get("s1")?.session as FakeSession;
    session.emit({ type: "agent_start" });
    session.emit({ type: "agent_end", messages: [{ content: "secret" }] });
    session.emit({ type: "agent_settled" });
    expect(events).toEqual([
      { sessionId: "s1", sequence: 1, event: { type: "agent_start" } },
      { sessionId: "s1", sequence: 2, event: { type: "agent_end" } },
      { sessionId: "s1", sequence: 3, event: { type: "agent_settled" } },
    ]);
    expect(JSON.stringify(events)).not.toContain("secret");

    await expect(service.send("other", "s1", "hello")).rejects.toMatchObject({
      code: "CHAT_SESSION_NOT_FOUND",
    });
    expect(await service.send("w1", "s1", "hello")).toEqual({ accepted: true });
    expect(await service.abort("w1", "s1")).toEqual({
      accepted: true,
      restored: ["steer", "queued"],
    });
    expect(session.calls).toEqual([
      ["send", "hello"],
      ["clearQueue"],
      ["abort"],
    ]);
  });

  it("returns config and applies model and thinking mutations only while idle", async () => {
    const { root, records, adapter } = await fixture();
    const service = new ChatService(() => root, { adapter });
    await service.create("w1");
    const session = records.get("s1")?.session as FakeSession;

    await expect(service.config("other", "s1")).rejects.toMatchObject({
      code: "CHAT_SESSION_NOT_FOUND",
    });
    await expect(service.config("w1", "s1")).resolves.toMatchObject({
      model: { provider: "traex", id: "reasoning-model" },
    });
    await expect(
      service.setModel("w1", "s1", "traex", "reasoning-model"),
    ).resolves.toMatchObject({ model: { id: "reasoning-model" } });
    await expect(
      service.setThinkingLevel("w1", "s1", "high"),
    ).resolves.toMatchObject({ thinkingLevel: "medium" });

    session.isIdle = false;
    await expect(
      service.setThinkingLevel("w1", "s1", "low"),
    ).rejects.toMatchObject({ code: "CHAT_SESSION_BUSY" });
  });

  it("handles native slash controls without adding them to the transcript", async () => {
    const { root, records, adapter } = await fixture();
    const service = new ChatService(() => root, { adapter });
    await service.create("w1");
    const session = records.get("s1")?.session as FakeSession;

    await expect(
      service.send("w1", "s1", "/model traex/reasoning-model"),
    ).resolves.toEqual({ accepted: true });
    await expect(service.send("w1", "s1", "/thinking high")).resolves.toEqual({
      accepted: true,
    });
    await service.send("w1", "s1", "/skill:security src");

    expect(session.calls).toContainEqual([
      "setModel",
      "traex",
      "reasoning-model",
    ]);
    expect(session.calls).toContainEqual(["setThinkingLevel", "high"]);
    expect(session.calls).toContainEqual(["send", "/skill:security src"]);
    expect(session.calls).not.toContainEqual([
      "send",
      "/model traex/reasoning-model",
    ]);
    await expect(
      service.send("w1", "s1", "/thinking turbo"),
    ).rejects.toMatchObject({
      code: "CHAT_FAILED",
    });
  });

  it("uses a snapshot fence and flushes only events newer than it", async () => {
    const { root, records, adapter } = await fixture();
    const service = new ChatService(() => root, { adapter });
    await service.create("w1");
    const session = records.get("s1")?.session as FakeSession;
    let release: () => void = () => undefined;
    let started: () => void = () => undefined;
    const reading = new Promise<void>((resolve) => {
      started = resolve;
    });
    session.messageStarted = started;
    session.messageGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const events: unknown[] = [];
    const attaching = service.attach("w1", "s1", (event) => events.push(event));
    await reading;
    session.emit({ type: "agent_start" });
    release();

    const snapshot = await attaching;
    expect(snapshot.sequence).toBe(0);
    expect(events).toEqual([
      { sessionId: "s1", sequence: 1, event: { type: "agent_start" } },
    ]);
  });

  it("bounds detached events at 512 and requires a fresh attach after overflow", async () => {
    const { root, records, adapter } = await fixture();
    const service = new ChatService(() => root, { adapter });
    await service.create("w1");
    const session = records.get("s1")?.session as FakeSession;
    for (let index = 0; index < 513; index += 1)
      session.emit({ type: "agent_start" });

    await expect(service.send("w1", "s1", "hello")).rejects.toMatchObject({
      code: "CHAT_PROTOCOL_ERROR",
    });
    await expect(
      service.attach("w1", "s1", () => undefined),
    ).resolves.toMatchObject({
      sessionId: "s1",
      sequence: 513,
    });
  });

  it("disposes worktree sessions and permits ownership to be established again", async () => {
    const { root, records, adapter } = await fixture();
    const service = new ChatService(() => root, { adapter });
    await service.create("w1");
    const original = records.get("s1")?.session as FakeSession;

    await service.closeWorktree("w1");
    expect(original.calls).toContainEqual(["dispose"]);

    const listed = await service.list("w2");
    expect(listed[0]).toMatchObject({ sessionId: "s1", worktreeId: "w2" });
  });

  it("redacts auth/model failures and validates UTF-8 prompt bytes", async () => {
    const { root, adapter } = await fixture();
    const authAdapter: PiAdapter = {
      ...adapter,
      create: async () => {
        throw new Error("API key secret-123 missing");
      },
    };
    const service = new ChatService(() => root, { adapter: authAdapter });
    await expect(service.create("w1")).rejects.toMatchObject({
      code: "CHAT_AUTH_REQUIRED",
      message: "Agent authentication is required",
    });

    const normal = new ChatService(() => root, { adapter });
    await normal.create("w1");
    await expect(
      normal.send("w1", "s1", `${"é".repeat(32 * 1024)}a`),
    ).rejects.toMatchObject({
      code: "CHAT_FAILED",
      message: "Chat message exceeds 64 KiB",
    });
  });
});
