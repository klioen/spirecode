import { describe, expect, it } from "vitest";
import { COMMANDS, TOPICS, isCommand, isTopic } from "./contracts.js";

describe("Electron host allowlists", () => {
  it("accepts only declared command names", () => {
    for (const command of COMMANDS) expect(isCommand(command)).toBe(true);
    expect(isCommand("fs_read_absolute")).toBe(false);
    expect(isCommand("child_process.exec")).toBe(false);
    expect(isCommand(1)).toBe(false);
  });

  it("accepts only declared event topics", () => {
    for (const topic of TOPICS) expect(isTopic(topic)).toBe(true);
    expect(isTopic("electron://raw-ipc")).toBe(false);
    expect(isTopic("terminal://write")).toBe(false);
  });
});
