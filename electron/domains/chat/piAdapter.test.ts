import { describe, expect, it } from "vitest";
import { createPiAdapter, type PiSdk } from "./piAdapter.js";

function sessionFixture() {
  let streaming = false;
  const calls: unknown[] = [];
  return {
    calls,
    session: {
      sessionId: "s1",
      sessionName: undefined,
      get isStreaming() {
        return streaming;
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
    },
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
  };
  const settings = {
    getDefaultProvider: () => options.defaultProvider,
    getDefaultModel: () => options.defaultModel,
  };
  const manager = {
    buildSessionContext: () => ({ messages: options.existingMessages ?? [] }),
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
    }) => {
      calls.push(["services", input.cwd, input.modelRuntime]);
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
      return { session: fixture.session };
    },
  } as unknown as PiSdk;
  return { sdk, calls, fixture, runtime, manager };
}

describe("piAdapter", () => {
  it("resolves the configured default after extension providers load", async () => {
    const configuredModel = { provider: "traex", id: "gpt-5.6-sol" };
    const { sdk, calls, runtime, manager } = sdkFixture({
      defaultProvider: "traex",
      defaultModel: "gpt-5.6-sol",
      resolvedModel: configuredModel,
    });

    const adapter = await createPiAdapter(sdk);
    await adapter.create("/repo");

    expect(calls).toEqual([
      "runtime",
      ["services", "/repo", runtime],
      ["getModel", "traex", "gpt-5.6-sol"],
      ["hasConfiguredAuth", "traex"],
      ["session", manager, configuredModel],
    ]);
  });

  it("preserves the saved model when opening a session with messages", async () => {
    const { sdk, calls, manager } = sdkFixture({
      existingMessages: [{ role: "user", content: "existing" }],
      defaultProvider: "traex",
      defaultModel: "gpt-5.6-sol",
      resolvedModel: { provider: "traex", id: "gpt-5.6-sol" },
    });

    const adapter = await createPiAdapter(sdk);
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
    const { sdk, calls } = sdkFixture({
      defaultProvider: "traex",
      defaultModel: "missing",
      resolvedModel: undefined,
    });

    const adapter = await createPiAdapter(sdk);
    await expect(adapter.create("/repo")).rejects.toThrow(
      "Configured default model traex/missing is unavailable",
    );
    expect(
      calls.some((call) => Array.isArray(call) && call[0] === "session"),
    ).toBe(false);
  });

  it("acknowledges send during prompt preflight and queues follow-ups", async () => {
    const { sdk, fixture } = sdkFixture({});
    const adapter = await createPiAdapter(sdk);
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
