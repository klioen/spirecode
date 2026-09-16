import { describe, expect, it } from "vitest";
import { createPiAdapter, type PiSdk } from "./piAdapter.js";

function sessionFixture() {
  let streaming = false;
  let model: unknown = {
    provider: "traex",
    id: "reasoning-model",
    name: "Reasoning Model",
    reasoning: true,
  };
  let thinkingLevel = "medium";
  const calls: unknown[] = [];
  const session = {
    sessionId: "s1",
    sessionName: undefined,
    get isStreaming() {
      return streaming;
    },
    get isIdle() {
      return !streaming;
    },
    get model() {
      return model;
    },
    get thinkingLevel() {
      return thinkingLevel;
    },
    promptTemplates: [
      {
        name: "release",
        description: "Prepare release",
        argumentHint: "<version>",
        content: "private prompt body",
        filePath: "/private/release.md",
      },
    ],
    getAvailableThinkingLevels: () => ["off", "low", "medium", "high"],
    setModel: async (next: unknown) => {
      calls.push(["setModel", next]);
      model = next;
      thinkingLevel = "low";
    },
    setThinkingLevel: (level: string) => {
      calls.push(["setThinkingLevel", level]);
      thinkingLevel = level === "max" ? "high" : level;
    },
    messages: [],
    subscribe: () => () => undefined,
    prompt: (
      _text: string,
      options: {
        streamingBehavior?: string;
        preflightResult?: (success: boolean) => void;
      },
    ) => {
      calls.push(["prompt", options.streamingBehavior]);
      options.preflightResult?.(true);
      return new Promise<void>(() => undefined);
    },
    followUp: async () => undefined,
    clearQueue: () => ({ steering: [], followUp: [] }),
    abort: async () => undefined,
    dispose: () => undefined,
  };
  return {
    calls,
    session,
    setStreaming(value: boolean) {
      streaming = value;
    },
  };
}

function sdkFixture(options: {
  existingMessages?: unknown[];
  defaultProvider?: string;
  defaultModel?: string;
  resolvedModel?: unknown;
  configuredAuth?: boolean;
  availableModels?: unknown[];
}) {
  const runtime = {
    getModel: (provider: string, model: string) => {
      calls.push(["getModel", provider, model]);
      return options.resolvedModel;
    },
    hasConfiguredAuth: (provider: string) => {
      calls.push(["hasConfiguredAuth", provider]);
      return options.configuredAuth ?? true;
    },
    getAvailable: async () => options.availableModels ?? [],
  };
  const settings = {
    getDefaultProvider: () => options.defaultProvider,
    getDefaultModel: () => options.defaultModel,
  };
  const manager = {
    buildSessionContext: () => ({ messages: options.existingMessages ?? [] }),
    getBranch: () => [
      {
        type: "custom",
        id: "todo-entry",
        customType: "pi-todo-state",
        data: { todos: [{ id: "a", step: "Inspect", status: "pending" }] },
      },
    ],
  };
  const calls: unknown[] = [];
  const fixture = sessionFixture();
  const sdk = {
    ModelRuntime: {
      create: async () => {
        calls.push("runtime");
        return runtime;
      },
    },
    SessionManager: {
      create: () => manager,
      list: async () => [],
      open: () => manager,
    },
    createAgentSessionServices: async (input: {
      cwd: string;
      modelRuntime: unknown;
      resourceLoaderOptions?: unknown;
    }) => {
      calls.push([
        "services",
        input.cwd,
        input.modelRuntime,
        input.resourceLoaderOptions,
      ]);
      return {
        cwd: input.cwd,
        modelRuntime: runtime,
        settingsManager: settings,
      };
    },
    createAgentSessionFromServices: async (input: {
      services: unknown;
      sessionManager: unknown;
      model?: unknown;
    }) => {
      calls.push(["session", input.sessionManager, input.model]);
      return {
        session: fixture.session,
        extensionsResult: {
          runtime: {
            getCommands: () => [
              {
                name: "review",
                description: "Review code",
                source: "extension",
                sourceInfo: { path: "/private/ext.ts" },
              },
              {
                name: "release",
                description: "Prepare release",
                source: "prompt",
                sourceInfo: { path: "/private/release.md" },
              },
              {
                name: "skill:security",
                description: "Security checks",
                source: "skill",
                sourceInfo: { path: "/private/SKILL.md" },
              },
            ],
          },
        },
      };
    },
  } as unknown as PiSdk;
  const loadResources = async () => ({
    settingsManager: settings,
    resourceLoaderOptions: {
      noExtensions: true,
      additionalExtensionPaths: ["/bundle/pi-memory"],
    },
    diagnostics: [],
  });
  return { sdk, calls, fixture, runtime, manager, loadResources };
}

