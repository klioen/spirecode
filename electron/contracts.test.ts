import { describe, expect, it } from "vitest";
import { COMMANDS, TOPICS, isCommand, isTopic } from "./contracts.js";

describe("Electron host allowlists", () => {
  it("accepts only declared command names", () => {
    for (const command of COMMANDS) expect(isCommand(command)).toBe(true);
    expect(COMMANDS).toEqual(
      expect.arrayContaining([
        "fs_create_file",
        "fs_create_directory",
        "fs_rename",
        "fs_move",
        "fs_copy",
        "fs_trash",
        "fs_reveal",
        "git_stage",
        "git_unstage",
        "git_discard",
        "git_commit",
        "chat_session_config",
        "chat_session_set_model",
        "chat_session_set_thinking_level",
        "chat_session_rename",
        "task_list",
        "task_create",
        "task_rewrite_start",
        "settings_memory_read",
        "settings_memory_models_list",
        "settings_memory_config_get",
        "settings_memory_config_set",
        "settings_language_get",
        "settings_language_set",
        "settings_agent_readiness",
        "settings_extension_catalog_list",
        "settings_extension_package_install",
        "settings_extension_package_update",
        "settings_extension_package_remove",
        "settings_skills_list",
        "settings_skill_set_enabled",
      ]),
    );
    expect(isCommand("chat_session_invoke")).toBe(false);
    expect(isCommand("pi_command")).toBe(false);
    expect(isCommand("fs_read_absolute")).toBe(false);
    expect(isCommand("git_exec")).toBe(false);
    expect(isCommand("git_reset_hard")).toBe(false);
    expect(isCommand("child_process.exec")).toBe(false);
    expect(isCommand(1)).toBe(false);
  });

  it("accepts only declared event topics", () => {
    for (const topic of TOPICS) expect(isTopic(topic)).toBe(true);
    expect(isTopic("task://event")).toBe(true);
    expect(isTopic("electron://raw-ipc")).toBe(false);
    expect(isTopic("terminal://write")).toBe(false);
  });
});
