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
    terminalStream.subscribe("t1", (message) => received.push(message));
    expect(received).toEqual([
      { type: "output", terminalId: "t1", data: "shell ready\r\n" },
    ]);
  });

  it("replays output after the xterm view remounts", () => {
    const first: TerminalMessage[] = [];
    const unsubscribe = terminalStream.subscribe("t1", (message) =>
      first.push(message),
    );
    terminalStream.push({
      type: "output",
      terminalId: "t1",
      data: "before project switch\r\n",
    });
    unsubscribe();

    const remounted: TerminalMessage[] = [];
    terminalStream.subscribe("t1", (message) => remounted.push(message));

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

    const replayed: TerminalMessage[] = [];
    terminalStream.subscribe("t1", (message) => replayed.push(message));

    expect(replayed).toHaveLength(1);
    expect(replayed[0]).toMatchObject({ type: "output" });
    if (replayed[0]?.type === "output")
      expect(String(replayed[0].data).startsWith("b")).toBe(true);
  });

  it("clears replay history when the terminal closes", () => {
    terminalStream.push({ type: "output", terminalId: "t1", data: "gone" });
    terminalStream.close("t1");
    const replayed: TerminalMessage[] = [];
    terminalStream.subscribe("t1", (message) => replayed.push(message));
    expect(replayed).toEqual([]);
  });

  it("decodes byte payloads without assuming string output", () => {
    expect(decodeTerminalOutput("t1", [226, 156, 147])).toBe("✓");
    expect(decodeTerminalOutput("t1", new Uint8Array([10]))).toBe("\n");
  });
});
