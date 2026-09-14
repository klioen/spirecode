import { randomUUID } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import * as nodePty from "node-pty";
import type { IDisposable, IPty } from "node-pty";
import type {
  TerminalMessage,
  TerminalOutput,
  TerminalSummary,
} from "../../../src/bindings/generated.js";
import { CommandError } from "../../core/errors.js";

const MIN_DIMENSION = 1;
const MAX_DIMENSION = 1000;
const BATCH_WINDOW_MS = 6;
const MAX_PENDING_BYTES = 1024 * 1024;

export type RootResolver = (worktreeId: string) => string | Promise<string>;
export type TerminalEventSubscriber = (
  subscriptionId: string,
  message: TerminalMessage,
) => void;

type OutputChunk = string | Uint8Array;

interface Session {
  summary: TerminalSummary;
  pty: IPty;
  subscriptionId?: string;
  pending: TerminalOutput[];
  pendingBytes: number;
  outputChunks: OutputChunk[];
  outputTimer?: ReturnType<typeof setTimeout>;
  exitCode?: number | null;
  exited: boolean;
  disposables: IDisposable[];
}

export class TerminalService {
  private readonly sessions = new Map<string, Session>();
  private disposed = false;

  constructor(
    private readonly rootResolver: RootResolver,
    private readonly emit: TerminalEventSubscriber,
  ) {}

  async create(
    worktreeId: string,
    cols: number,
    rows: number,
  ): Promise<TerminalSummary> {
    this.assertActive();
    validateSize(cols, rows);
    const cwd = await this.rootResolver(worktreeId);
    this.assertActive();

    let pty: IPty;
    try {
      pty = nodePty.spawn(validShell(), [], {
        name: "xterm-256color",
        cols,
        rows,
        cwd,
        env: { ...process.env },
        encoding: null,
      });
    } catch (error) {
      throw terminalError(error);
    }

    const terminalId = randomUUID();
    const summary: TerminalSummary = { terminalId, worktreeId, cols, rows };
    const session: Session = {
      summary,
      pty,
      pending: [],
      pendingBytes: 0,
      outputChunks: [],
      exited: false,
      disposables: [],
    };
    this.sessions.set(terminalId, session);

    session.disposables.push(
      pty.onData((data) =>
        this.receiveOutput(terminalId, data as unknown as OutputChunk),
      ),
      pty.onExit(({ exitCode }) => this.receiveExit(terminalId, exitCode)),
    );
    return { ...summary };
  }

  attach(terminalId: string, subscriptionId: string): void {
    this.assertActive();
    if (!subscriptionId) {
      throw new CommandError("INVALID_ARGUMENT", "subscription id is required");
    }
    const session = this.session(terminalId);
    session.subscriptionId = subscriptionId;

    const pending = session.pending;
    session.pending = [];
    session.pendingBytes = 0;
    for (let index = 0; index < pending.length; index += 1) {
      if (!this.deliver(session, outputMessage(terminalId, pending[index]))) {
        for (const value of pending.slice(index))
          this.bufferPending(session, value);
        return;
      }
    }
    if (session.exited) {
      this.deliver(session, exitMessage(terminalId, session.exitCode));
    }
  }

  detach(terminalId: string, subscriptionId?: string): void {
    this.assertActive();
    const session = this.session(terminalId);
    if (
      subscriptionId === undefined ||
      session.subscriptionId === subscriptionId
    ) {
      session.subscriptionId = undefined;
    }
  }

  write(terminalId: string, data: string): void {
    this.assertActive();
    const session = this.session(terminalId);
    if (session.exited) throw terminalError("terminal has exited");
    try {
      session.pty.write(data);
    } catch (error) {
      throw terminalError(error);
    }
  }

  resize(terminalId: string, cols: number, rows: number): void {
    this.assertActive();
    validateSize(cols, rows);
    const session = this.session(terminalId);
    try {
      session.pty.resize(cols, rows);
    } catch (error) {
      throw terminalError(error);
    }
    session.summary.cols = cols;
    session.summary.rows = rows;
  }

  close(terminalId: string, force = false): void {
    this.assertActive();
    const session = this.session(terminalId);
    if (!force && !session.exited) {
      throw new CommandError("TERMINAL_FAILED", "terminal is still running", {
        busy: "true",
      });
    }
    this.sessions.delete(terminalId);
    this.destroySession(session, !session.exited);
  }

  list(worktreeId?: string): TerminalSummary[] {
    this.assertActive();
    return [...this.sessions.values()]
      .filter(
        (session) =>
          worktreeId === undefined || session.summary.worktreeId === worktreeId,
      )
      .map((session) => ({ ...session.summary }));
  }

