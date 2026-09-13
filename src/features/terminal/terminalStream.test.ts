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

  it("decodes byte payloads without assuming string output", () => {
    expect(decodeTerminalOutput("t1", [226, 156, 147])).toBe("✓");
    expect(decodeTerminalOutput("t1", new Uint8Array([10]))).toBe("\n");
  });
});
