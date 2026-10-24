import type { TerminalMessage, TerminalOutput } from "../../bindings";

type Subscriber = (message: TerminalMessage) => void;
type OutputMessage = Extract<TerminalMessage, { type: "output" }>;
type LifecycleMessage = Exclude<TerminalMessage, OutputMessage>;

interface TerminalHistory {
  output: OutputMessage[];
  bytes: number;
  lifecycle?: LifecycleMessage;
}

const MAX_HISTORY_BYTES = 1024 * 1024;
const subscribers = new Map<string, Subscriber>();
const histories = new Map<string, TerminalHistory>();
const decoders = new Map<
  string,
  ReturnType<typeof createTerminalOutputDecoder>
>();
const encoder = new TextEncoder();

function outputBytes(output: TerminalOutput): number {
  if (typeof output === "string") return encoder.encode(output).byteLength;
  return output instanceof Uint8Array ? output.byteLength : output.length;
}

function historyFor(terminalId: string): TerminalHistory {
  const existing = histories.get(terminalId);
  if (existing) return existing;
  const created: TerminalHistory = { output: [], bytes: 0 };
  histories.set(terminalId, created);
  return created;
}

function remember(message: TerminalMessage): void {
  const history = historyFor(message.terminalId);
  if (message.type !== "output") {
    history.lifecycle = message;
    return;
  }
  history.output.push(message);
  history.bytes += outputBytes(message.data);
  while (history.bytes > MAX_HISTORY_BYTES && history.output.length > 1) {
    const removed = history.output.shift();
    if (removed) history.bytes -= outputBytes(removed.data);
  }
}

export function createTerminalOutputDecoder(): (
  output: TerminalOutput,
) => string {
  const decoder = new TextDecoder();
  return (output) => {
    if (typeof output === "string") return output;
    return decoder.decode(
      output instanceof Uint8Array ? output : new Uint8Array(output),
      { stream: true },
    );
  };
}

export function decodeTerminalOutput(
  terminalId: string,
  output: TerminalOutput,
): string {
  const decode = decoders.get(terminalId) ?? createTerminalOutputDecoder();
  decoders.set(terminalId, decode);
  return decode(output);
}

export const terminalStream = {
  push(message: TerminalMessage): void {
    remember(message);
    subscribers.get(message.terminalId)?.(message);
  },
  subscribe(
    terminalId: string,
    subscriber: Subscriber,
  ): { replay: TerminalMessage[]; unsubscribe: () => void } {
    subscribers.set(terminalId, subscriber);
    const history = histories.get(terminalId);
    const replay: TerminalMessage[] = history ? [...history.output] : [];
    if (history?.lifecycle) replay.push(history.lifecycle);
    return {
      replay,
      unsubscribe: () => {
        if (subscribers.get(terminalId) === subscriber)
          subscribers.delete(terminalId);
      },
    };
  },
  close(terminalId: string): void {
    subscribers.delete(terminalId);
    histories.delete(terminalId);
    decoders.delete(terminalId);
  },
};