  countWorktree(worktreeId: string): number {
    this.assertActive();
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.summary.worktreeId === worktreeId && !session.exited)
        count += 1;
    }
    return count;
  }

  closeWorktree(worktreeId: string): void {
    this.assertActive();
    for (const [terminalId, session] of this.sessions) {
      if (session.summary.worktreeId !== worktreeId) continue;
      this.sessions.delete(terminalId);
      this.destroySession(session, !session.exited);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const session of this.sessions.values()) {
      this.destroySession(session, !session.exited);
    }
    this.sessions.clear();
  }

  private receiveOutput(terminalId: string, value: OutputChunk): void {
    const session = this.sessions.get(terminalId);
    if (!session || session.exited) return;
    const chunk = normalizeChunk(value);
    if (chunk.length === 0) return;
    session.outputChunks.push(chunk);
    session.outputTimer ??= setTimeout(
      () => this.flushOutput(terminalId),
      BATCH_WINDOW_MS,
    );
  }

  private receiveExit(terminalId: string, exitCode: number): void {
    const session = this.sessions.get(terminalId);
    if (!session || session.exited) return;
    this.flushOutput(terminalId);
    session.exited = true;
    session.exitCode = Number.isInteger(exitCode) ? exitCode : null;
    this.deliver(session, exitMessage(terminalId, session.exitCode));
  }

  private flushOutput(terminalId: string): void {
    const session = this.sessions.get(terminalId);
    if (!session) return;
    if (session.outputTimer !== undefined) clearTimeout(session.outputTimer);
    session.outputTimer = undefined;
    if (session.outputChunks.length === 0) return;

    const data = mergeChunks(session.outputChunks);
    session.outputChunks = [];
    if (!this.deliver(session, outputMessage(terminalId, data)))
      this.bufferPending(session, data);
  }

  private bufferPending(session: Session, data: TerminalOutput): void {
    session.pending.push(data);
    session.pendingBytes += outputBytes(data);
    while (
      session.pendingBytes > MAX_PENDING_BYTES &&
      session.pending.length > 1
    ) {
      const removed = session.pending.shift();
      if (removed !== undefined) session.pendingBytes -= outputBytes(removed);
    }
    const first = session.pending[0];
    if (first !== undefined && session.pendingBytes > MAX_PENDING_BYTES) {
      session.pending = [tailOutput(first, MAX_PENDING_BYTES)];
      session.pendingBytes = outputBytes(session.pending[0]);
    }
  }

  private deliver(session: Session, message: TerminalMessage): boolean {
    const subscriptionId = session.subscriptionId;
    if (!subscriptionId) return false;
    try {
      this.emit(subscriptionId, message);
      return true;
    } catch {
      if (session.subscriptionId === subscriptionId)
        session.subscriptionId = undefined;
      return false;
    }
  }

  private destroySession(session: Session, kill: boolean): void {
    if (session.outputTimer !== undefined) clearTimeout(session.outputTimer);
    session.outputTimer = undefined;
    session.outputChunks = [];
    session.subscriptionId = undefined;
    for (const disposable of session.disposables) disposable.dispose();
    session.disposables = [];
    if (kill) {
      try {
        session.pty.kill();
      } catch {
        // The child may have exited between the registry check and kill.
      }
    }
  }

  private session(terminalId: string): Session {
    const session = this.sessions.get(terminalId);
    if (!session)
      throw new CommandError("TERMINAL_NOT_FOUND", "terminal not found");
    return session;
  }

  private assertActive(): void {
    if (this.disposed) throw terminalError("terminal service is disposed");
  }
}

function outputBytes(value: TerminalOutput): number {
  return typeof value === "string"
    ? Buffer.byteLength(value, "utf8")
    : value.length;
}

function tailOutput(value: TerminalOutput, bytes: number): TerminalOutput {
  if (typeof value === "string")
    return Buffer.from(value, "utf8").subarray(-bytes).toString("utf8");
  return Array.from(value).slice(-bytes);
}

function outputMessage(
  terminalId: string,
  data: TerminalOutput,
): TerminalMessage {
  return { type: "output", terminalId, data };
}

function exitMessage(
  terminalId: string,
  exitCode?: number | null,
): TerminalMessage {
  return { type: "exit", terminalId, exitCode };
}

function normalizeChunk(value: OutputChunk): OutputChunk {
  if (typeof value === "string") return value;
  return Uint8Array.from(value);
}

function mergeChunks(chunks: OutputChunk[]): TerminalOutput {
  if (chunks.every((chunk) => typeof chunk === "string"))
    return chunks.join("");
  const bytes = chunks.map((chunk) =>
    typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk,
  );
  const length = bytes.reduce((total, chunk) => total + chunk.byteLength, 0);
  const merged = new Uint8Array(length);
  let offset = 0;
  for (const chunk of bytes) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return [...merged];
}

function validateSize(cols: number, rows: number): void {
  if (
    Number.isInteger(cols) &&
    Number.isInteger(rows) &&
    cols >= MIN_DIMENSION &&
    cols <= MAX_DIMENSION &&
    rows >= MIN_DIMENSION &&
    rows <= MAX_DIMENSION
  ) {
    return;
  }
  throw new CommandError(
    "INVALID_ARGUMENT",
    "terminal dimensions must be integers between 1 and 1000",
  );
}

function validShell(): string {
  const configured = process.env.SHELL;
  if (configured && path.isAbsolute(configured) && isFile(configured))
    return configured;
  if (isFile("/bin/zsh")) return "/bin/zsh";
  return "/bin/sh";
}

function isFile(candidate: string): boolean {
  try {
    return existsSync(candidate) && statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function terminalError(error: unknown): CommandError {
  return new CommandError(
    "TERMINAL_FAILED",
    error instanceof Error ? error.message : String(error),
  );
}
