import { chmod, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { findProviderExecutable } from "./providerExecutable.js";

describe("hosting CLI discovery", () => {
  it.each(["gh", "glab"] as const)(
    "finds %s in Homebrew with a minimal GUI PATH without executing shell initialization",
    async (executable) => {
      const resolve = vi.fn(async (candidate: string) => {
        if (candidate === `/opt/homebrew/bin/${executable}`) return candidate;
        throw new Error("missing");
      });
      await expect(
        findProviderExecutable(executable, {
          env: { PATH: "/usr/bin:/bin" },
          platform: "darwin",
          resolve,
        }),
      ).resolves.toBe(`/opt/homebrew/bin/${executable}`);
      expect(resolve.mock.calls.map(([candidate]) => candidate)).toEqual([
        `/usr/bin/${executable}`,
        `/bin/${executable}`,
        `/opt/homebrew/bin/${executable}`,
      ]);
    },
  );

  it("preserves configured absolute PATH precedence and skips relative/current-directory entries", async () => {
    const resolve = vi.fn(async (candidate: string) => candidate);
    await expect(
      findProviderExecutable("gh", {
        env: { PATH: ":.:tools:/custom/bin:/opt/homebrew/bin" },
        platform: "darwin",
        resolve,
      }),
    ).resolves.toBe("/custom/bin/gh");
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("finds a Windows install with case-insensitive Path and spaces", async () => {
    const resolve = vi.fn(async (candidate: string) => {
      if (candidate === "C:\\Program Files\\GitHub CLI\\gh.exe")
        return candidate;
      throw new Error("missing");
    });
    await expect(
      findProviderExecutable("gh", {
        env: {
          Path: "C:\\Windows\\System32",
          ProgramFiles: "C:\\Program Files",
        },
        platform: "win32",
        resolve,
        homeDirectory: "C:\\Users\\tester",
      }),
    ).resolves.toBe("C:\\Program Files\\GitHub CLI\\gh.exe");
  });

  it("returns missing when every candidate is rejected", async () => {
    await expect(
      findProviderExecutable("glab", {
        env: { PATH: "" },
        platform: "darwin",
        resolve: async () => {
          throw new Error("unsafe or missing");
        },
      }),
    ).resolves.toBeNull();
  });

  it.skipIf(process.platform === "win32")(
    "rejects world-writable files and directories and non-files",
    async () => {
      const root = await mkdtemp(path.join(tmpdir(), "spire-provider-trust-"));
      try {
        const candidate = path.join(root, "gh");
        await writeFile(candidate, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
        const options = { env: { PATH: root }, platform: "linux" as const };
        await expect(findProviderExecutable("gh", options)).resolves.toBe(
          await realpath(candidate),
        );
        await chmod(candidate, 0o777);
        await expect(findProviderExecutable("gh", options)).resolves.toBeNull();
        await chmod(candidate, 0o755);
        await chmod(root, 0o777);
        await expect(findProviderExecutable("gh", options)).resolves.toBeNull();
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );
});
