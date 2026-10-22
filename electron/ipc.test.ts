// @vitest-environment node
import { describe, expect, it } from "vitest";
import { validateCommandArgs, validateDirtyFileCount } from "./ipc.js";

describe("IPC command argument validation", () => {
  it("validates bounded Task search, project filters and no-argument read-all", () => {
    const input = {
      limit: 50,
      query: "fix",
      projectId: "10000000-0000-4000-8000-000000000001",
      attentionOnly: true,
    };
    expect(validateCommandArgs("task_list", input)).toEqual(input);
    expect(() =>
      validateCommandArgs("task_list", { limit: 50, query: "x".repeat(257) }),
    ).toThrow();
    expect(() =>
      validateCommandArgs("task_list", { limit: 50, attentionOnly: "yes" }),
    ).toThrow();
    expect(validateCommandArgs("task_notifications_mark_all_read", {})).toEqual(
      {},
    );
    expect(() =>
      validateCommandArgs("task_notifications_mark_all_read", {
        sql: "DELETE",
      }),
    ).toThrow();
  });

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

  it("validates narrow Git mutation arguments", () => {
    expect(
      validateCommandArgs("git_discard", {
        worktreeId: "w1",
        relativePath: "src/file.ts",
        untracked: false,
      }),
    ).toEqual({
      worktreeId: "w1",
      relativePath: "src/file.ts",
      untracked: false,
    });
    expect(
      validateCommandArgs("git_commit", {
        worktreeId: "w1",
        message: "subject\n\nbody",
      }),
    ).toEqual({ worktreeId: "w1", message: "subject\n\nbody" });
    expect(() =>
      validateCommandArgs("git_commit", {
        worktreeId: "w1",
        message: "   ",
      }),
    ).toThrow("message is empty");
    expect(() =>
      validateCommandArgs("git_stage", {
        worktreeId: "w1",
        relativePath: "file.ts",
        args: ["reset", "--hard"],
      }),
    ).toThrow("Unexpected argument: args");
    expect(() =>
      validateCommandArgs("git_discard", {
        worktreeId: "w1",
        relativePath: "file.ts",
        untracked: "yes",
      }),
    ).toThrow("untracked must be a boolean");
  });

  it("validates narrow project group arguments and nullable groupId", () => {
    expect(
      validateCommandArgs("project_group_create", { name: "Platform" }),
    ).toEqual({ name: "Platform" });
    expect(
      validateCommandArgs("project_group_rename", {
        groupId: "group-1",
        name: "Infrastructure",
      }),
    ).toEqual({ groupId: "group-1", name: "Infrastructure" });
    expect(
      validateCommandArgs("project_group_delete", { groupId: "group-1" }),
    ).toEqual({ groupId: "group-1" });
    expect(
      validateCommandArgs("project_group_set_project", {
        projectId: "project-1",
        groupId: "group-1",
      }),
    ).toEqual({ projectId: "project-1", groupId: "group-1" });
    expect(
      validateCommandArgs("project_group_set_project", {
        projectId: "project-1",
        groupId: null,
      }),
    ).toEqual({ projectId: "project-1", groupId: null });
    expect(
      validateCommandArgs("project_move", {
        projectId: "project-1",
        targetGroupId: null,
        beforeProjectId: "project-2",
      }),
    ).toEqual({
      projectId: "project-1",
      targetGroupId: null,
      beforeProjectId: "project-2",
    });

    expect(() =>
      validateCommandArgs("project_group_set_project", {
        projectId: "project-1",
      }),
    ).toThrow("groupId must be a string or null");
    expect(() =>
      validateCommandArgs("project_group_rename", {
        groupId: null,
        name: "Infrastructure",
      }),
    ).toThrow("groupId must be a string");
    expect(() =>
      validateCommandArgs("project_group_set_project", {
        projectId: "project-1",
        groupId: 42,
      }),
    ).toThrow("groupId must be a string or null");
    expect(() =>
      validateCommandArgs("project_move", {
        projectId: "project-1",
        targetGroupId: null,
        beforeProjectId: 42,
      }),
    ).toThrow("beforeProjectId must be a string or null");
    expect(() =>
      validateCommandArgs("project_group_create", {
        name: "Platform",
        catalog: {},
      }),
    ).toThrow("Unexpected argument: catalog");
    expect(() =>
      validateCommandArgs("project_group_delete", {
        groupId: "x".repeat(129),
      }),
    ).toThrow("groupId is empty or too large");
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

  it("allows only IDs and a title for chat rename", () => {
    expect(
      validateCommandArgs("chat_session_rename", {
        worktreeId: "w1",
        sessionId: "s1",
        title: "Release notes",
      }),
    ).toEqual({
      worktreeId: "w1",
      sessionId: "s1",
      title: "Release notes",
    });
    expect(() =>
      validateCommandArgs("chat_session_rename", {
        worktreeId: "w1",
        sessionId: "s1",
        title: "Release notes",
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

  it("validates extension settings commands without accepting paths or URLs", () => {
    expect(() =>
      validateCommandArgs("settings_extensions_list", {
        worktreeId: "worktree-1",
        path: "/tmp/extension.ts",
      }),
    ).toThrow("Unexpected argument: path");
    expect(
      validateCommandArgs("settings_extension_catalog_list", {
        query: "web access",
        sort: "downloads",
        page: 1,
      }),
    ).toEqual({ query: "web access", sort: "downloads", page: 1 });
    expect(
      validateCommandArgs("settings_extension_catalog_list", {
        query: "",
        sort: "recent",
        page: 2,
      }),
    ).toEqual({ query: "", sort: "recent", page: 2 });
    expect(() =>
      validateCommandArgs("settings_extension_catalog_list", {
        query: "web",
        sort: "downloads",
        page: 1,
        url: "https://evil.example",
      }),
    ).toThrow("Unexpected argument: url");
    expect(
      validateCommandArgs("settings_extension_package_install", {
        packageName: "@scope/pi-tools",
      }),
    ).toEqual({ packageName: "@scope/pi-tools" });
    expect(() =>
      validateCommandArgs("settings_extension_package_install", {
        packageName: "pi-tools",
        cwd: "/tmp",
      }),
    ).toThrow("Unexpected argument: cwd");
    expect(
      validateCommandArgs("settings_extension_package_update", {
        source: "npm:pi-tools",
      }),
    ).toEqual({ source: "npm:pi-tools" });
    expect(
      validateCommandArgs("settings_extension_package_remove", {
        source: "npm:pi-tools",
      }),
    ).toEqual({ source: "npm:pi-tools" });
  });

  it("validates skill settings commands without accepting paths", () => {
    expect(
      validateCommandArgs("settings_skill_set_enabled", {
        worktreeId: "worktree-1",
        skillId: "abc123",
        enabled: false,
      }),
    ).toEqual({
      worktreeId: "worktree-1",
      skillId: "abc123",
      enabled: false,
    });
    expect(() =>
      validateCommandArgs("settings_skills_list", {
        worktreeId: "worktree-1",
        path: "/tmp/SKILL.md",
      }),
    ).toThrow("Unexpected argument: path");
  });

  it("validates narrow language settings arguments", () => {
    expect(validateCommandArgs("settings_language_get", {})).toEqual({});
    expect(validateCommandArgs("settings_agent_readiness", {})).toEqual({});
    expect(() =>
      validateCommandArgs("settings_agent_readiness", { apiKey: "secret" }),
    ).toThrow("Unexpected argument: apiKey");
    expect(
      validateCommandArgs("settings_language_set", { language: "en" }),
    ).toEqual({ language: "en" });
    expect(
      validateCommandArgs("settings_language_set", { language: "zh-CN" }),
    ).toEqual({ language: "zh-CN" });
    expect(() =>
      validateCommandArgs("settings_language_set", { language: "fr" }),
    ).toThrow("language is invalid");
    expect(() =>
      validateCommandArgs("settings_language_set", {
        language: "en",
        locale: "en-US",
      }),
    ).toThrow("Unexpected argument: locale");
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
    expect(validateCommandArgs("settings_extensions_list", {})).toEqual({});
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

  it("accepts only the narrow filesystem mutation fields", () => {
    expect(
      validateCommandArgs("fs_create_file", {
        worktreeId: "w1",
        relativePath: "src/new.ts",
      }),
    ).toEqual({ worktreeId: "w1", relativePath: "src/new.ts" });
    expect(
      validateCommandArgs("fs_rename", {
        worktreeId: "w1",
        relativePath: "src/old.ts",
        newName: "new.ts",
      }),
    ).toEqual({
      worktreeId: "w1",
      relativePath: "src/old.ts",
      newName: "new.ts",
    });
    expect(() =>
      validateCommandArgs("fs_trash", {
        worktreeId: "w1",
        relativePath: "src/file.ts",
        force: true,
      }),
    ).toThrow("Unexpected argument: force");
    expect(() =>
      validateCommandArgs("fs_move", {
        worktreeId: "w1",
        sourceRelativePath: "src/file.ts",
        destinationRelativePath: "",
      }),
    ).toThrow("destinationRelativePath is empty or too large");
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

describe("Task IPC validation", () => {
  const createInput = {
    title: "Fix scrolling",
    description: "Keep the previous position",
    projectId: "project-1",
    workspace: { mode: "new_managed", baseRef: "origin/main" },
    automationEnabled: true,
  };

  it("accepts bounded Task list and create requests", () => {
    expect(
      validateCommandArgs("task_list", {
        limit: 50,
        statuses: ["running", "needs_review"],
      }),
    ).toEqual({ limit: 50, statuses: ["running", "needs_review"] });
    expect(validateCommandArgs("task_create", { input: createInput })).toEqual({
      input: createInput,
    });
    expect(() =>
      validateCommandArgs("task_create", {
        input: { ...createInput, acceptanceCriteria: [] },
      }),
    ).toThrow("unexpected fields");
    expect(() =>
      validateCommandArgs("task_update", {
        taskId: "task-1",
        expectedRevision: 1,
        patch: { acceptanceCriteria: [] },
      }),
    ).toThrow("unexpected fields");
  });

  it("accepts first-page and paginated notification requests with bounded numeric limits", () => {
    expect(
      validateCommandArgs("task_notifications_list", { limit: 50 }),
    ).toEqual({ limit: 50 });
    expect(
      validateCommandArgs("task_notifications_list", {
        limit: 1,
        cursor: "opaque-cursor",
      }),
    ).toEqual({ limit: 1, cursor: "opaque-cursor" });
    expect(
      validateCommandArgs("task_notifications_list", { limit: 100 }),
    ).toEqual({ limit: 100 });
    for (const limit of [undefined, 0, 101, 1.5, Number.NaN, "50"]) {
      expect(() =>
        validateCommandArgs("task_notifications_list", { limit }),
      ).toThrow();
    }
    for (const cursor of [null, "", "x".repeat(4097), 42]) {
      expect(() =>
        validateCommandArgs("task_notifications_list", { limit: 50, cursor }),
      ).toThrow();
    }
    expect(() =>
      validateCommandArgs("task_notifications_list", {
        limit: 50,
        path: "/tmp/tasks",
      }),
    ).toThrow("Unexpected argument");
  });

  it("accepts notification reads with nullable or omitted run IDs while rejecting invalid values", () => {
    const input = { taskId: "task-1", kind: "needs_review" };
    expect(validateCommandArgs("task_notification_mark_read", input)).toEqual(
      input,
    );
    for (const runId of [null, "", "run-1"]) {
      expect(
        validateCommandArgs("task_notification_mark_read", { ...input, runId }),
      ).toEqual({ ...input, runId });
    }
    for (const runId of [undefined, false, 42, "x".repeat(4097)]) {
      expect(() =>
        validateCommandArgs("task_notification_mark_read", { ...input, runId }),
      ).toThrow();
    }
    expect(() =>
      validateCommandArgs("task_notification_mark_read", { taskId: "task-1" }),
    ).toThrow();
  });

  it("rejects broad, malformed, and oversized Task input", () => {
    expect(() =>
      validateCommandArgs("task_create", {
        input: { ...createInput, path: "/tmp/repository" },
      }),
    ).toThrow("unexpected fields");
    expect(() =>
      validateCommandArgs("task_create", {
        input: {
          ...createInput,
          workspace: {
            mode: "existing",
            worktreeId: "worktree-1",
            allowDirty: false,
            cwd: "/tmp/repository",
          },
        },
      }),
    ).toThrow("unexpected fields");
    expect(() =>
      validateCommandArgs("task_list", { limit: 101, statuses: [] }),
    ).toThrow("limit is too large");
    expect(() =>
      validateCommandArgs("task_list", { limit: 50, statuses: ["merged"] }),
    ).toThrow("statuses is invalid");
  });

  it("validates revisions and restricted rewrite input", () => {
    expect(
      validateCommandArgs("task_run", {
        taskId: "task-1",
        expectedRevision: 2,
      }),
    ).toEqual({ taskId: "task-1", expectedRevision: 2 });
    expect(() =>
      validateCommandArgs("task_run", {
        taskId: "task-1",
        expectedRevision: 0,
      }),
    ).toThrow("expectedRevision must be a safe integer");
    expect(
      validateCommandArgs("task_rewrite_start", {
        rewriteId: "rewrite-1",
        input: {
          title: "Fix scrolling",
          description: "Clarify this",
        },
      }),
    ).toBeDefined();
    expect(() =>
      validateCommandArgs("task_rewrite_start", {
        rewriteId: "rewrite-1",
        input: {
          title: "Fix scrolling",
          description: "Clarify this",
          projectPath: "/tmp/repository",
        },
      }),
    ).toThrow("unexpected fields");
  });
});
