import type { TerminalMessage, TerminalOutput } from "../../bindings";

type Subscriber = (message: TerminalMessage) => void;

const subscribers = new Map<string, Subscriber>();
const pending = new Map<string, TerminalMessage[]>();
const decoders = new Map<string, TextDecoder>();

export function decodeTerminalOutput(
  terminalId: string,
  output: TerminalOutput,
): string {
  if (typeof output === "string") return output;
  const decoder = decoders.get(terminalId) ?? new TextDecoder();
  decoders.set(terminalId, decoder);
  return decoder.decode(
    output instanceof Uint8Array ? output : new Uint8Array(output),
    { stream: true },
  );
}

export const terminalStream = {
  push(message: TerminalMessage): void {
    const subscriber = subscribers.get(message.terminalId);
    if (subscriber) subscriber(message);
    else
      pending.set(message.terminalId, [
        ...(pending.get(message.terminalId) ?? []),
        message,
      ]);
  },
  subscribe(terminalId: string, subscriber: Subscriber): () => void {
    subscribers.set(terminalId, subscriber);
    for (const message of pending.get(terminalId) ?? []) subscriber(message);
    pending.delete(terminalId);
    return () => {
      if (subscribers.get(terminalId) === subscriber)
        subscribers.delete(terminalId);
    };
  },
  close(terminalId: string): void {
    subscribers.delete(terminalId);
    pending.delete(terminalId);
    decoders.delete(terminalId);
  },
};
