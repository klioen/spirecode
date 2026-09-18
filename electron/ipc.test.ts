// @vitest-environment node
import { describe, expect, it } from "vitest";
import { validateCommandArgs, validateDirtyFileCount } from "./ipc.js";

describe("IPC command argument validation", () => {
  it("allows an empty relative path only for reading the worktree root", () => {
    expect(
      validateCommandArgs("fs_read_dir", {
        worktreeId: "worktree-1",
        relativePath: "",
      }),
    ).toEqual({ worktreeId: "worktree-1", relativePath: "" });

    expect(() =>
      validateCommandArgs("fs_read_file", {
        worktreeId: "worktree-1",
        relativePath: "",
      }),
    ).toThrow("relativePath is empty or too large");
    expect(() =>
      validateCommandArgs("git_diff_file", {
        worktreeId: "worktree-1",
        relativePath: "",
        scope: "unstaged",
      }),
    ).toThrow("relativePath is empty or too large");
  });

  it("allows chat deletion IDs without accepting renderer paths", () => {
    expect(
      validateCommandArgs("chat_session_delete", {
        worktreeId: "w1",
        sessionId: "s1",
      }),
    ).toEqual({ worktreeId: "w1", sessionId: "s1" });
    expect(() =>
      validateCommandArgs("chat_session_delete", {
        worktreeId: "w1",
        sessionId: "s1",
        path: "/tmp/session.jsonl",
      }),
    ).toThrow("Unexpected argument: path");
  });

  it("validates narrow chat configuration arguments", () => {
    expect(
      validateCommandArgs("chat_session_set_model", {
        worktreeId: "w1",
        sessionId: "s1",
        provider: "traex",
        modelId: "gpt-5.6-sol",
      }),
    ).toEqual({
      worktreeId: "w1",
      sessionId: "s1",
      provider: "traex",
      modelId: "gpt-5.6-sol",
    });
    for (const thinkingLevel of [
      "off",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]) {
      expect(() =>
        validateCommandArgs("chat_session_set_thinking_level", {
          worktreeId: "w1",
          sessionId: "s1",
          thinkingLevel,
        }),
      ).not.toThrow();
    }
    expect(() =>
      validateCommandArgs("chat_session_set_thinking_level", {
        worktreeId: "w1",
        sessionId: "s1",
        thinkingLevel: "turbo",
      }),
    ).toThrow("thinkingLevel is invalid");
    expect(() =>
      validateCommandArgs("chat_session_set_model", {
        worktreeId: "w1",
        sessionId: "s1",
        provider: "traex",
        modelId: "gpt",
        apiKey: "secret",
      }),
    ).toThrow("Unexpected argument: apiKey");
  });

  it("validates extension settings commands without accepting paths", () => {
    expect(
      validateCommandArgs("settings_extension_set_enabled", {
        worktreeId: "worktree-1",
        extensionId: "abc123",
        enabled: false,
      }),
    ).toEqual({
      worktreeId: "worktree-1",
      extensionId: "abc123",
      enabled: false,
    });
    expect(() =>
      validateCommandArgs("settings_extensions_list", {
        worktreeId: "worktree-1",
        path: "/tmp/extension.ts",
      }),
    ).toThrow("Unexpected argument: path");
  });

  it("validates memory document IDs without accepting paths", () => {
    expect(
      validateCommandArgs("settings_memory_read", { document: "summary" }),
    ).toEqual({ document: "summary" });
    expect(
      validateCommandArgs("settings_memory_read", { document: "handbook" }),
    ).toEqual({ document: "handbook" });
    expect(() =>
      validateCommandArgs("settings_memory_read", { document: "raw" }),
    ).toThrow("document is invalid");
    expect(() =>
      validateCommandArgs("settings_memory_read", {
        document: "summary",
        path: "/tmp/memory_summary.md",
      }),
    ).toThrow("Unexpected argument: path");
  });

  it("accepts only a bounded integer dirty file count", () => {
    expect(validateDirtyFileCount(2)).toBe(2);
    expect(() => validateDirtyFileCount(-1)).toThrow("dirty file count");
    expect(() => validateDirtyFileCount(1.5)).toThrow("dirty file count");
    expect(() => validateDirtyFileCount({ count: 1 })).toThrow(
      "dirty file count",
    );
  });

  it("validates file writes with a dedicated 5 MiB content limit", () => {
    const command = "fs_write_file" as Parameters<
      typeof validateCommandArgs
    >[0];
    expect(
      validateCommandArgs(command, {
        worktreeId: "worktree-1",
        relativePath: "hello.txt",
        content: "updated",
        expectedVersion: "version-1",
      }),
    ).toEqual({
      worktreeId: "worktree-1",
      relativePath: "hello.txt",
      content: "updated",
      expectedVersion: "version-1",
    });
    expect(() =>
      validateCommandArgs(command, {
        worktreeId: "worktree-1",
        relativePath: "hello.txt",
        content: "x".repeat(5 * 1024 * 1024 + 1),
        expectedVersion: "version-1",
      }),
    ).toThrow("content is too large");
  });

  it("validates global Memory configuration without accepting secrets", () => {
    expect(validateCommandArgs("settings_memory_models_list", {})).toEqual({});
    expect(validateCommandArgs("settings_memory_config_get", {})).toEqual({});
    const config = {
      phase1Provider: "openai",
      phase1ModelId: "gpt-5.6",
      phase1ReasoningEffort: "high",
      phase2Provider: "traex",
      phase2ModelId: "DeepSeek-V4-Flash",
      phase2ReasoningEffort: "medium",
    };
    expect(validateCommandArgs("settings_memory_config_set", config)).toEqual(
      config,
    );
    expect(() =>
      validateCommandArgs("settings_memory_config_set", {
        ...config,
        phase2ReasoningEffort: "turbo",
      }),
    ).toThrow("phase2ReasoningEffort is invalid");
    expect(() =>
      validateCommandArgs("settings_memory_config_set", {
        ...config,
        apiKey: "secret",
      }),
    ).toThrow("Unexpected argument: apiKey");
    expect(
      validateCommandArgs("settings_memory_models_list", {
        worktreeId: "w1",
      }),
    ).toEqual({ worktreeId: "w1" });
  });

  it("retains path length limits and rejects unexpected fields", () => {
    expect(() =>
      validateCommandArgs("fs_read_dir", {
        worktreeId: "worktree-1",
        relativePath: "x".repeat(4 * 1024 + 1),
      }),
    ).toThrow("relativePath is empty or too large");
    expect(() =>
      validateCommandArgs("fs_read_dir", {
        worktreeId: "worktree-1",
        relativePath: "",
        absolutePath: "/tmp",
      }),
    ).toThrow("Unexpected argument: absolutePath");
  });
});
