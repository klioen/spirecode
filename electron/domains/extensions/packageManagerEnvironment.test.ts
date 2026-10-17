import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ensureNpmOnPath } from "./packageManagerEnvironment.js";

describe("ensureNpmOnPath", () => {
  it("keeps PATH unchanged when npm and node are already available", async () => {
    const env: NodeJS.ProcessEnv = { PATH: "/usr/local/bin:/usr/bin" };
    const access = vi.fn(async (candidate: string) => {
      if (
        candidate === "/usr/local/bin/npm" ||
        candidate === "/usr/local/bin/node"
      )
        return;
      throw new Error("missing");
    });

    await ensureNpmOnPath({
      env,
      homeDirectory: "/Users/tester",
      platform: "darwin",
      access,
      readDirectory: vi.fn(),
      executableDirectory: "/Applications/SpireCode.app/Contents/MacOS",
    });

    expect(env.PATH).toBe("/usr/local/bin:/usr/bin");
  });

  it("prepends the newest complete nvm Node bin for Finder-launched apps", async () => {
    const env: NodeJS.ProcessEnv = { PATH: "/usr/bin:/bin" };
    const nvmBin = "/Users/tester/.nvm/versions/node/v24.1.0/bin";
    const access = vi.fn(async (candidate: string) => {
      if (
        candidate === path.join(nvmBin, "npm") ||
        candidate === path.join(nvmBin, "node")
      )
        return;
      throw new Error("missing");
    });

    await ensureNpmOnPath({
      env,
      homeDirectory: "/Users/tester",
      platform: "darwin",
      access,
      readDirectory: vi
        .fn()
        .mockResolvedValue(["v20.12.0", "v24.1.0", "v22.9.0"]),
      executableDirectory: "/Applications/SpireCode.app/Contents/MacOS",
    });

    expect(env.PATH).toBe(`${nvmBin}:/usr/bin:/bin`);
  });

  it("fails with an actionable error when no npm runtime is available", async () => {
    await expect(
      ensureNpmOnPath({
        env: { PATH: "/usr/bin:/bin" },
        homeDirectory: "/Users/tester",
        platform: "darwin",
        access: vi.fn().mockRejectedValue(new Error("missing")),
        readDirectory: vi.fn().mockRejectedValue(new Error("missing")),
        executableDirectory: "/Applications/SpireCode.app/Contents/MacOS",
      }),
    ).rejects.toThrow("npm executable was not found");
  });
});
