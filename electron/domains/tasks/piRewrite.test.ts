import { describe, expect, it, vi } from "vitest";
import {
  TASK_REWRITE_TOOL_NAME,
  TaskRewriteError,
  TaskRewriteService,
  createDefaultTaskRewriteService,
  type TaskRewriteSession,
  type TaskRewriteSessionFactory,
  type TaskRewriteToolDefinition,
} from "./piRewrite.js";

const input = {
  title: "  Improve task wording  ",
  description: "Keep the behavior unchanged.",
  acceptanceCriteria: ["  Clear title  ", "Testable criteria"],
};

function expectCode(code: string) {
  return expect.objectContaining({ code });
}

function sessionHarness(
  onPrompt: (context: {
    tool: TaskRewriteToolDefinition;
    emit(event: unknown): void;
  }) => void | Promise<void>,
) {
  let listener: (event: unknown) => void = () => undefined;
  const calls: string[] = [];
  let tool!: TaskRewriteToolDefinition;
  const session: TaskRewriteSession = {
    subscribe(next) {
      calls.push("subscribe");
      listener = next;
      return () => calls.push("unsubscribe");
    },
    async prompt(_text, options) {
      calls.push(`prompt:${String(options?.expandPromptTemplates)}`);
      await onPrompt({ tool, emit: (event) => listener(event) });
    },
    async abort() {
      calls.push("abort");
    },
    dispose() {
      calls.push("dispose");
    },
  };
  const factory: TaskRewriteSessionFactory = {
    async create(options) {
      calls.push("create");
      tool = options.tool;
      return session;
    },
  };
  return {
    calls,
    factory,
    get tool() {
      return tool;
    },
  };
}

describe("TaskRewriteService", () => {
  it("accepts a rewrite only through the sole custom tool and disposes", async () => {
    const harness = sessionHarness(async ({ tool }) => {
      expect(tool.name).toBe(TASK_REWRITE_TOOL_NAME);
      await tool.execute("call-1", {
        title: "Better title",
        description: "Better description",
        acceptanceCriteria: ["One", "Two"],
      });
    });
    const service = new TaskRewriteService(harness.factory);

    await expect(service.rewrite(input)).resolves.toEqual({
      title: "Better title",
      description: "Better description",
      acceptanceCriteria: ["One", "Two"],
    });
    expect(harness.calls).toEqual([
      "create",
      "subscribe",
      "prompt:false",
      "abort",
      "unsubscribe",
      "dispose",
    ]);
  });

  it("fails closed when the agent settles without a submitted result", async () => {
    const harness = sessionHarness(({ emit }) => {
      emit({ type: "agent_settled", aborted: false });
    });
    const service = new TaskRewriteService(harness.factory);

    await expect(service.rewrite(input)).rejects.toEqual(
      expectCode("TASK_REWRITE_NO_RESULT"),
    );
    expect(harness.calls).toContain("dispose");
  });

  it("rejects extra result fields and does not treat the invalid call as a result", async () => {
    const harness = sessionHarness(async ({ tool, emit }) => {
      const toolResult = await tool.execute("call-1", {
        title: "Better title",
        description: "Better description",
        acceptanceCriteria: ["One"],
        projectId: "forbidden",
      });
      expect(toolResult.isError).toBe(true);
      emit({ type: "agent_settled", aborted: false });
    });
    const service = new TaskRewriteService(harness.factory);

    await expect(service.rewrite(input)).rejects.toEqual(
      expectCode("TASK_REWRITE_NO_RESULT"),
    );
  });

  it("aborts the active session and rejects the caller", async () => {
    let promptStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      promptStarted = resolve;
    });
    const harness = sessionHarness(() => {
      promptStarted();
      return new Promise<void>(() => undefined);
    });
    const service = new TaskRewriteService(harness.factory);
    const rewrite = service.rewrite(input);
    await started;

    await service.abort();

    await expect(rewrite).rejects.toEqual(expectCode("TASK_REWRITE_ABORTED"));
    expect(harness.calls.filter((call) => call === "abort")).toHaveLength(1);
    expect(harness.calls).toContain("dispose");
  });

  it("times out, aborts, and disposes a session that never settles", async () => {
    vi.useFakeTimers();
    try {
      const harness = sessionHarness(() => new Promise<void>(() => undefined));
      const service = new TaskRewriteService(harness.factory, {
        timeoutMs: 25,
      });
      const rewrite = service.rewrite(input);
      const outcome = expect(rewrite).rejects.toEqual(
        expectCode("TASK_REWRITE_TIMEOUT"),
      );
      await vi.advanceTimersByTimeAsync(25);

      await outcome;
      expect(harness.calls).toContain("abort");
      expect(harness.calls).toContain("dispose");
    } finally {
      vi.useRealTimers();
    }
  });

  it("is single-flight", async () => {
    let promptStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      promptStarted = resolve;
    });
    const harness = sessionHarness(() => {
      promptStarted();
      return new Promise<void>(() => undefined);
    });
    const service = new TaskRewriteService(harness.factory);
    const first = service.rewrite(input);
    await started;

    await expect(service.rewrite(input)).rejects.toEqual(
      expectCode("TASK_REWRITE_BUSY"),
    );
    await service.abort();
    await expect(first).rejects.toBeInstanceOf(TaskRewriteError);
  });
});

