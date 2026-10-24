import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withGitAskpass } from "./gitAskpass.js";

const credentials = { username: "x-access-token", token: "test-token" };

function ask(
  environment: Readonly<Record<string, string>>,
  prompt: string,
): string {
  const helper = environment.GIT_ASKPASS!;
  return execFileSync(
    process.platform === "win32" ? "cmd.exe" : helper,
    process.platform === "win32" ? ["/d", "/c", helper, prompt] : [prompt],
    {
      env: { ...process.env, ...environment },
      encoding: "utf8",
      timeout: 2_000,
    },
  );
}

describe("Git askpass helper", () => {
  it("runs without Node or Electron and removes its private directory after success", async () => {
    let helper = "";
    await expect(
      withGitAskpass(credentials, async (environment) => {
        helper = environment.GIT_ASKPASS!;
        expect(environment.GIT_ASKPASS_REQUIRE).toBe("force");
        expect(environment.SPIRECODE_GIT_USERNAME).toBe(credentials.username);
        expect(environment.SPIRECODE_GIT_TOKEN).toBe(credentials.token);
        const script = await readFile(helper, "utf8");
        expect(script).not.toContain(process.execPath);
        expect(script).not.toContain(credentials.token);
        expect(script).not.toContain(credentials.username);
        if (process.platform !== "win32") {
          expect(script.startsWith("#!/bin/sh\n")).toBe(true);
          expect((await stat(helper)).mode & 0o777).toBe(0o700);
          expect(
            ask(
              { ...environment, PATH: "" },
              "Username for 'https://github.com': ",
            ),
          ).toBe(`${credentials.username}\n`);
          expect(ask(environment, "USERNAME for 'https://github.com': ")).toBe(
            `${credentials.username}\n`,
          );
        }
        expect(
          ask(environment, "Password for 'https://github.com': ").trimEnd(),
        ).toBe(credentials.token);
        return "complete";
      }),
    ).resolves.toBe("complete");
    await expect(stat(path.dirname(helper))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("removes the helper even when Git fails", async () => {
    let helper = "";
    const failure = new Error("Git failed");
    await expect(
      withGitAskpass(credentials, async (environment) => {
        helper = environment.GIT_ASKPASS!;
        throw failure;
      }),
    ).rejects.toBe(failure);
    await expect(stat(path.dirname(helper))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("fails closed when the credential is absent", async () => {
    await withGitAskpass({ ...credentials, token: "" }, async (environment) => {
      expect(() => ask(environment, "Password")).toThrow();
    });
  });

  it.skipIf(process.platform === "win32")(
    "prints metacharacters literally and supplies the GitLab username",
    async () => {
      const token = 'literal $(exit 17); `exit 18` %s " \\ &';
      await withGitAskpass(
        { username: "oauth2", token },
        async (environment) => {
          expect(ask(environment, "Username")).toBe("oauth2\n");
          expect(ask(environment, "Password")).toBe(`${token}\n`);
        },
      );
    },
  );
});
