// @vitest-environment node
import { describe, expect, it } from "vitest";
import { validateCommandArgs } from "./ipc.js";

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
