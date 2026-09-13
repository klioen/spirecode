import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { terminalRegistry } from "./terminalRegistry";
import { useTerminalStore } from "./terminalStore";

afterEach(() => terminalRegistry.delete("t1"));
beforeEach(() =>
  useTerminalStore.setState({ tabsByProject: {}, activeByProject: {} }),
);

describe("terminal output ownership", () => {
  it("writes output to the terminal instance rather than Zustand", () => {
    let output = "";
    terminalRegistry.set("t1", {
      write: (data) => {
        output += data;
      },
      dispose: () => undefined,
    });
    terminalRegistry.get("t1")?.write("hello");
    expect(output).toBe("hello");
    expect(JSON.stringify(useTerminalStore.getState())).not.toContain("hello");
  });
});