describe("piAdapter", () => {
  it("resolves the configured default after extension providers load", async () => {
    const configuredModel = { provider: "traex", id: "gpt-5.6-sol" };
    const { sdk, calls, runtime, manager, loadResources } = sdkFixture({
      defaultProvider: "traex",
      defaultModel: "gpt-5.6-sol",
      resolvedModel: configuredModel,
    });

    const adapter = await createPiAdapter(sdk, { loadResources });
    await adapter.create("/repo");

    expect(calls).toEqual([
      "runtime",
      [
        "services",
        "/repo",
        runtime,
        {
          noExtensions: true,
          additionalExtensionPaths: ["/bundle/pi-memory"],
        },
      ],
      ["getModel", "traex", "gpt-5.6-sol"],
      ["hasConfiguredAuth", "traex"],
      ["session", manager, configuredModel],
    ]);
  });

  it("loads only extensions selected from the resolved resource set", async () => {
    const { sdk, calls, runtime, loadResources } = sdkFixture({});
    const adapter = await createPiAdapter(sdk, {
      loadResources,
      selectExtensionPaths: async (_cwd, basePaths) => [
        ...basePaths,
        "/extensions/enabled.ts",
      ],
    });

    await adapter.create("/repo");

    expect(calls).toContainEqual([
      "services",
      "/repo",
      runtime,
      {
        noExtensions: true,
        additionalExtensionPaths: [
          "/bundle/pi-memory",
          "/extensions/enabled.ts",
        ],
      },
    ]);
  });

  it("preserves the saved model when opening a session with messages", async () => {
    const { sdk, calls, manager, loadResources } = sdkFixture({
      existingMessages: [{ role: "user", content: "existing" }],
      defaultProvider: "traex",
      defaultModel: "gpt-5.6-sol",
      resolvedModel: { provider: "traex", id: "gpt-5.6-sol" },
    });

    const adapter = await createPiAdapter(sdk, { loadResources });
    await adapter.open(
      {
        sessionId: "s1",
        cwd: "/repo",
        title: "Existing",
        path: "/sessions/s1.jsonl",
        createdAt: 1,
        updatedAt: 2,
      },
      "/repo",
    );

    expect(calls).toContainEqual(["session", manager, undefined]);
    expect(
      calls.some((call) => Array.isArray(call) && call[0] === "getModel"),
    ).toBe(false);
  });

  it("rejects a configured default that is unavailable after provider loading", async () => {
    const { sdk, calls, loadResources } = sdkFixture({
      defaultProvider: "traex",
      defaultModel: "missing",
      resolvedModel: undefined,
    });

    const adapter = await createPiAdapter(sdk, { loadResources });
    await expect(adapter.create("/repo")).rejects.toThrow(
      "Configured default model traex/missing is unavailable",
    );
    expect(
      calls.some((call) => Array.isArray(call) && call[0] === "session"),
    ).toBe(false);
  });

  it("projects safe session config and runtime slash commands", async () => {
    const secretModel = {
      provider: "traex",
      id: "reasoning-model",
      name: "Reasoning Model",
      reasoning: true,
      baseUrl: "https://secret.example",
      headers: { Authorization: "secret" },
    };
    const { sdk, loadResources } = sdkFixture({
      availableModels: [secretModel],
      resolvedModel: secretModel,
    });
    const adapter = await createPiAdapter(sdk, { loadResources });
    const created = await adapter.create("/repo");

    const config = await created.session.getConfig();
    expect(config).toMatchObject({
      model: { provider: "traex", id: "reasoning-model" },
      models: [
        {
          provider: "traex",
          id: "reasoning-model",
          label: "Reasoning Model",
          reasoning: true,
        },
      ],
      thinkingLevel: "medium",
      availableThinkingLevels: ["off", "low", "medium", "high"],
    });
    expect(config.commands).toEqual(
      expect.arrayContaining([
        {
          name: "release",
          description: "Prepare release",
          argumentHint: "<version>",
          source: "prompt",
        },
        {
          name: "model",
          description: "Select model",
          argumentHint: "<provider/model>",
          source: "builtin",
        },
        {
          name: "thinking",
          description: "Set thinking level",
          argumentHint: "<off|minimal|low|medium|high|xhigh|max>",
          source: "builtin",
        },
      ]),
    );
    expect(JSON.stringify(config)).not.toContain("secret.example");
    expect(JSON.stringify(config)).not.toContain("/private/");
  });

  it("uses SDK mutations and returns their authoritative clamped config", async () => {
    const nextModel = {
      provider: "local",
      id: "plain",
      name: "Plain",
      reasoning: false,
    };
    const { sdk, fixture, loadResources } = sdkFixture({
      resolvedModel: nextModel,
      availableModels: [nextModel],
    });
    const adapter = await createPiAdapter(sdk, { loadResources });
    const created = await adapter.create("/repo");

    expect(await created.session.setModel("local", "plain")).toMatchObject({
      model: { provider: "local", id: "plain" },
      thinkingLevel: "low",
    });
    expect(await created.session.setThinkingLevel("max")).toMatchObject({
      thinkingLevel: "high",
    });
    expect(fixture.calls).toContainEqual(["setModel", nextModel]);
    expect(fixture.calls).toContainEqual(["setThinkingLevel", "max"]);
  });

  it("exposes active branch entries for trusted Main projection", async () => {
    const { sdk, loadResources } = sdkFixture({});
    const adapter = await createPiAdapter(sdk, { loadResources });
    const created = await adapter.create("/repo");

    await expect(created.session.getEntries()).resolves.toEqual([
      {
        type: "custom",
        id: "todo-entry",
        customType: "pi-todo-state",
        data: { todos: [{ id: "a", step: "Inspect", status: "pending" }] },
      },
    ]);
  });

  it("acknowledges send during prompt preflight and queues follow-ups", async () => {
    const { sdk, fixture, loadResources } = sdkFixture({});
    const adapter = await createPiAdapter(sdk, { loadResources });
    const created = await adapter.create("/repo");
    await created.session.send("first");
    fixture.setStreaming(true);
    await created.session.send("next");
    expect(fixture.calls).toEqual([
      ["prompt", undefined],
      ["prompt", "followUp"],
    ]);
  });
});
