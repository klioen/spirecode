import { describe, expect, it, vi } from "vitest";
import { bootstrapArkApiKeyFromLoginShell } from "./shellEnvironment.js";

describe("bootstrapArkApiKeyFromLoginShell", () => {
  it("reads ARK_API_KEY from a fixed login zsh command", async () => {
    const env: Record<string, string | undefined> = {
      ARK_API_KEYS: "pool-key-1,pool-key-2",
    };
    const run = vi.fn(async () =>
      Buffer.from(
        "zsh startup noise\n\x1eSPIRECODE_ARK_API_KEY\x1fshell-key\x1e",
      ),
    );

    expect(await bootstrapArkApiKeyFromLoginShell(env, run)).toBe(true);
    expect(run).toHaveBeenCalledWith("/bin/zsh", [
      "-ilc",
      'printf "\\036SPIRECODE_ARK_API_KEY\\037%s\\036" "${ARK_API_KEY-}"',
    ]);
    expect(env.ARK_API_KEY).toBe("shell-key");
    expect(env.ARK_API_KEYS).toBe("pool-key-1,pool-key-2");
  });

  it("does not override an inherited ARK_API_KEY", async () => {
    const env = { ARK_API_KEY: "inherited-key", ARK_API_KEYS: "pool-key" };
    const run = vi.fn();
    expect(await bootstrapArkApiKeyFromLoginShell(env, run)).toBe(false);
    expect(run).not.toHaveBeenCalled();
    expect(env.ARK_API_KEY).toBe("inherited-key");
  });

  it("does not derive ARK_API_KEY from the failover pool", async () => {
    const env: Record<string, string | undefined> = {
      ARK_API_KEYS: "pool-key-1,pool-key-2",
    };
    const run = vi.fn(async () =>
      Buffer.from("\x1eSPIRECODE_ARK_API_KEY\x1f\x1e"),
    );
    expect(await bootstrapArkApiKeyFromLoginShell(env, run)).toBe(false);
    expect(env.ARK_API_KEY).toBeUndefined();
  });

  it("fails closed without exposing shell errors", async () => {
    const env: Record<string, string | undefined> = {};
    const run = vi.fn(async () => {
      throw new Error("private shell output");
    });
    expect(await bootstrapArkApiKeyFromLoginShell(env, run)).toBe(false);
    expect(env.ARK_API_KEY).toBeUndefined();
  });
});
