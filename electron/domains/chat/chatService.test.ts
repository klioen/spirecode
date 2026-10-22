import { EventEmitter } from "node:events";
import { access, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  entries: unknown[] = [];
  isStreaming = false;
  isIdle = true;
  activity: string | null = null;
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
    return this.messages;
  }

  async getEntries(): Promise<unknown[]> {
    this.messageStarted?.();
    await this.messageGate;
    return this.entries;
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

  setSessionName(title: string): void {
    this.calls.push(["setSessionName", title]);
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
  const sessionRoot = path.join(root, "sessions");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(sessionRoot));
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
        path: path.join(sessionRoot, `${session.sessionId}.jsonl`),
      };
      await writeFile(record.path, "{}\n");
      records.set(record.sessionId, record);
      return record;
    },
    async list(cwd) {
      return [...records.values()]
        .filter((record) => record.cwd === cwd)
        .map(
          ({ sessionId, title, createdAt, updatedAt, path: sessionPath }) => ({
            sessionId,
            cwd,
            title,
            createdAt,
            updatedAt,
            path: sessionPath ?? path.join(sessionRoot, `${sessionId}.jsonl`),
          }),
        );
    },
    async resolveDeleteTarget(cwd, sessionId) {
      const info = (await this.list(cwd)).find(
        (candidate) => candidate.sessionId === sessionId,
      );
      if (!info) throw new Error("missing");
      return { info, sessionRoot };
    },
    async rename(info, cwd, title) {
      const record = records.get(info.sessionId);
      if (!record || record.cwd !== cwd) throw new Error("missing");
      record.title = title;
      record.updatedAt = Date.now();
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
  it("keeps ordinary create behavior and forwards custom tools only when provided", async () => {
    const { root, adapter } = await fixture();
    const create = vi.spyOn(adapter, "create");
    const service = new ChatService(() => root, { adapter });

    await service.create("w1");
    const customTools = [{ name: "task_report" }];
    await service.create("w1", { customTools });

    expect(create).toHaveBeenNthCalledWith(1, root);
    expect(create).toHaveBeenNthCalledWith(2, root, { customTools });
  });

  it("resolves a session file only within the adapter-owned session root", async () => {
    const { root, records, adapter } = await fixture();
    const service = new ChatService(() => root, { adapter });
    const created = await service.create("w1");

    await expect(service.sessionPath("w1", created.sessionId)).resolves.toBe(
      await realpath(records.get(created.sessionId)!.path!),
    );
  });

  it("can durably name a newly loaded session before list discovery", async () => {
    const { root, records, adapter } = await fixture();
    const service = new ChatService(() => root, { adapter });
    const created = await service.create("w1", { sessionId: "task-run-1" });

    const renamed = await service.nameLoadedSession(
      "w1",
      created.sessionId,
      "SpireCode Task task-run-1",
    );

    expect(renamed.title).toBe("SpireCode Task task-run-1");
    expect(
      (records.get(created.sessionId)?.session as FakeSession).calls,
    ).toContainEqual(["setSessionName", "SpireCode Task task-run-1"]);
  });

  it("notifies multiple internal observers alongside the Renderer subscriber", async () => {
    const { root, records, adapter } = await fixture();
    const first: unknown[] = [];
    const second: unknown[] = [];
    const renderer: unknown[] = [];
    const service = new ChatService(() => root, { adapter });
    const created = await service.create("w1", {
      onEvent: (event) => first.push(event),
    });

    await service.ensureLoaded("w1", created.sessionId, {
      onEvent: (event) => second.push(event),
    });
    await service.attach("w1", created.sessionId, (event) =>
      renderer.push(event),
    );
    const session = records.get(created.sessionId)?.session as FakeSession;
    session.emit({ type: "agent_end", messages: [{ content: "private" }] });

    expect(first).toEqual([{ type: "agent_end" }]);
    expect(second).toEqual([{ type: "agent_end" }]);
    expect(renderer).toEqual([
      {
        sessionId: created.sessionId,
        sequence: 1,
        event: { type: "agent_end" },
      },
    ]);

    await service.closeWorktree("w1");
    session.emit({ type: "agent_start" });
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
  });

  it("loads an internal session without occupying the Renderer subscriber", async () => {
    const { root, records, adapter } = await fixture();
    const seed = await adapter.create(root);
    const open = vi.spyOn(adapter, "open");
    const service = new ChatService(() => root, { adapter });
    const internal: unknown[] = [];
    const renderer: unknown[] = [];
    const customTools = [{ name: "task_report" }];

    await service.ensureLoaded("w1", seed.sessionId, {
      customTools,
      onEvent: (event) => internal.push(event),
    });
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: seed.sessionId }),
      root,
      { customTools },
    );
    await service.attach("w1", seed.sessionId, (event) => renderer.push(event));
    (records.get(seed.sessionId)?.session as FakeSession).emit({
      type: "agent_start",
    });

    expect(internal).toEqual([{ type: "agent_start" }]);
    expect(renderer).toEqual([
      {
        sessionId: seed.sessionId,
        sequence: 1,
        event: { type: "agent_start" },
      },
    ]);
  });

  it("reopens an idle session with replacement tools while preserving the Renderer subscriber", async () => {
    const { root, records, adapter } = await fixture();
    const open = vi.spyOn(adapter, "open");
    const service = new ChatService(() => root, { adapter });
    const created = await service.create("w1", {
      customTools: [{ name: "old_report" }],
    });
    const renderer: unknown[] = [];
    await service.attach("w1", created.sessionId, (event) =>
      renderer.push(event),
    );
    (records.get(created.sessionId)?.session as FakeSession).emit({
      type: "agent_settled",
    });
    const customTools = [{ name: "new_report" }];

    await service.rebindSessionTools("w1", created.sessionId, {
      customTools,
    });

    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: created.sessionId }),
      root,
      { customTools },
    );
    (records.get(created.sessionId)?.session as FakeSession).emit({
      type: "agent_start",
    });
    expect(renderer.at(-1)).toEqual(
      expect.objectContaining({
        sessionId: created.sessionId,
        sequence: 2,
        event: { type: "agent_start" },
      }),
    );
  });

  it("finds a marker recursively in loaded messages and entries", async () => {
    const { root, records, adapter } = await fixture();
    const service = new ChatService(() => root, { adapter });
    const created = await service.create("w1");
    const session = records.get(created.sessionId)?.session as FakeSession;
    session.messages = [{ role: "user", content: [{ text: "run:alpha" }] }];
    session.entries = [{ data: { nested: ["prefix marker:beta suffix"] } }];

    await expect(
      service.sessionContainsText("w1", created.sessionId, "run:alpha"),
    ).resolves.toBe(true);
    await expect(
      service.sessionContainsText("w1", created.sessionId, "marker:beta"),
    ).resolves.toBe(true);
    await expect(
      service.sessionContainsText("w1", created.sessionId, "missing"),
    ).resolves.toBe(false);
  });

  it("renames a loaded session through the active Pi session", async () => {
    const { root, records, adapter } = await fixture();
    const service = new ChatService(() => root, { adapter });
    const created = await service.create("w1");
    const renamed = await service.rename(
      "w1",
      created.sessionId,
      "  Release notes  ",
    );

    expect(renamed).toMatchObject({
      title: "Release notes",
      updatedAt: created.updatedAt,
    });
    expect(records.get(created.sessionId)?.session).toMatchObject({
      calls: expect.arrayContaining([["setSessionName", "Release notes"]]),
    });
  });

  it("accepts titles up to 200 Unicode code points", async () => {
    const { root, adapter } = await fixture();
    const service = new ChatService(() => root, { adapter });
    const created = await service.create("w1");
    const title = "😀".repeat(200);

    await expect(
      service.rename("w1", created.sessionId, title),
    ).resolves.toMatchObject({ title });
  });

  it("renames an unloaded session without creating an Agent session", async () => {
    const { root, records, adapter } = await fixture();
    const sessionPath = path.join(root, "sessions", "existing.jsonl");
    await writeFile(sessionPath, "{}\n");
    records.set("existing", {
      session: new FakeSession("existing"),
      sessionId: "existing",
      cwd: root,
      title: "Before",
      createdAt: 10,
      updatedAt: 20,
    });
    vi.spyOn(adapter, "list").mockResolvedValueOnce([
      {
        sessionId: "existing",
        cwd: root,
        title: "Before",
        path: sessionPath,
        createdAt: 10,
        updatedAt: 20,
      },
    ]);
    const rename = vi.spyOn(adapter, "rename");
    const service = new ChatService(() => root, { adapter });

    const renamed = await service.rename("w1", "existing", "After");

    expect(rename).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "existing", path: sessionPath }),
      root,
      "After",
    );
    expect(renamed).toMatchObject({
      sessionId: "existing",
      title: "After",
      createdAt: 10,
      updatedAt: 20,
    });
  });

  it("rejects loaded sessions owned by another worktree", async () => {
    const { root, adapter } = await fixture();
    const service = new ChatService(() => root, { adapter });
    const created = await service.create("w1");

    await expect(
      service.rename("w2", created.sessionId, "Other"),
    ).rejects.toMatchObject({ code: "CHAT_SESSION_NOT_FOUND" });
  });

  it("rejects a loaded session when its resolved file no longer matches", async () => {
    const { root, records, adapter } = await fixture();
    const service = new ChatService(() => root, { adapter });
    const created = await service.create("w1");
    const replacementPath = path.join(root, "sessions", "replacement.jsonl");
    await writeFile(replacementPath, "{}\n");
    records.get(created.sessionId)!.path = replacementPath;

    await expect(
      service.rename("w1", created.sessionId, "Other"),
    ).rejects.toMatchObject({ code: "CHAT_SESSION_NOT_FOUND" });
  });

  it("rejects unloaded session paths outside the Pi session root", async () => {
    const { root, records, adapter } = await fixture();
    const outside = path.join(
      os.tmpdir(),
      `outside-session-${Date.now()}.jsonl`,
    );
    await writeFile(outside, "{}\n");
    cleanup.push(outside);
    records.set("outside-rename", {
      session: new FakeSession("outside-rename"),
      sessionId: "outside-rename",
      cwd: root,
      title: "Before",
      createdAt: 10,
      updatedAt: 20,
    });
    vi.spyOn(adapter, "list").mockResolvedValueOnce([
      {
        sessionId: "outside-rename",
        cwd: root,
        title: "Before",
        path: outside,
        createdAt: 10,
        updatedAt: 20,
      },
    ]);
    const rename = vi.spyOn(adapter, "rename");
    const service = new ChatService(() => root, { adapter });

    await expect(
      service.rename("w1", "outside-rename", "After"),
    ).rejects.toMatchObject({ code: "CHAT_SESSION_NOT_FOUND" });
    expect(rename).not.toHaveBeenCalled();
  });

  it.each(["", "   ", "bad\nname", "bad\u0085name", "x".repeat(201)])(
    "rejects an invalid session title %j",
    async (title) => {
      const { root, adapter } = await fixture();
      const service = new ChatService(() => root, { adapter });
      const created = await service.create("w1");
      await expect(
        service.rename("w1", created.sessionId, title),
      ).rejects.toMatchObject({
        code: "CHAT_FAILED",
      });
    },
  );

  it("moves an idle session to trash and disposes a loaded runtime", async () => {
    const { root, records, adapter } = await fixture();
    const trashed: string[] = [];
    const service = new ChatService(() => root, {
      adapter,
      trashItem: async (sessionPath) => {
        trashed.push(sessionPath);
        await rm(sessionPath);
      },
    });
    const summary = await service.create("w1");
    const record = records.get(summary.sessionId)!;
    const sessionPath = path.join(
      root,
      "sessions",
      `${summary.sessionId}.jsonl`,
    );
    await writeFile(sessionPath, "{}\n");
    vi.spyOn(adapter, "list").mockResolvedValueOnce([
      {
        sessionId: summary.sessionId,
        cwd: root,
        title: record.title,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        path: sessionPath,
      },
    ]);

    await service.delete("w1", summary.sessionId);

    expect(trashed).toEqual([
      await realpath(path.dirname(sessionPath)).then((dir) =>
        path.join(dir, path.basename(sessionPath)),
      ),
    ]);
    await expect(access(sessionPath)).rejects.toThrow();
    expect((record.session as FakeSession).calls).toContainEqual(["dispose"]);
    await expect(service.config("w1", summary.sessionId)).rejects.toMatchObject(
      {
        code: "CHAT_SESSION_NOT_FOUND",
      },
    );
  });

  it("rejects deleting busy sessions and preserves a session when trash fails", async () => {
    const { root, records, adapter } = await fixture();
    const service = new ChatService(() => root, {
      adapter,
      trashItem: async () => {
        throw new Error("trash failed");
      },
    });
    const summary = await service.create("w1");
    const record = records.get(summary.sessionId)!;
    const session = record.session as FakeSession;
    const sessionPath = path.join(
      root,
      "sessions",
      `${summary.sessionId}.jsonl`,
    );
    await writeFile(sessionPath, "{}\n");
    vi.spyOn(adapter, "list").mockResolvedValue([
      {
        sessionId: summary.sessionId,
        cwd: root,
        title: record.title,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        path: sessionPath,
      },
    ]);

    session.isIdle = false;
    session.isStreaming = true;
    await expect(service.delete("w1", summary.sessionId)).rejects.toMatchObject(
      {
        code: "CHAT_SESSION_BUSY",
      },
    );
    session.isIdle = true;
    session.isStreaming = false;
    await expect(service.delete("w1", summary.sessionId)).rejects.toMatchObject(
      {
        code: "CHAT_FAILED",
        message: "Unable to move chat session to Trash",
      },
    );
    await expect(access(sessionPath)).resolves.toBeUndefined();
    await expect(
      service.attach("w1", summary.sessionId, () => undefined),
    ).resolves.toMatchObject({
      sessionId: summary.sessionId,
    });
  });

  it("rejects session paths outside the resolved worktree listing", async () => {
    const { root, adapter } = await fixture();
    const outside = path.join(os.tmpdir(), "outside-session.jsonl");
    await writeFile(outside, "{}\n");
    cleanup.push(outside);
    vi.spyOn(adapter, "resolveDeleteTarget").mockResolvedValue({
      info: {
        sessionId: "outside",
        cwd: root,
        title: "Outside",
        createdAt: 1,
        updatedAt: 1,
        path: outside,
      },
      sessionRoot: path.join(root, "sessions"),
    });
    const trashItem = vi.fn();
    const service = new ChatService(() => root, { adapter, trashItem });

    await expect(service.delete("w1", "outside")).rejects.toMatchObject({
      code: "CHAT_SESSION_NOT_FOUND",
    });
    expect(trashItem).not.toHaveBeenCalled();
  });

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
      activity: null,
      error: null,
    });

    const session = records.get("s1")?.session as FakeSession;
    session.emit({
      type: "entry_appended",
      entry: {
        type: "custom",
        id: "todo-1",
        customType: "pi-todo-state",
        data: { todos: [{ id: "a", step: "Inspect", status: "pending" }] },
      },
    });
    session.emit({ type: "agent_start" });
    session.emit({
      type: "extension_status",
      message: "TraeX is waiting for model capacity · position 362",
    });
    session.emit({ type: "agent_end", messages: [{ content: "secret" }] });
    session.emit({ type: "agent_settled" });
    expect(events).toEqual([
      {
        sessionId: "s1",
        sequence: 1,
        event: {
          type: "todo_update",
          todo: {
            id: "todo-1",
            todos: [{ id: "a", step: "Inspect", status: "pending" }],
          },
        },
      },
      { sessionId: "s1", sequence: 2, event: { type: "agent_start" } },
      {
        sessionId: "s1",
        sequence: 3,
        event: {
          type: "extension_status",
          message: "TraeX is waiting for model capacity · position 362",
        },
      },
      { sessionId: "s1", sequence: 4, event: { type: "agent_end" } },
      { sessionId: "s1", sequence: 5, event: { type: "agent_settled" } },
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

  it("does not inject Task Skill instructions into ordinary Chat messages", async () => {
    const { root, records, adapter } = await fixture();
    const service = new ChatService(() => root, { adapter });
    await service.create("w1");
    const session = records.get("s1")?.session as FakeSession;
    const text = "Review the provided PR and give me a report.";
    await service.send("w1", "s1", text);
    expect(session.calls.filter(([operation]) => operation === "send")).toEqual(
      [["send", text]],
    );
    await service.disposeAll();
  });

  it("allows bounded Main Task inputs without widening ordinary Chat or ownership checks", async () => {
    const { root, records, adapter } = await fixture();
    const service = new ChatService(() => root, { adapter });
    await service.create("w1");
    const session = records.get("s1")?.session as FakeSession;
    const text = "x".repeat(64 * 1024 + 1);
    await expect(service.send("w1", "s1", text)).rejects.toMatchObject({
      code: "CHAT_FAILED",
      message: "Chat message exceeds 64 KiB",
    });
    await expect(
      service.sendTaskInput("other", "s1", text),
    ).rejects.toMatchObject({ code: "CHAT_SESSION_NOT_FOUND" });
    await expect(
      service.sendTaskInput("w1", "s1", "x".repeat(1024 * 1024 + 1)),
    ).rejects.toMatchObject({ code: "CHAT_FAILED" });
    await expect(service.sendTaskInput("w1", "s1", text)).resolves.toEqual({
      accepted: true,
    });
    expect(session.calls.filter(([operation]) => operation === "send")).toEqual(
      [["send", text]],
    );
    await service.disposeAll();
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

  it("restores current extension activity in a fresh attachment snapshot", async () => {
    const { root, records, adapter } = await fixture();
    const service = new ChatService(() => root, { adapter });
    await service.create("w1");
    const session = records.get("s1")?.session as FakeSession;

    session.emit({
      type: "extension_status",
      message: "TraeX is waiting for model capacity · position 362",
    });

    await expect(
      service.attach("w1", "s1", () => undefined),
    ).resolves.toMatchObject({
      activity: "TraeX is waiting for model capacity · position 362",
    });
  });

  it("restores todo entries from the active branch snapshot", async () => {
    const { root, records, adapter } = await fixture();
    const service = new ChatService(() => root, { adapter });
    await service.create("w1");
    const session = records.get("s1")?.session as FakeSession;
    session.entries = [
      {
        type: "custom",
        id: "todo-history",
        customType: "pi-todo-state",
        data: { todos: [{ id: "a", step: "Inspect", status: "completed" }] },
      },
    ];

    await expect(
      service.attach("w1", "s1", () => undefined),
    ).resolves.toMatchObject({
      items: [
        {
          type: "todo",
          id: "todo-history",
          todos: [{ id: "a", step: "Inspect", status: "completed" }],
        },
      ],
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

  it("treats detach cleanup as idempotent without weakening ownership", async () => {
    const { root, adapter } = await fixture();
    const service = new ChatService(() => root, { adapter });

    expect(() => service.detach("w1", "missing")).not.toThrow();
    await service.create("w1");
    expect(() => service.detach("w1", "s1")).not.toThrow();
    expect(() => service.detach("w1", "s1")).not.toThrow();
    expect(() => service.detach("other", "s1")).toThrowError(
      expect.objectContaining({ code: "CHAT_SESSION_NOT_FOUND" }),
    );
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
