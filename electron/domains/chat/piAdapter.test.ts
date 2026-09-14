import { describe, expect, it } from "vitest";
import { createPiAdapter, type PiSdk } from "./piAdapter.js";

describe("piAdapter", () => {
  it("shares ModelRuntime and acknowledges send during prompt preflight", async () => {
    const runtime = {};
    const manager = {};
    const calls: unknown[] = [];
    let streaming = false;
    const session = {
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
    };
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
      createAgentSession: async (options: {
        modelRuntime: unknown;
        sessionManager: unknown;
      }) => {
        expect(options).toMatchObject({
          modelRuntime: runtime,
          sessionManager: manager,
        });
        return { session };
      },
    } as unknown as PiSdk;

    const adapter = await createPiAdapter(sdk);
    const created = await adapter.create("/repo");
    await created.session.send("first");
    streaming = true;
    await created.session.send("next");
    expect(calls).toEqual([
      "runtime",
      ["prompt", undefined],
      ["prompt", "followUp"],
    ]);
  });
});
