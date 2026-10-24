import { afterEach, describe, expect, it } from "vitest";
import type { TerminalMessage } from "../../bindings";
import { decodeTerminalOutput, terminalStream } from "./terminalStream";

afterEach(() => terminalStream.close("t1"));

describe("terminal stream", () => {
  it("buffers output emitted before xterm subscribes", () => {
    const received: TerminalMessage[] = [];
    terminalStream.push({
      type: "output",
      terminalId: "t1",
      data: "shell ready\r\n",
    });
    const subscription = terminalStream.subscribe("t1", (message) =>
      received.push(message),
    );
    received.push(...subscription.replay);
    expect(received).toEqual([
      { type: "output", terminalId: "t1", data: "shell ready\r\n" },
    ]);
  });

  it("replays output after the xterm view remounts", () => {
    const first: TerminalMessage[] = [];
    const firstSubscription = terminalStream.subscribe("t1", (message) =>
      first.push(message),
    );
    first.push(...firstSubscription.replay);
    terminalStream.push({
      type: "output",
      terminalId: "t1",
      data: "before project switch\r\n",
    });
    firstSubscription.unsubscribe();

    const remounted: TerminalMessage[] = [];
    const remountedSubscription = terminalStream.subscribe("t1", (message) =>
      remounted.push(message),
    );
    remounted.push(...remountedSubscription.replay);

    expect(first).toHaveLength(1);
    expect(remounted).toEqual(first);
  });

  it("keeps only the newest output within the history budget", () => {
    terminalStream.push({
      type: "output",
      terminalId: "t1",
      data: "a".repeat(700_000),
    });
    terminalStream.push({
      type: "output",
      terminalId: "t1",
      data: "b".repeat(700_000),
    });

    const replayed = terminalStream.subscribe("t1", () => {}).replay;

    expect(replayed).toHaveLength(1);
    expect(replayed[0]).toMatchObject({ type: "output" });
    if (replayed[0]?.type === "output")
      expect(String(replayed[0].data).startsWith("b")).toBe(true);
  });

  it("replays the latest lifecycle status after output", () => {
    terminalStream.push({ type: "output", terminalId: "t1", data: "done" });
    terminalStream.push({ type: "exit", terminalId: "t1", exitCode: 0 });

    expect(terminalStream.subscribe("t1", () => {}).replay).toEqual([
      { type: "output", terminalId: "t1", data: "done" },
      { type: "exit", terminalId: "t1", exitCode: 0 },
    ]);
  });

  it("clears replay history when the terminal closes", () => {
    terminalStream.push({ type: "output", terminalId: "t1", data: "gone" });
    terminalStream.close("t1");
    const replayed = terminalStream.subscribe("t1", () => {}).replay;
    expect(replayed).toEqual([]);
  });

  it("decodes byte payloads without assuming string output", () => {
    expect(decodeTerminalOutput("t1", [226, 156, 147])).toBe("✓");
    expect(decodeTerminalOutput("t1", new Uint8Array([10]))).toBe("\n");
  });
});
