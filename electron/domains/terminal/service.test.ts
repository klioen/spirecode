import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TerminalMessage } from "../../../src/bindings/generated.js";

interface FakePty {
  cols: number;
  rows: number;
  writes: Array<string | Buffer>;
  resize: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  emitData(data: string | Uint8Array): void;
  emitExit(exitCode: number): void;
}

const { spawned, spawn } = vi.hoisted(() => {
  const spawned: FakePty[] = [];
  const spawn = vi.fn(
    (
      _shell: string,
      _args: string[],
      options: { cols: number; rows: number },
    ) => {
      let dataListener: ((data: string | Uint8Array) => void) | undefined;
      let exitListener: ((event: { exitCode: number }) => void) | undefined;
      const pty: FakePty & Record<string, unknown> = {
        pid: 42,
        cols: options.cols,
        rows: options.rows,
        process: "shell",
        handleFlowControl: false,
        writes: [],
        write(data: string | Buffer) {
          pty.writes.push(data);
        },
        resize: vi.fn((cols: number, rows: number) => {
          pty.cols = cols;
          pty.rows = rows;
        }),
        kill: vi.fn(),
        clear: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
        onData(listener: (data: string | Uint8Array) => void) {
          dataListener = listener;
          return { dispose: vi.fn(() => (dataListener = undefined)) };
        },
        onExit(listener: (event: { exitCode: number }) => void) {
          exitListener = listener;
          return { dispose: vi.fn(() => (exitListener = undefined)) };
        },
        emitData(data: string | Uint8Array) {
          dataListener?.(data);
        },
        emitExit(exitCode: number) {
          exitListener?.({ exitCode });
        },
      };
      spawned.push(pty);
      return pty;
    },
  );
  return { spawned, spawn };
});

vi.mock("node-pty", () => ({ spawn }));

import { shellForPlatform, TerminalService } from "./service.js";

beforeEach(() => {
  vi.useFakeTimers();
  spawned.length = 0;
  spawn.mockClear();
  process.env.SHELL = "/bin/sh";
});

describe("shellForPlatform", () => {
  const existing = (candidate: string) =>
    ["/bin/bash", "/bin/sh", "C:\\Windows\\System32\\cmd.exe"].includes(
      candidate,
    );

  it("uses a valid absolute COMSPEC on Windows", () => {
    expect(
      shellForPlatform(
        "win32",
        { COMSPEC: "C:\\Windows\\System32\\cmd.exe" },
        existing,
      ),
    ).toBe("C:\\Windows\\System32\\cmd.exe");
  });

  it("rejects a relative Windows COMSPEC and uses the system cmd path", () => {
    expect(
      shellForPlatform(
        "win32",
        { COMSPEC: "cmd.exe", SystemRoot: "C:\\Windows" },
        existing,
      ),
    ).toBe("C:\\Windows\\System32\\cmd.exe");
  });

  it("fails closed when Windows has no trusted system shell", () => {
    expect(() =>
      shellForPlatform(
        "win32",
        { COMSPEC: "cmd.exe", SystemRoot: "D:\\MissingWindows" },
        existing,
      ),
    ).toThrow("Windows command interpreter");
  });

  it("uses the first available Unix shell fallback", () => {
    expect(shellForPlatform("linux", { SHELL: "bash" }, existing)).toBe(
      "/bin/bash",
    );
  });
});

