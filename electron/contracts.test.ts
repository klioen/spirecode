import { describe, expect, it } from "vitest";
import { COMMANDS, TOPICS, isCommand, isTopic } from "./contracts.js";

describe("Electron host allowlists", () => {
  it("accepts only declared command names", () => {
    for (const command of COMMANDS) expect(isCommand(command)).toBe(true);
    expect(COMMANDS).toEqual(
      expect.arrayContaining([
        "chat_session_config",
        "chat_session_set_model",
        "chat_session_set_thinking_level",
        "settings_memory_read",
        "settings_memory_models_list",
        "settings_memory_config_get",
        "settings_memory_config_set",
        "settings_language_get",
        "settings_language_set",
      ]),
    );
    expect(isCommand("chat_session_invoke")).toBe(false);
    expect(isCommand("pi_command")).toBe(false);
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
