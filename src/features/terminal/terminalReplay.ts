import type { TerminalMessage } from "../../bindings";
import { createTerminalOutputDecoder, terminalStream } from "./terminalStream";

interface Disposable {
  dispose(): void;
}

export interface ReplayTerminal {
  write(data: string, callback?: () => void): void;
  onData(listener: (data: string) => void): Disposable;
}

export function attachTerminalSession(
  terminalId: string,
  terminal: ReplayTerminal,
  writePty: (data: string) => void,
  handleLifecycle: (
    message: Exclude<TerminalMessage, { type: "output" }>,
  ) => void,
): Disposable {
  let disposed = false;
  let replaying = true;
  let input: Disposable | undefined;
  let pending: TerminalMessage[] = [];
  const decodeOutput = createTerminalOutputDecoder();

  const deliverLive = (message: TerminalMessage): void => {
    if (message.type === "output") {
      terminal.write(decodeOutput(message.data));
    } else {
      handleLifecycle(message);
    }
  };

  const subscription = terminalStream.subscribe(terminalId, (message) => {
    if (disposed) return;
    if (replaying) pending.push(message);
    else deliverLive(message);
  });

  const finishReplay = (): void => {
    if (disposed) return;
    input = terminal.onData(writePty);
    replaying = false;
    const buffered = pending;
    pending = [];
    for (const message of buffered) deliverLive(message);
  };

  const replayNext = (index: number): void => {
    if (disposed) return;
    const message = subscription.replay[index];
    if (!message) {
      finishReplay();
      return;
    }
    if (message.type === "output") {
      terminal.write(decodeOutput(message.data), () => {
        replayNext(index + 1);
      });
    } else {
      handleLifecycle(message);
      replayNext(index + 1);
    }
  };

  replayNext(0);

  return {
    dispose(): void {
      if (disposed) return;
      disposed = true;
      pending = [];
      input?.dispose();
      subscription.unsubscribe();
    },
  };
}