describe("createDefaultTaskRewriteService", () => {
  it("uses only SessionManager.inMemory, disables resources, and allowlists one custom tool", async () => {
    const calls: Array<[string, unknown?]> = [];
    const sharedRuntime = { id: "shared" };
    let capturedTool!: TaskRewriteToolDefinition;
    const session: TaskRewriteSession = {
      subscribe: () => () => undefined,
      async prompt() {
        await capturedTool.execute("call-1", {
          title: "Production rewrite",
          description: "No persistence",
          acceptanceCriteria: ["Only one tool"],
        });
      },
      async abort() {
        calls.push(["abort"]);
      },
      dispose() {
        calls.push(["dispose"]);
      },
    };
    const sdk = {
      ModelRuntime: {
        create: vi.fn(async () => {
          throw new Error("shared runtime should be reused");
        }),
      },
      SessionManager: {
        inMemory(cwd?: string) {
          calls.push(["inMemory", cwd]);
          return { isPersisted: () => false };
        },
        get create(): never {
          throw new Error("persistent create must not be accessed");
        },
        get open(): never {
          throw new Error("persistent open must not be accessed");
        },
        get list(): never {
          throw new Error("persistent list must not be accessed");
        },
      },
      async createAgentSessionServices(options: Record<string, unknown>) {
        calls.push(["services", options]);
        return { modelRuntime: sharedRuntime };
      },
      async createAgentSessionFromServices(options: {
        tools: string[];
        noTools: string;
        customTools: TaskRewriteToolDefinition[];
      }) {
        calls.push(["session", options]);
        expect(options.noTools).toBe("all");
        expect(options.tools).toEqual([TASK_REWRITE_TOOL_NAME]);
        expect(options.customTools).toHaveLength(1);
        expect(options.customTools[0]?.name).toBe(TASK_REWRITE_TOOL_NAME);
        capturedTool = options.customTools[0]!;
        return { session };
      },
    };

    const service = await createDefaultTaskRewriteService({
      controlledCwd: "/controlled/user-data/task-rewrite-empty",
      modelRuntime: sharedRuntime,
      sdk: sdk as never,
    });
    await expect(service.rewrite(input)).resolves.toEqual({
      title: "Production rewrite",
      description: "No persistence",
      acceptanceCriteria: ["Only one tool"],
    });

    expect(sdk.ModelRuntime.create).not.toHaveBeenCalled();
    expect(calls.find(([name]) => name === "inMemory")).toEqual([
      "inMemory",
      "/controlled/user-data/task-rewrite-empty",
    ]);
    const serviceOptions = calls.find(([name]) => name === "services")?.[1] as {
      cwd: string;
      modelRuntime: unknown;
      resourceLoaderOptions: Record<string, unknown>;
    };
    expect(serviceOptions.cwd).toBe("/controlled/user-data/task-rewrite-empty");
    expect(serviceOptions.modelRuntime).toBe(sharedRuntime);
    expect(serviceOptions.resourceLoaderOptions).toMatchObject({
      noExtensions: true,
      disabledBuiltinExtensions: ["mcp", "codemode", "tool_search"],
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      additionalExtensionPaths: [],
      additionalSkillPaths: [],
      additionalPromptTemplatePaths: [],
      additionalThemePaths: [],
    });
  });
});