describe("TerminalService", () => {
  it("creates a byte-mode PTY at the resolved worktree root and lists copies", async () => {
    const resolveRoot = vi.fn(async () => "/tmp/worktree");
    const service = new TerminalService(resolveRoot, vi.fn());

    const summary = await service.create("worktree-1", 80, 24);

    expect(resolveRoot).toHaveBeenCalledWith("worktree-1");
    expect(spawn).toHaveBeenCalledWith(
      "/bin/sh",
      [],
      expect.objectContaining({
        cwd: "/tmp/worktree",
        cols: 80,
        rows: 24,
        encoding: null,
        name: "xterm-256color",
      }),
    );
    expect(summary).toEqual({
      terminalId: expect.any(String),
      worktreeId: "worktree-1",
      cols: 80,
      rows: 24,
    });
    const listed = service.list("worktree-1");
    expect(listed).toEqual([summary]);
    listed[0].cols = 1;
    expect(service.list()[0].cols).toBe(80);
  });

  it("batches output for 6ms and replays pending bytes on attach", async () => {
    const received: Array<{
      subscriptionId: string;
      message: TerminalMessage;
    }> = [];
    const service = new TerminalService(
      () => "/tmp/worktree",
      (subscriptionId, message) => received.push({ subscriptionId, message }),
    );
    const { terminalId } = await service.create("worktree-1", 80, 24);

    spawned[0].emitData(Uint8Array.from([0xc3]));
    vi.advanceTimersByTime(5);
    spawned[0].emitData(Uint8Array.from([0xa9]));
    expect(received).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(received).toEqual([]);

    service.attach(terminalId, "subscriber-1");
    expect(received).toEqual([
      {
        subscriptionId: "subscriber-1",
        message: { type: "output", terminalId, data: [0xc3, 0xa9] },
      },
    ]);
  });

  it("detaches only the matching subscriber and buffers delivery failures", async () => {
    const received: string[] = [];
    let fail = false;
    const service = new TerminalService(
      () => "/tmp/worktree",
      (id) => {
        if (fail) throw new Error("renderer gone");
        received.push(id);
      },
    );
    const { terminalId } = await service.create("worktree-1", 80, 24);
    service.attach(terminalId, "current");
    service.detach(terminalId, "stale");

    spawned[0].emitData("one");
    vi.advanceTimersByTime(6);
    expect(received).toEqual(["current"]);

    fail = true;
    spawned[0].emitData("two");
    vi.advanceTimersByTime(6);
    fail = false;
    service.attach(terminalId, "replacement");
    expect(received).toEqual(["current", "replacement"]);
  });

  it("writes, resizes, validates dimensions, and counts only running terminals", async () => {
    const service = new TerminalService(() => "/tmp/worktree", vi.fn());
    const first = await service.create("worktree-1", 80, 24);
    await service.create("worktree-1", 100, 30);
    await service.create("worktree-2", 80, 24);

    service.write(first.terminalId, "printf ready\r");
    service.resize(first.terminalId, 120, 40);
    expect(spawned[0].writes).toEqual(["printf ready\r"]);
    expect(spawned[0].resize).toHaveBeenCalledWith(120, 40);
    expect(service.list("worktree-1")[0]).toMatchObject({
      cols: 120,
      rows: 40,
    });
    expect(service.countWorktree("worktree-1")).toBe(2);

    spawned[0].emitExit(0);
    expect(service.countWorktree("worktree-1")).toBe(1);
    expect(() => service.resize(first.terminalId, 0, 24)).toThrowError(
      expect.objectContaining({ code: "INVALID_ARGUMENT" }),
    );
  });

  it("flushes output before exit and replays the lifecycle to a late attach", async () => {
    const messages: TerminalMessage[] = [];
    const service = new TerminalService(
      () => "/tmp/worktree",
      (_subscriptionId, message) => messages.push(message),
    );
    const { terminalId } = await service.create("worktree-1", 80, 24);

    spawned[0].emitData("last");
    spawned[0].emitExit(7);
    service.attach(terminalId, "subscriber");

    expect(messages).toEqual([
      { type: "output", terminalId, data: "last" },
      { type: "exit", terminalId, exitCode: 7 },
    ]);
  });

  it("bounds detached output to the newest one MiB", async () => {
    const messages: TerminalMessage[] = [];
    const service = new TerminalService(
      () => "/tmp/worktree",
      (_subscriptionId, message) => messages.push(message),
    );
    const { terminalId } = await service.create("worktree-1", 80, 24);

    spawned[0].emitData("a".repeat(700 * 1024));
    vi.advanceTimersByTime(6);
    spawned[0].emitData("b".repeat(700 * 1024));
    vi.advanceTimersByTime(6);
    service.attach(terminalId, "subscriber");

    const output = messages
      .filter((message) => message.type === "output")
      .map((message) =>
        message.type === "output" && typeof message.data === "string"
          ? message.data
          : "",
      )
      .join("");
    expect(Buffer.byteLength(output)).toBeLessThanOrEqual(1024 * 1024);
    expect(output.endsWith("b".repeat(128))).toBe(true);
  });

  it("requires force for a running terminal and closes exited terminals without killing", async () => {
    const service = new TerminalService(() => "/tmp/worktree", vi.fn());
    const running = await service.create("worktree-1", 80, 24);
    expect(() => service.close(running.terminalId)).toThrowError(
      expect.objectContaining({
        code: "TERMINAL_FAILED",
        details: { busy: "true" },
      }),
    );

    service.close(running.terminalId, true);
    expect(spawned[0].kill).toHaveBeenCalledOnce();
    expect(service.list()).toEqual([]);

    const exited = await service.create("worktree-1", 80, 24);
    spawned[1].emitExit(0);
    service.close(exited.terminalId);
    expect(spawned[1].kill).not.toHaveBeenCalled();
  });

  it("closes a worktree and idempotently disposes every remaining PTY", async () => {
    const service = new TerminalService(() => "/tmp/worktree", vi.fn());
    await service.create("worktree-1", 80, 24);
    await service.create("worktree-1", 80, 24);
    await service.create("worktree-2", 80, 24);

    service.closeWorktree("worktree-1");
    expect(spawned[0].kill).toHaveBeenCalledOnce();
    expect(spawned[1].kill).toHaveBeenCalledOnce();
    expect(spawned[2].kill).not.toHaveBeenCalled();
    expect(service.list()).toHaveLength(1);

    service.dispose();
    service.dispose();
    expect(spawned[2].kill).toHaveBeenCalledOnce();
    expect(() => service.list()).toThrowError(
      expect.objectContaining({ code: "TERMINAL_FAILED" }),
    );
  });

  it("reports missing terminals consistently", () => {
    const service = new TerminalService(() => "/tmp/worktree", vi.fn());
    for (const operation of [
      () => service.attach("missing", "subscriber"),
      () => service.detach("missing"),
      () => service.write("missing", "x"),
      () => service.resize("missing", 80, 24),
      () => service.close("missing", true),
    ]) {
      expect(operation).toThrowError(
        expect.objectContaining({ code: "TERMINAL_NOT_FOUND" }),
      );
    }
  });
});
