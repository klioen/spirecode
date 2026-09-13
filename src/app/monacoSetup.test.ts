import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  monaco: { editor: { create: vi.fn() } },
}));

vi.mock("@monaco-editor/react", () => ({
  loader: { config: mocks.config },
}));

vi.mock("monaco-editor", () => mocks.monaco);
vi.mock("./monacoWorkers", () => ({}));

beforeEach(() => {
  vi.resetModules();
  mocks.config.mockClear();
});

describe("Monaco setup", () => {
  it("configures the React loader with the bundled Monaco instance", async () => {
    await import("./monacoSetup");

    expect(mocks.config).toHaveBeenCalledOnce();
    expect(mocks.config).toHaveBeenCalledWith({ monaco: mocks.monaco });
  });
});
