// @vitest-environment node
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SettingsService } from "./index.js";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "spire-settings-"));
  const cwd = path.join(root, "project");
  const agentDir = path.join(root, "agent");
  const statePath = path.join(root, "state", "extensions.json");
  await Promise.all([
    mkdir(path.join(cwd, ".spirecode", "extensions"), { recursive: true }),
    mkdir(path.join(cwd, ".pi", "extensions"), { recursive: true }),
    mkdir(path.join(agentDir, "extensions"), { recursive: true }),
    mkdir(path.join(root, "package", "extensions"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(
      path.join(cwd, ".spirecode", "extensions", "review.ts"),
      "export default () => {}",
    ),
    writeFile(
      path.join(cwd, ".pi", "extensions", "project.ts"),
      "export default () => {}",
    ),
    writeFile(
      path.join(agentDir, "extensions", "global.ts"),
      "export default () => {}",
    ),
    writeFile(
      path.join(root, "package", "extensions", "one.ts"),
      "export default () => {}",
    ),
    writeFile(
      path.join(root, "package", "extensions", "two.ts"),
      "export default () => {}",
    ),
    writeFile(
      path.join(root, "package", "package.json"),
      JSON.stringify({
        name: "fixture-package",
        version: "1.0.0",
        pi: { extensions: ["./extensions"] },
      }),
    ),
    writeFile(
      path.join(agentDir, "settings.json"),
      JSON.stringify({
        packages: ["../package"],
        extensions: ["./extensions/global.ts"],
      }),
    ),
  ]);
  return { root, cwd, agentDir, statePath };
}

describe("SettingsService", () => {
  it("persists provider-neutral v6 defaults on first launch", async () => {
    const { agentDir, statePath } = await fixture();

    const service = await SettingsService.load(statePath, agentDir);

    await expect(service.language()).resolves.toBe("en");
    await expect(service.memoryConfig()).resolves.toBeNull();
    expect(JSON.parse(await readFile(statePath, "utf8"))).toMatchObject({
      version: 7,
      language: "en",
      memoryConfig: null,
    });
  });

  it("migrates v4 state without changing Memory or synthesizing built-ins", async () => {
    const { agentDir, statePath } = await fixture();
    await mkdir(path.dirname(statePath), { recursive: true });
    const previous = {
      version: 4,
      overrides: { abcdefabcdefabcdefabcdef: false },
      memoryConfig: {
        phase1Provider: "openai",
        phase1ModelId: "gpt-5.6",
        phase1ReasoningEffort: "high",
        phase2Provider: "traex",
        phase2ModelId: "DeepSeek-V4-Flash",
        phase2ReasoningEffort: "medium",
      },
    };
    await writeFile(statePath, JSON.stringify(previous));

    const service = await SettingsService.load(statePath, agentDir);

    await expect(service.language()).resolves.toBe("en");
    expect(JSON.parse(await readFile(statePath, "utf8"))).toMatchObject({
      version: 7,
      language: "en",
      memoryConfig: previous.memoryConfig,
    });
    const catalog = await service.list(
      path.join(path.dirname(agentDir), "project"),
    );
    expect(catalog.map(({ name }) => name)).not.toEqual(
      expect.arrayContaining([
        "pi-web-access",
        "pi-subagents",
        "pi-memory",
        "pi-goal",
        "pi-plan",
        "pi-todo",
      ]),
    );
  });

  it("repairs invalid persisted language and persists language updates", async () => {
    const { agentDir, statePath } = await fixture();
    await mkdir(path.dirname(statePath), { recursive: true });
    await writeFile(
      statePath,
      JSON.stringify({ version: 5, language: "fr", overrides: {} }),
    );
    const service = await SettingsService.load(statePath, agentDir);

    await expect(service.language()).resolves.toBe("en");
    await expect(service.setLanguage("zh-CN")).resolves.toBe("zh-CN");
    await expect(service.language()).resolves.toBe("zh-CN");
    expect(JSON.parse(await readFile(statePath, "utf8"))).toMatchObject({
      version: 7,
      language: "zh-CN",
    });
    await expect(service.setLanguage("fr" as "en")).rejects.toThrow(
      "language is invalid",
    );
    await expect(service.language()).resolves.toBe("zh-CN");
  });

  it("keeps the previous language when an atomic write fails", async () => {
    const { root, agentDir } = await fixture();
    const blockedPath = path.join(root, "blocked", "state.json");
    const blockedService = await SettingsService.load(blockedPath, agentDir);
    await rm(blockedPath);
    await mkdir(blockedPath);

    await expect(blockedService.setLanguage("zh-CN")).rejects.toBeDefined();
    await expect(blockedService.language()).resolves.toBe("en");
  });

  it("persists and reloads the global Memory configuration", async () => {
    const { agentDir, statePath } = await fixture();
    const service = await SettingsService.load(statePath, agentDir);

    await expect(service.memoryConfig()).resolves.toBeNull();
    await expect(
      service.setMemoryConfig(
        "openai",
        "gpt-5.6",
        "high",
        "traex",
        "DeepSeek-V4-Flash",
        "max",
      ),
    ).resolves.toEqual({
      phase1Provider: "openai",
      phase1ModelId: "gpt-5.6",
      phase1ReasoningEffort: "high",
      phase2Provider: "traex",
      phase2ModelId: "DeepSeek-V4-Flash",
      phase2ReasoningEffort: "max",
    });
    expect(JSON.parse(await readFile(statePath, "utf8"))).toMatchObject({
      version: 7,
      memoryConfig: {
        phase1Provider: "openai",
        phase1ModelId: "gpt-5.6",
        phase1ReasoningEffort: "high",
        phase2Provider: "traex",
        phase2ModelId: "DeepSeek-V4-Flash",
        phase2ReasoningEffort: "max",
      },
    });
    await expect(
      (await SettingsService.load(statePath, agentDir)).memoryConfig(),
    ).resolves.toEqual({
      phase1Provider: "openai",
      phase1ModelId: "gpt-5.6",
      phase1ReasoningEffort: "high",
      phase2Provider: "traex",
      phase2ModelId: "DeepSeek-V4-Flash",
      phase2ReasoningEffort: "max",
    });
  });

  it("migrates the legacy single model to both phases", async () => {
    const { agentDir, statePath } = await fixture();
    await mkdir(path.dirname(statePath), { recursive: true });
    await writeFile(
      statePath,
      JSON.stringify({
        version: 2,
        overrides: {},
        memoryConfig: {
          provider: "openai",
          modelId: "gpt-5.6",
          reasoningEffort: "medium",
        },
      }),
    );

    await expect(
      (await SettingsService.load(statePath, agentDir)).memoryConfig(),
    ).resolves.toEqual({
      phase1Provider: "openai",
      phase1ModelId: "gpt-5.6",
      phase1ReasoningEffort: "medium",
      phase2Provider: "openai",
      phase2ModelId: "gpt-5.6",
      phase2ReasoningEffort: "medium",
    });
  });

  it("rejects invalid Memory configuration", async () => {
    const { agentDir, statePath } = await fixture();
    const service = await SettingsService.load(statePath, agentDir);

    await expect(
      service.setMemoryConfig(
        "bad/provider",
        "model",
        "low",
        "traex",
        "model",
        "medium",
      ),
    ).rejects.toThrow("provider is invalid");
    await expect(
      service.setMemoryConfig(
        "traex",
        " model",
        "low",
        "traex",
        "model",
        "medium",
      ),
    ).rejects.toThrow("modelId is invalid");
    await expect(
      service.setMemoryConfig(
        "traex",
        "model\u0085name",
        "low",
        "traex",
        "model",
        "medium",
      ),
    ).rejects.toThrow("modelId is invalid");
    await expect(
      service.setMemoryConfig(
        "traex",
        "model",
        "turbo" as "low",
        "traex",
        "model",
        "medium",
      ),
    ).rejects.toThrow("reasoningEffort is invalid");
  });

  it("surfaces resource resolution failures instead of reporting an empty catalog", async () => {
    const { cwd, agentDir, statePath } = await fixture();
    await writeFile(
      path.join(agentDir, "settings.json"),
      JSON.stringify({ packages: [{ autoload: false }] }),
    );
    const service = await SettingsService.load(statePath, agentDir);

    await expect(service.list(cwd)).rejects.toThrow(
      "packages must contain strings or package declarations",
    );
  });

  it("lists only user-configured Pi extensions", async () => {
    const { cwd, agentDir, statePath } = await fixture();
    const service = await SettingsService.load(statePath, agentDir);

    const catalog = await service.list(cwd);
    const users = catalog.filter(({ kind }) => kind === "user");

    expect(catalog).toHaveLength(users.length);
    expect(users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "fixture-package",
          version: "1.0.0",
          kind: "user",
          source: "package",
          scope: "global",
        }),
        expect.objectContaining({
          name: "fixture-package",
          version: "1.0.0",
          kind: "user",
          source: "package",
          scope: "global",
        }),
      ]),
    );
    expect(users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "global",
          kind: "user",
          source: "pi",
          scope: "global",
        }),
      ]),
    );
    expect(catalog.map(({ name }) => name)).not.toEqual(
      expect.arrayContaining(["review", "project"]),
    );
  });

  it("does not expose project extension symlinks that escape the worktree", async () => {
    const { root, cwd, agentDir, statePath } = await fixture();
    const outside = path.join(root, "outside.ts");
    await writeFile(outside, "export default () => {}");
    await Promise.all([
      symlink(
        outside,
        path.join(cwd, ".spirecode", "extensions", "outside.ts"),
      ),
      symlink(outside, path.join(cwd, ".pi", "extensions", "escaped.ts")),
    ]);
    const service = await SettingsService.load(statePath, agentDir);
    const names = (await service.list(cwd)).map(({ name }) => name);

    expect(names).not.toContain("outside");
    expect(names).not.toContain("escaped");
  });
});
